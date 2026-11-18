"""
Sinais que mantêm painel admin e app do hóspede sincronizados.
Qualquer alteração (via API ou via /django-admin) gera um evento WebSocket.
"""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Consumption, Reservation, Room, ServiceRequest
from .realtime import notify_guest, notify_staff


@receiver(post_save, sender=ServiceRequest)
def order_saved(sender, instance, created, **kwargs):
    from .serializers import OrderSerializer

    order_id = instance.pk

    def payload():
        order = ServiceRequest.objects.select_related("reservation__guest", "reservation__room", "catalog_item").get(
            pk=order_id
        )
        return OrderSerializer(order).data

    # "order.created" é o evento que dispara o ALERTA SONORO no painel admin.
    notify_staff("order.created" if created else "order.updated", payload)
    notify_guest(instance.reservation.guest_id, "stay.updated", {"reason": "order", "order_id": order_id})


@receiver([post_save, post_delete], sender=Consumption)
def consumption_changed(sender, instance, **kwargs):
    data = {"reservation_id": instance.reservation_id, "consumption_id": instance.pk}
    notify_staff("consumption.changed", data)
    notify_guest(instance.reservation.guest_id, "stay.updated", {"reason": "consumption", **data})


@receiver([post_save, post_delete], sender=Reservation)
def reservation_changed(sender, instance, **kwargs):
    data = {"reservation_id": instance.pk, "status": instance.status, "room_id": instance.room_id}
    notify_staff("reservation.changed", data)
    notify_guest(instance.guest_id, "stay.updated", {"reason": "reservation", **data})


@receiver(post_save, sender=Room)
def room_changed(sender, instance, **kwargs):
    notify_staff("room.changed", {"room_id": instance.pk, "status": instance.status})
