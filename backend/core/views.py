import hashlib
import json
from decimal import Decimal

from django.contrib.auth import authenticate, get_user_model
from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.utils.encoders import JSONEncoder
from rest_framework.views import APIView

from . import services
from .models import CatalogItem, Consumption, Guest, Reservation, Room, ServiceRequest
from .permissions import IsGuest, IsStaff, IsStaffOrGuestReadOnly
from .serializers import (
    ActivityLogSerializer,
    CatalogItemSerializer,
    ConsumptionSerializer,
    GuestOrderCreateSerializer,
    GuestSerializer,
    OrderSerializer,
    OrderStatusSerializer,
    ReservationSerializer,
    RoomMiniSerializer,
    RoomSerializer,
)

User = get_user_model()


def etag_response(request, data):
    """
    Polling eficiente: devolve ETag com hash do conteúdo. Se o cliente enviar
    If-None-Match igual, responde 304 sem corpo (economiza banda e renderização).
    """
    raw = json.dumps(data, cls=JSONEncoder, sort_keys=True, default=str).encode()
    etag = f'"{hashlib.md5(raw).hexdigest()}"'
    if request.headers.get("If-None-Match") == etag:
        resp = Response(status=status.HTTP_304_NOT_MODIFIED)
    else:
        resp = Response(data)
    resp["ETag"] = etag
    resp["Cache-Control"] = "no-cache"
    return resp


# ---------------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------------
class LoginView(APIView):
    """POST {username, password} -> {token, role, user}. Aceita login por usuário ou e-mail."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        if "@" in username:
            match = User.objects.filter(email__iexact=username).first()
            username = match.username if match else username
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "Usuário ou senha inválidos."}, status=status.HTTP_400_BAD_REQUEST)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, **user_payload(user)})


def user_payload(user):
    guest = getattr(user, "guest_profile", None)
    return {
        "role": "staff" if user.is_staff else ("guest" if guest else "unknown"),
        "user": {
            "id": user.id,
            "username": user.username,
            "name": guest.full_name if guest else (user.get_full_name() or user.username),
            "guest_id": guest.id if guest else None,
        },
    }


class MeView(APIView):
    def get(self, request):
        return Response(user_payload(request.user))


# ---------------------------------------------------------------------------
# Painel Admin
# ---------------------------------------------------------------------------
class DashboardView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        today = timezone.localdate()
        rooms = Room.objects.filter(is_active=True)
        by_status = dict(rooms.values_list("status").annotate(c=Count("id")))
        total = rooms.count()
        occupied = by_status.get(Room.Status.OCCUPIED, 0)
        consumption_today = Consumption.objects.filter(
            status=Consumption.Status.ACTIVE, created_at__date=today
        ).aggregate(
            t=Coalesce(Sum(F("quantity") * F("unit_price"), output_field=DecimalField(max_digits=12, decimal_places=2)),
                       Decimal("0"), output_field=DecimalField(max_digits=12, decimal_places=2))
        )["t"]
        return Response({
            "rooms_total": total,
            "rooms_occupied": occupied,
            "rooms_available": by_status.get(Room.Status.AVAILABLE, 0),
            "rooms_cleaning": by_status.get(Room.Status.CLEANING, 0),
            "rooms_maintenance": by_status.get(Room.Status.MAINTENANCE, 0),
            "occupancy_rate": round(occupied / total * 100) if total else 0,
            "checkins_today": Reservation.objects.filter(status=Reservation.Status.RESERVED, check_in_date=today).count(),
            "checkouts_today": Reservation.objects.filter(status=Reservation.Status.CHECKED_IN, check_out_date__lte=today).count(),
            "guests_in_house": Reservation.objects.filter(status=Reservation.Status.CHECKED_IN).count(),
            "orders_pending": ServiceRequest.objects.filter(status=ServiceRequest.Status.PENDING).count(),
            "orders_open": ServiceRequest.objects.filter(status__in=ServiceRequest.OPEN_STATUSES).count(),
            "consumption_today": consumption_today,
        })


class RoomViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaff]
    serializer_class = RoomSerializer
    queryset = Room.objects.all()

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        room = self.get_object()
        new_status = request.data.get("status")
        if new_status not in Room.Status.values:
            return Response({"detail": "Status inválido."}, status=400)
        if new_status != Room.Status.OCCUPIED and room.current_reservation():
            return Response({"detail": "Faça o check-out antes de liberar esta tenda."}, status=400)
        room.status = new_status
        room.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(room).data)


class GuestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaff]
    serializer_class = GuestSerializer

    def get_queryset(self):
        qs = Guest.objects.select_related("user")
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(full_name__icontains=q) | Q(user__email__icontains=q) | Q(phone__icontains=q))
        return qs


class ReservationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaff]
    serializer_class = ReservationSerializer

    def get_queryset(self):
        qs = Reservation.objects.select_related("guest", "room")
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status__in=params["status"].split(","))
        if params.get("active") == "1":
            qs = qs.filter(status=Reservation.Status.CHECKED_IN)
        if params.get("guest"):
            qs = qs.filter(guest_id=params["guest"])
        return qs

    def perform_create(self, serializer):
        res = serializer.save(created_by=self.request.user)
        services.log_activity(res, "reserva",
                              f"Reserva {res.code} criada para a {res.room.name} "
                              f"({res.check_in_date:%d/%m} a {res.check_out_date:%d/%m}).",
                              user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        res = self.get_object()
        if res.status != Reservation.Status.RESERVED and res.status != Reservation.Status.CANCELLED:
            return Response({"detail": "Reservas com check-in não podem ser excluídas."}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request, pk=None):
        res = services.check_in(self.get_object(), user=request.user)
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=["post"], url_path="check-out")
    def check_out(self, request, pk=None):
        res = services.check_out(self.get_object(), user=request.user)
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        res = services.cancel_reservation(self.get_object(), user=request.user)
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        """Extrato completo da reserva (mesmos dados que o hóspede vê no app)."""
        return Response(build_stay_payload(self.get_object(), request))


class CatalogItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffOrGuestReadOnly]
    serializer_class = CatalogItemSerializer

    def get_queryset(self):
        qs = CatalogItem.objects.all()
        if not self.request.user.is_staff:
            qs = qs.filter(is_active=True, available_for_guests=True)
        rtype = self.request.query_params.get("request_type")
        if rtype:
            qs = qs.filter(request_type=rtype)
        return qs


class ConsumptionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                         mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    Consumos não são excluídos: são CANCELADOS, para que o hóspede veja o
    histórico transparente do que foi adicionado e removido.
    """

    permission_classes = [IsStaff]
    serializer_class = ConsumptionSerializer

    def get_queryset(self):
        qs = Consumption.objects.select_related("reservation__guest", "reservation__room", "created_by", "order")
        reservation = self.request.query_params.get("reservation")
        if reservation:
            qs = qs.filter(reservation_id=reservation)
        return qs

    def perform_create(self, serializer):
        consumption = serializer.save(created_by=self.request.user)
        services.log_consumption_added(consumption, user=self.request.user)

    def perform_update(self, serializer):
        inst = serializer.instance
        before = {"description": inst.description, "quantity": inst.quantity, "unit_price": inst.unit_price,
                  "photo": inst.photo.name if inst.photo else ""}
        consumption = serializer.save()
        services.log_consumption_updated(before, consumption, user=self.request.user)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        consumption = services.cancel_consumption(
            self.get_object(), reason=request.data.get("reason", ""), user=request.user
        )
        return Response(self.get_serializer(consumption).data)


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    """Central de pedidos do painel admin."""

    permission_classes = [IsStaff]
    serializer_class = OrderSerializer

    def get_queryset(self):
        qs = ServiceRequest.objects.select_related("reservation__guest", "reservation__room", "catalog_item")
        st = self.request.query_params.get("status")
        if st == "open":
            qs = qs.filter(status__in=ServiceRequest.OPEN_STATUSES)
        elif st:
            qs = qs.filter(status__in=st.split(","))
        if self.request.query_params.get("today") == "1":
            qs = qs.filter(created_at__date=timezone.localdate())
        return qs

    def list(self, request, *args, **kwargs):
        data = self.get_serializer(self.get_queryset()[:200], many=True).data
        return etag_response(request, data)

    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        payload = OrderStatusSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order = services.change_order_status(self.get_object(), user=request.user, **payload.validated_data)
        return Response(self.get_serializer(order).data)


