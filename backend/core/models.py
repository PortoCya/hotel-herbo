"""
Modelagem do banco — Hotel Herbo (glamping com serviço de hotel).

Entidades:
    Guest           -> Hóspede (ligado a um usuário Django para login no app)
    Room            -> Tenda / acomodação glamping
    Reservation     -> Reserva (controla check-in / check-out e ocupação)
    CatalogItem     -> Cardápio de produtos, serviços e experiências
    Consumption     -> Consumo lançado pelo admin (com foto opcional)
    ServiceRequest  -> Pedido feito pelo hóspede no app (com foto opcional)
    ActivityLog     -> Histórico transparente de tudo que aconteceu na estadia
"""
import secrets
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import DecimalField, F, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        abstract = True


# ---------------------------------------------------------------------------
# Hóspede
# ---------------------------------------------------------------------------
class Guest(TimeStampedModel):
    class Profile(models.TextChoices):
        URBAN = "urbano", "Profissional urbano"
        COUPLE = "casal", "Casal"
        FAMILY = "familia", "Família"
        OTHER = "outro", "Outro"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="guest_profile"
    )
    full_name = models.CharField("nome completo", max_length=150)
    phone = models.CharField("telefone", max_length=30, blank=True)
    document = models.CharField("CPF / documento", max_length=30, blank=True)
    profile = models.CharField("perfil", max_length=20, choices=Profile.choices, default=Profile.URBAN)
    notes = models.TextField("observações / preferências", blank=True)

    class Meta:
        verbose_name = "hóspede"
        verbose_name_plural = "hóspedes"
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name

    @property
    def first_name(self):
        return (self.full_name or "").split(" ")[0]

    def current_reservation(self):
        """Reserva ativa (hospedado) > próxima reserva > última reserva."""
        qs = self.reservations.select_related("room")
        return (
            qs.filter(status=Reservation.Status.CHECKED_IN).order_by("-checked_in_at").first()
            or qs.filter(status=Reservation.Status.RESERVED).order_by("check_in_date").first()
            or qs.order_by("-check_in_date").first()
        )


# ---------------------------------------------------------------------------
# Tenda / Quarto
# ---------------------------------------------------------------------------
class Room(TimeStampedModel):
    class Status(models.TextChoices):
        AVAILABLE = "disponivel", "Disponível"
        OCCUPIED = "ocupada", "Ocupada"
        CLEANING = "limpeza", "Em limpeza"
        MAINTENANCE = "manutencao", "Manutenção"

    class Category(models.TextChoices):
        GLAMPING = "glamping", "Tenda Glamping"
        SUITE = "suite", "Tenda Suíte Casal"
        DOME = "domo", "Domo Geodésico"
        CABIN = "cabana", "Cabana"

    code = models.CharField("código", max_length=10, unique=True)
    name = models.CharField("nome", max_length=80)
    category = models.CharField("categoria", max_length=20, choices=Category.choices, default=Category.GLAMPING)
    capacity = models.PositiveSmallIntegerField("capacidade", default=2)
    nightly_rate = models.DecimalField("diária (R$)", max_digits=10, decimal_places=2)
    description = models.TextField("descrição", blank=True)
    amenities = models.CharField("comodidades", max_length=255, blank=True, help_text="Separadas por vírgula")
    photo = models.ImageField("foto", upload_to="tendas/", blank=True, null=True)
    status = models.CharField("status", max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    is_active = models.BooleanField("ativa", default=True)

    class Meta:
        verbose_name = "tenda"
        verbose_name_plural = "tendas"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} · {self.name}"

    def current_reservation(self):
        return (
            self.reservations.select_related("guest")
            .filter(status=Reservation.Status.CHECKED_IN)
            .first()
        )


# ---------------------------------------------------------------------------
# Reserva
# ---------------------------------------------------------------------------
def generate_reservation_code():
    while True:
        code = f"HB-{secrets.randbelow(90000) + 10000}"
        if not Reservation.objects.filter(code=code).exists():
            return code


