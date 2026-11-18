from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from .models import (
    ActivityLog,
    CatalogItem,
    Consumption,
    Guest,
    Reservation,
    Room,
    ServiceRequest,
)

User = get_user_model()

MONEY = dict(max_digits=12, decimal_places=2, read_only=True)


# ---------------------------------------------------------------------------
# Tendas
# ---------------------------------------------------------------------------
class RoomSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    amenities_list = serializers.SerializerMethodField()
    current_reservation = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id", "code", "name", "category", "category_display", "capacity", "nightly_rate",
            "description", "amenities", "amenities_list", "photo", "status", "status_display",
            "is_active", "current_reservation",
        ]

    def get_amenities_list(self, obj):
        return [a.strip() for a in (obj.amenities or "").split(",") if a.strip()]

    def get_current_reservation(self, obj):
        res = obj.current_reservation()
        if not res:
            return None
        return {
            "id": res.id,
            "code": res.code,
            "guest_name": res.guest.full_name,
            "check_out_date": res.check_out_date,
            "days_hosted": res.days_hosted,
            "pending_orders": res.orders.filter(status__in=ServiceRequest.OPEN_STATUSES).count(),
        }


class RoomMiniSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    amenities_list = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ["id", "code", "name", "category", "category_display", "capacity", "photo", "description",
                  "amenities_list"]

    def get_amenities_list(self, obj):
        return [a.strip() for a in (obj.amenities or "").split(",") if a.strip()]