# ---------------------------------------------------------------------------
# App do Hóspede
# ---------------------------------------------------------------------------
def build_stay_payload(reservation, request):
    ctx = {"request": request}
    if reservation is None:
        return {"reservation": None, "room": None, "consumptions": [], "activities": [], "orders": [],
                "summary": None}
    consumptions = reservation.consumptions.select_related("created_by", "order").all()
    active = [c for c in consumptions if c.status == Consumption.Status.ACTIVE]
    orders = reservation.orders.select_related("catalog_item", "reservation__room", "reservation__guest")[:50]
    return {
        "reservation": ReservationSerializer(reservation, context=ctx).data,
        "room": RoomMiniSerializer(reservation.room, context=ctx).data,
        "consumptions": ConsumptionSerializer(consumptions, many=True, context=ctx).data,
        "activities": ActivityLogSerializer(reservation.activities.all()[:100], many=True).data,
        "orders": OrderSerializer(orders, many=True, context=ctx).data,
        "summary": {
            "lodging_total": reservation.lodging_total,
            "consumption_total": reservation.consumption_total,
            "grand_total": reservation.grand_total,
            "active_items": len(active),
            "cancelled_items": len(consumptions) - len(active),
            "open_orders": reservation.orders.filter(status__in=ServiceRequest.OPEN_STATUSES).count(),
        },
    }


class MyStayView(APIView):
    """Espelho do painel admin para o hóspede logado (com suporte a ETag/304)."""

    permission_classes = [IsGuest]

    def get(self, request):
        guest = request.user.guest_profile
        reservation = guest.current_reservation()
        data = {
            "guest": {"id": guest.id, "full_name": guest.full_name, "first_name": guest.first_name},
            **build_stay_payload(reservation, request),
        }
        return etag_response(request, data)


class MyOrdersView(APIView):
    permission_classes = [IsGuest]

    def get(self, request):
        guest = request.user.guest_profile
        qs = ServiceRequest.objects.filter(reservation__guest=guest).select_related(
            "catalog_item", "reservation__room", "reservation__guest"
        )[:50]
        return Response(OrderSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        guest = request.user.guest_profile
        reservation = guest.reservations.filter(status=Reservation.Status.CHECKED_IN).first()
        if not reservation:
            return Response({"detail": "Solicitações ficam disponíveis após o check-in."}, status=400)
        serializer = GuestOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.create_guest_order(reservation, user=request.user, **serializer.validated_data)
        return Response(OrderSerializer(order, context={"request": request}).data, status=201)


class MyOrderCancelView(APIView):
    permission_classes = [IsGuest]

    def post(self, request, pk):
        order = get_object_or_404(ServiceRequest, pk=pk, reservation__guest=request.user.guest_profile)
        order = services.guest_cancel_order(order, user=request.user)
        return Response(OrderSerializer(order, context={"request": request}).data)