class Reservation(TimeStampedModel):
    class Status(models.TextChoices):
        RESERVED = "reservada", "Reservada"
        CHECKED_IN = "hospedado", "Hospedado (check-in feito)"
        CHECKED_OUT = "finalizada", "Finalizada (check-out feito)"
        CANCELLED = "cancelada", "Cancelada"

    code = models.CharField("código", max_length=12, unique=True, editable=False)
    guest = models.ForeignKey(Guest, on_delete=models.CASCADE, related_name="reservations", verbose_name="hóspede")
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="reservations", verbose_name="tenda")
    check_in_date = models.DateField("check-in previsto")
    check_out_date = models.DateField("check-out previsto")
    adults = models.PositiveSmallIntegerField("adultos", default=2)
    children = models.PositiveSmallIntegerField("crianças", default=0)
    nightly_rate = models.DecimalField(
        "diária contratada (R$)", max_digits=10, decimal_places=2, blank=True, null=True,
        help_text="Se vazio, usa a diária atual da tenda.",
    )
    status = models.CharField("status", max_length=20, choices=Status.choices, default=Status.RESERVED)
    checked_in_at = models.DateTimeField("check-in realizado em", blank=True, null=True)
    checked_out_at = models.DateTimeField("check-out realizado em", blank=True, null=True)
    notes = models.TextField("observações", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        verbose_name = "reserva"
        verbose_name_plural = "reservas"
        ordering = ["-check_in_date", "-created_at"]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["check_in_date", "check_out_date"])]

    def __str__(self):
        return f"{self.code} — {self.guest} ({self.room.code})"

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = generate_reservation_code()
        if self.nightly_rate is None and self.room_id:
            self.nightly_rate = self.room.nightly_rate
        super().save(*args, **kwargs)

    # --- Indicadores exibidos no painel e no app ---------------------------
    @property
    def nights(self):
        return max((self.check_out_date - self.check_in_date).days, 1)

    @property
    def days_hosted(self):
        """Quantos dias o hóspede está (ou esteve) hospedado. Dia do check-in = dia 1."""
        if not self.checked_in_at:
            return 0
        start = timezone.localtime(self.checked_in_at).date()
        end = timezone.localtime(self.checked_out_at).date() if self.checked_out_at else timezone.localdate()
        return max((end - start).days + 1, 1)

    @property
    def days_remaining(self):
        if self.status != self.Status.CHECKED_IN:
            return None
        return max((self.check_out_date - timezone.localdate()).days, 0)

    @property
    def lodging_total(self):
        rate = self.nightly_rate if self.nightly_rate is not None else self.room.nightly_rate
        return (rate or Decimal("0")) * self.nights

    @property
    def consumption_total(self):
        total = self.consumptions.filter(status=Consumption.Status.ACTIVE).aggregate(
            total=Coalesce(
                Sum(F("quantity") * F("unit_price"), output_field=DecimalField(max_digits=12, decimal_places=2)),
                Decimal("0"),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )["total"]
        return total.quantize(Decimal("0.01"))

    @property
    def grand_total(self):
        return self.lodging_total + self.consumption_total


# ---------------------------------------------------------------------------
# Catálogo (cardápio, serviços e experiências)
# ---------------------------------------------------------------------------
class CatalogItem(TimeStampedModel):
    class Category(models.TextChoices):
        FOOD = "alimentacao", "Alimentação"
        DRINK = "bebidas", "Bebidas"
        EXPERIENCE = "experiencias", "Experiências"
        SERVICE = "servicos", "Serviços"
        OTHER = "outros", "Outros"

    name = models.CharField("nome", max_length=120)
    description = models.TextField("descrição", blank=True)
    category = models.CharField("categoria", max_length=20, choices=Category.choices, default=Category.FOOD)
    request_type = models.CharField(
        "tipo de pedido no app", max_length=20, blank=True,
        help_text="Em qual aba de solicitações do app o item aparece (servico_quarto, fogueira, limpeza, experiencia).",
    )
    price = models.DecimalField("preço (R$)", max_digits=10, decimal_places=2, default=Decimal("0"))
    photo = models.ImageField("foto", upload_to="catalogo/", blank=True, null=True)
    is_active = models.BooleanField("ativo", default=True)
    available_for_guests = models.BooleanField("disponível no app", default=True)

    class Meta:
        verbose_name = "item do catálogo"
        verbose_name_plural = "catálogo"
        ordering = ["category", "name"]

    def __str__(self):
        return f"{self.name} (R$ {self.price})"


# ---------------------------------------------------------------------------
# Consumo (lançado/editado pelo admin)
# ---------------------------------------------------------------------------
class Consumption(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "ativo", "Ativo"
        CANCELLED = "cancelado", "Cancelado"

    reservation = models.ForeignKey(
        Reservation, on_delete=models.CASCADE, related_name="consumptions", verbose_name="reserva"
    )
    catalog_item = models.ForeignKey(
        CatalogItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", verbose_name="item do catálogo"
    )
    description = models.CharField("descrição", max_length=150)
    category = models.CharField(
        "categoria", max_length=20, choices=CatalogItem.Category.choices, default=CatalogItem.Category.FOOD
    )
    quantity = models.PositiveIntegerField("quantidade", default=1)
    unit_price = models.DecimalField("valor unitário (R$)", max_digits=10, decimal_places=2)
    photo = models.ImageField("foto / comprovante", upload_to="consumo/%Y/%m/", blank=True, null=True)
    notes = models.CharField("observações", max_length=255, blank=True)
    status = models.CharField("status", max_length=20, choices=Status.choices, default=Status.ACTIVE)
    cancel_reason = models.CharField("motivo do cancelamento", max_length=255, blank=True)
    cancelled_at = models.DateTimeField("cancelado em", blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        verbose_name = "consumo"
        verbose_name_plural = "consumos"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.quantity}x {self.description}"

    @property
    def total(self):
        return (self.unit_price or Decimal("0")) * (self.quantity or 0)


# ---------------------------------------------------------------------------
# Pedido / Solicitação do hóspede (app mobile -> painel admin)
# ---------------------------------------------------------------------------
class ServiceRequest(TimeStampedModel):
    class Type(models.TextChoices):
        ROOM_SERVICE = "servico_quarto", "Serviço de quarto"
        FIRE = "fogueira", "Fogueira"
        CLEANING = "limpeza", "Limpeza"
        EXPERIENCE = "experiencia", "Experiência"
        OTHER = "outro", "Outro"

    class Status(models.TextChoices):
        PENDING = "pendente", "Pendente"
        ACCEPTED = "aceito", "Aceito"
        IN_PROGRESS = "em_andamento", "Em andamento"
        DONE = "concluido", "Concluído"
        CANCELLED = "cancelado", "Cancelado"

    OPEN_STATUSES = (Status.PENDING, Status.ACCEPTED, Status.IN_PROGRESS)

    reservation = models.ForeignKey(
        Reservation, on_delete=models.CASCADE, related_name="orders", verbose_name="reserva"
    )
    request_type = models.CharField("tipo", max_length=20, choices=Type.choices, default=Type.ROOM_SERVICE)
    catalog_item = models.ForeignKey(
        CatalogItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", verbose_name="item"
    )
    quantity = models.PositiveIntegerField("quantidade", default=1)
    title = models.CharField("título", max_length=150, blank=True)
    notes = models.TextField("observações do hóspede", blank=True)
    scheduled_for = models.DateTimeField("agendado para", blank=True, null=True)
    photo = models.ImageField("foto", upload_to="pedidos/%Y/%m/", blank=True, null=True)
    status = models.CharField("status", max_length=20, choices=Status.choices, default=Status.PENDING)
    admin_response = models.CharField("resposta da equipe", max_length=255, blank=True)
    consumption = models.OneToOneField(
        Consumption, on_delete=models.SET_NULL, null=True, blank=True, related_name="order",
        verbose_name="consumo gerado",
    )
    accepted_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        verbose_name = "pedido"
        verbose_name_plural = "pedidos"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"#{self.pk} {self.get_request_type_display()} — {self.reservation.room.code}"

    def save(self, *args, **kwargs):
        if not self.title:
            self.title = self.catalog_item.name if self.catalog_item_id else self.get_request_type_display()
        super().save(*args, **kwargs)

    @property
    def estimated_total(self):
        if self.catalog_item_id:
            return self.catalog_item.price * self.quantity
        return Decimal("0")


# ---------------------------------------------------------------------------
# Histórico de atividades (transparência para o hóspede)
# ---------------------------------------------------------------------------
class ActivityLog(models.Model):
    class Kind(models.TextChoices):
        CHECK_IN = "check_in", "Check-in"
        CHECK_OUT = "check_out", "Check-out"
        RESERVATION = "reserva", "Reserva"
        CONSUMPTION_ADDED = "consumo_adicionado", "Consumo adicionado"
        CONSUMPTION_UPDATED = "consumo_editado", "Consumo editado"
        CONSUMPTION_CANCELLED = "consumo_cancelado", "Consumo cancelado"
        ORDER_CREATED = "pedido_criado", "Pedido criado"
        ORDER_UPDATED = "pedido_atualizado", "Pedido atualizado"
        ORDER_CANCELLED = "pedido_cancelado", "Pedido cancelado"

    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name="activities")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    message = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "atividade"
        verbose_name_plural = "histórico de atividades"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.get_kind_display()}] {self.message}"