# ---------------------------------------------------------------------------
# Hóspedes
# ---------------------------------------------------------------------------
class GuestSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username")
    email = serializers.EmailField(source="user.email", required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, min_length=6,
                                     help_text="Senha de acesso ao app do hóspede")
    profile_display = serializers.CharField(source="get_profile_display", read_only=True)
    current_reservation = serializers.SerializerMethodField()

    class Meta:
        model = Guest
        fields = ["id", "full_name", "username", "email", "password", "phone", "document", "profile",
                  "profile_display", "notes", "current_reservation", "created_at"]

    def get_current_reservation(self, obj):
        res = obj.current_reservation()
        return {"id": res.id, "code": res.code, "status": res.status, "room_code": res.room.code} if res else None

    def validate_username(self, value):
        qs = User.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.user_id)
        if qs.exists():
            raise serializers.ValidationError("Este login já está em uso.")
        return value

    def validate(self, attrs):
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Defina uma senha para o hóspede acessar o app."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password")
        user = User.objects.create_user(
            username=user_data["username"],
            email=user_data.get("email", ""),
            password=password,
            first_name=validated_data["full_name"].split(" ")[0],
        )
        Token.objects.get_or_create(user=user)
        return Guest.objects.create(user=user, **validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password", None)
        user = instance.user
        for field in ("username", "email"):
            if field in user_data:
                setattr(user, field, user_data[field])
        if password:
            user.set_password(password)
        user.save()
        return super().update(instance, validated_data)


# ---------------------------------------------------------------------------
# Reservas
# ---------------------------------------------------------------------------
class ReservationSerializer(serializers.ModelSerializer):
    guest_name = serializers.CharField(source="guest.full_name", read_only=True)
    room_code = serializers.CharField(source="room.code", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    nights = serializers.IntegerField(read_only=True)
    days_hosted = serializers.IntegerField(read_only=True)
    days_remaining = serializers.IntegerField(read_only=True, allow_null=True)
    lodging_total = serializers.DecimalField(**MONEY)
    consumption_total = serializers.DecimalField(**MONEY)
    grand_total = serializers.DecimalField(**MONEY)

    class Meta:
        model = Reservation
        fields = [
            "id", "code", "guest", "guest_name", "room", "room_code", "room_name",
            "check_in_date", "check_out_date", "adults", "children", "nightly_rate",
            "status", "status_display", "checked_in_at", "checked_out_at", "notes",
            "nights", "days_hosted", "days_remaining", "lodging_total", "consumption_total", "grand_total",
            "created_at",
        ]
        read_only_fields = ["code", "status", "checked_in_at", "checked_out_at", "created_at"]

    def validate(self, attrs):
        check_in = attrs.get("check_in_date", getattr(self.instance, "check_in_date", None))
        check_out = attrs.get("check_out_date", getattr(self.instance, "check_out_date", None))
        room = attrs.get("room", getattr(self.instance, "room", None))
        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError({"check_out_date": "O check-out deve ser depois do check-in."})
        if room and check_in and check_out:
            overlap = Reservation.objects.filter(
                room=room,
                status__in=[Reservation.Status.RESERVED, Reservation.Status.CHECKED_IN],
                check_in_date__lt=check_out,
                check_out_date__gt=check_in,
            )
            if self.instance:
                overlap = overlap.exclude(pk=self.instance.pk)
            if overlap.exists():
                raise serializers.ValidationError({"room": f"A tenda {room.code} já está reservada nesse período."})
        adults = attrs.get("adults", getattr(self.instance, "adults", 1))
        children = attrs.get("children", getattr(self.instance, "children", 0))
        if room and adults + children > room.capacity:
            raise serializers.ValidationError({"adults": f"Capacidade máxima da tenda: {room.capacity} pessoas."})
        return attrs


# ---------------------------------------------------------------------------
# Catálogo
# ---------------------------------------------------------------------------
class CatalogItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = CatalogItem
        fields = ["id", "name", "description", "category", "category_display", "request_type", "price",
                  "photo", "is_active", "available_for_guests"]


# ---------------------------------------------------------------------------
# Consumo
# ---------------------------------------------------------------------------
class ConsumptionSerializer(serializers.ModelSerializer):
    total = serializers.DecimalField(**MONEY)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    guest_name = serializers.CharField(source="reservation.guest.full_name", read_only=True)
    room_code = serializers.CharField(source="reservation.room.code", read_only=True)
    remove_photo = serializers.BooleanField(write_only=True, required=False, default=False)
    from_order = serializers.SerializerMethodField()

    class Meta:
        model = Consumption
        fields = [
            "id", "reservation", "guest_name", "room_code", "catalog_item", "description", "category",
            "category_display", "quantity", "unit_price", "total", "photo", "remove_photo", "notes",
            "status", "status_display", "cancel_reason", "cancelled_at", "created_by_name", "from_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["status", "cancel_reason", "cancelled_at", "created_at", "updated_at"]
        extra_kwargs = {"description": {"required": False}, "unit_price": {"required": False}}

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else None

    def get_from_order(self, obj):
        order = getattr(obj, "order", None)
        return order.pk if order else None

    def validate(self, attrs):
        reservation = attrs.get("reservation", getattr(self.instance, "reservation", None))
        if self.instance is None and reservation and reservation.status != Reservation.Status.CHECKED_IN:
            raise serializers.ValidationError(
                {"reservation": "Só é possível lançar consumo para hóspedes com check-in ativo."}
            )
        if self.instance and self.instance.status == Consumption.Status.CANCELLED:
            raise serializers.ValidationError("Este consumo foi cancelado e não pode mais ser editado.")
        item = attrs.get("catalog_item")
        if item:  # preenche automaticamente a partir do catálogo
            attrs.setdefault("description", item.name)
            attrs.setdefault("unit_price", item.price)
            attrs.setdefault("category", item.category)
        if self.instance is None:
            if not attrs.get("description"):
                raise serializers.ValidationError({"description": "Informe a descrição ou escolha um item."})
            if attrs.get("unit_price") is None:
                raise serializers.ValidationError({"unit_price": "Informe o valor unitário."})
        return attrs

    def update(self, instance, validated_data):
        if validated_data.pop("remove_photo", False) and "photo" not in validated_data:
            # Apenas desvincula (o arquivo pode estar compartilhado com um pedido).
            instance.photo = None
        return super().update(instance, validated_data)

    def create(self, validated_data):
        validated_data.pop("remove_photo", None)
        return super().create(validated_data)


# ---------------------------------------------------------------------------
# Pedidos
# ---------------------------------------------------------------------------
class OrderSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_request_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    guest_name = serializers.CharField(source="reservation.guest.full_name", read_only=True)
    room_code = serializers.CharField(source="reservation.room.code", read_only=True)
    room_name = serializers.CharField(source="reservation.room.name", read_only=True)
    reservation_code = serializers.CharField(source="reservation.code", read_only=True)
    catalog_item_name = serializers.CharField(source="catalog_item.name", read_only=True, default=None)
    unit_price = serializers.DecimalField(source="catalog_item.price", max_digits=10, decimal_places=2,
                                          read_only=True, default=None)
    estimated_total = serializers.DecimalField(**MONEY)
    charged = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRequest
        fields = [
            "id", "reservation", "reservation_code", "guest_name", "room_code", "room_name",
            "request_type", "type_display", "catalog_item", "catalog_item_name", "unit_price", "quantity",
            "estimated_total", "title", "notes", "scheduled_for", "photo", "status", "status_display",
            "admin_response", "charged", "accepted_at", "completed_at", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_charged(self, obj):
        return obj.consumption_id is not None


class GuestOrderCreateSerializer(serializers.ModelSerializer):
    """Usado pelo app do hóspede para criar uma solicitação."""

    class Meta:
        model = ServiceRequest
        fields = ["request_type", "catalog_item", "quantity", "notes", "scheduled_for", "photo"]

    def validate_catalog_item(self, item):
        if item and (not item.is_active or not item.available_for_guests):
            raise serializers.ValidationError("Item indisponível no momento.")
        return item

    def validate_quantity(self, value):
        if value < 1 or value > 20:
            raise serializers.ValidationError("Quantidade deve estar entre 1 e 20.")
        return value


class OrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ServiceRequest.Status.choices)
    admin_response = serializers.CharField(required=False, allow_blank=True, max_length=255)
    charge = serializers.BooleanField(required=False, default=False,
                                      help_text="Ao concluir, lança o item no consumo do hóspede.")


# ---------------------------------------------------------------------------
# Histórico
# ---------------------------------------------------------------------------
class ActivityLogSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = ActivityLog
        fields = ["id", "kind", "kind_display", "message", "amount", "created_at"]
