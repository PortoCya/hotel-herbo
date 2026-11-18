"""
Regras de negócio centralizadas (check-in/out, consumo, pedidos, histórico).
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import ActivityLog, Consumption, Reservation, Room, ServiceRequest


def brl(value):
    value = Decimal(value or 0).quantize(Decimal("0.01"))
    inteiro, centavos = f"{value:.2f}".split(".")
    inteiro = f"{int(inteiro):,}".replace(",", ".")
    return f"R$ {inteiro},{centavos}"


def log_activity(reservation, kind, message, amount=None, user=None):
    return ActivityLog.objects.create(
        reservation=reservation, kind=kind, message=message[:255], amount=amount, created_by=user
    )


# ---------------------------------------------------------------------------
# Check-in / Check-out
# ---------------------------------------------------------------------------
@transaction.atomic
def check_in(reservation: Reservation, user=None):
    reservation = Reservation.objects.select_for_update().select_related("room", "guest").get(pk=reservation.pk)
    if reservation.status != Reservation.Status.RESERVED:
        raise ValidationError(f"Check-in indisponível: reserva está '{reservation.get_status_display()}'.")
    room = reservation.room
    if room.status == Room.Status.MAINTENANCE:
        raise ValidationError(f"A tenda {room.code} está em manutenção.")
    if room.reservations.filter(status=Reservation.Status.CHECKED_IN).exclude(pk=reservation.pk).exists():
        raise ValidationError(f"A tenda {room.code} ainda está ocupada por outro hóspede.")

    reservation.status = Reservation.Status.CHECKED_IN
    reservation.checked_in_at = timezone.now()
    reservation.save(update_fields=["status", "checked_in_at", "updated_at"])
    room.status = Room.Status.OCCUPIED
    room.save(update_fields=["status", "updated_at"])
    log_activity(reservation, ActivityLog.Kind.CHECK_IN,
                 f"Check-in realizado na {room.name}. Bem-vindo(a) ao Hotel Herbo!", user=user)
    return reservation


@transaction.atomic
def check_out(reservation: Reservation, user=None):
    reservation = Reservation.objects.select_for_update().select_related("room").get(pk=reservation.pk)
    if reservation.status != Reservation.Status.CHECKED_IN:
        raise ValidationError("Check-out só é possível para hóspedes com check-in ativo.")

    # Pedidos em aberto são encerrados automaticamente.
    for order in reservation.orders.filter(status__in=ServiceRequest.OPEN_STATUSES):
        order.status = ServiceRequest.Status.CANCELLED
        order.admin_response = "Encerrado automaticamente no check-out."
        order.save(update_fields=["status", "admin_response", "updated_at"])

    reservation.status = Reservation.Status.CHECKED_OUT
    reservation.checked_out_at = timezone.now()
    reservation.save(update_fields=["status", "checked_out_at", "updated_at"])
    room = reservation.room
    room.status = Room.Status.CLEANING
    room.save(update_fields=["status", "updated_at"])
    log_activity(reservation, ActivityLog.Kind.CHECK_OUT,
                 f"Check-out realizado. Total da estadia: {brl(reservation.grand_total)}.",
                 amount=reservation.grand_total, user=user)
    return reservation


@transaction.atomic
def cancel_reservation(reservation: Reservation, user=None):
    if reservation.status != Reservation.Status.RESERVED:
        raise ValidationError("Apenas reservas ainda não iniciadas podem ser canceladas.")
    reservation.status = Reservation.Status.CANCELLED
    reservation.save(update_fields=["status", "updated_at"])
    log_activity(reservation, ActivityLog.Kind.RESERVATION, "Reserva cancelada.", user=user)
    return reservation


# ---------------------------------------------------------------------------
# Consumo
# ---------------------------------------------------------------------------
def log_consumption_added(consumption: Consumption, user=None):
    log_activity(
        consumption.reservation, ActivityLog.Kind.CONSUMPTION_ADDED,
        f"Adicionado: {consumption.quantity}x {consumption.description} ({brl(consumption.total)})",
        amount=consumption.total, user=user,
    )


def log_consumption_updated(before: dict, consumption: Consumption, user=None):
    changes = []
    if before["description"] != consumption.description:
        changes.append(f"'{before['description']}' → '{consumption.description}'")
    if before["quantity"] != consumption.quantity:
        changes.append(f"qtd {before['quantity']} → {consumption.quantity}")
    if before["unit_price"] != consumption.unit_price:
        changes.append(f"valor {brl(before['unit_price'])} → {brl(consumption.unit_price)}")
    if before["photo"] != (consumption.photo.name if consumption.photo else ""):
        changes.append("foto atualizada")
    detail = "; ".join(changes) or "dados atualizados"
    log_activity(
        consumption.reservation, ActivityLog.Kind.CONSUMPTION_UPDATED,
        f"Editado: {consumption.description} — {detail}. Novo total: {brl(consumption.total)}",
        amount=consumption.total, user=user,
    )


@transaction.atomic
def cancel_consumption(consumption: Consumption, reason="", user=None):
    if consumption.status == Consumption.Status.CANCELLED:
        raise ValidationError("Este consumo já está cancelado.")
    consumption.status = Consumption.Status.CANCELLED
    consumption.cancel_reason = reason or ""
    consumption.cancelled_at = timezone.now()
    consumption.save(update_fields=["status", "cancel_reason", "cancelled_at", "updated_at"])
    msg = f"Cancelado: {consumption.quantity}x {consumption.description} (−{brl(consumption.total)})"
    if reason:
        msg += f" · Motivo: {reason}"
    log_activity(consumption.reservation, ActivityLog.Kind.CONSUMPTION_CANCELLED, msg,
                 amount=-consumption.total, user=user)
    return consumption


# ---------------------------------------------------------------------------
# Pedidos
# ---------------------------------------------------------------------------
@transaction.atomic
def create_guest_order(reservation: Reservation, user=None, **data):
    if reservation.status != Reservation.Status.CHECKED_IN:
        raise ValidationError("Solicitações ficam disponíveis após o check-in.")
    order = ServiceRequest.objects.create(reservation=reservation, **data)
    log_activity(reservation, ActivityLog.Kind.ORDER_CREATED,
                 f"Solicitação enviada: {order.title}" + (f" ({order.quantity}x)" if order.quantity > 1 else ""),
                 user=user)
    return order


ALLOWED_TRANSITIONS = {
    ServiceRequest.Status.PENDING: {ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.IN_PROGRESS,
                                    ServiceRequest.Status.DONE, ServiceRequest.Status.CANCELLED},
    ServiceRequest.Status.ACCEPTED: {ServiceRequest.Status.IN_PROGRESS, ServiceRequest.Status.DONE,
                                     ServiceRequest.Status.CANCELLED},
    ServiceRequest.Status.IN_PROGRESS: {ServiceRequest.Status.DONE, ServiceRequest.Status.CANCELLED},
}


@transaction.atomic
def change_order_status(order: ServiceRequest, status, admin_response=None, charge=False, user=None):
    order = ServiceRequest.objects.select_for_update().select_related("reservation", "catalog_item").get(pk=order.pk)
    if status != order.status and status not in ALLOWED_TRANSITIONS.get(order.status, set()):
        raise ValidationError(f"Não é possível mudar de '{order.get_status_display()}' para '{status}'.")

    now = timezone.now()
    order.status = status
    if admin_response is not None:
        order.admin_response = admin_response
    if status in (ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.IN_PROGRESS) and not order.accepted_at:
        order.accepted_at = now
    if status == ServiceRequest.Status.DONE:
        order.completed_at = now
        if charge and order.catalog_item and order.catalog_item.price > 0 and not order.consumption_id:
            consumption = Consumption.objects.create(
                reservation=order.reservation,
                catalog_item=order.catalog_item,
                description=order.catalog_item.name,
                category=order.catalog_item.category,
                quantity=order.quantity,
                unit_price=order.catalog_item.price,
                photo=order.photo.name if order.photo else None,
                notes=f"Gerado a partir do pedido #{order.pk}",
                created_by=user,
            )
            order.consumption = consumption
            log_consumption_added(consumption, user=user)
    order.save()

    kind = ActivityLog.Kind.ORDER_CANCELLED if status == ServiceRequest.Status.CANCELLED else ActivityLog.Kind.ORDER_UPDATED
    message = f"Pedido '{order.title}': {order.get_status_display()}"
    if order.admin_response:
        message += f" — {order.admin_response}"
    log_activity(order.reservation, kind, message, user=user)
    return order


@transaction.atomic
def guest_cancel_order(order: ServiceRequest, user=None):
    if order.status != ServiceRequest.Status.PENDING:
        raise ValidationError("Só é possível cancelar pedidos que ainda não foram aceitos pela equipe.")
    order.status = ServiceRequest.Status.CANCELLED
    order.admin_response = "Cancelado pelo hóspede."
    order.save(update_fields=["status", "admin_response", "updated_at"])
    log_activity(order.reservation, ActivityLog.Kind.ORDER_CANCELLED,
                 f"Você cancelou a solicitação '{order.title}'.", user=user)
    return order
