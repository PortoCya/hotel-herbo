"""
Popula o banco com dados de demonstração do Hotel Herbo.

    python manage.py seed_herbo           # cria se não existir
    python manage.py seed_herbo --reset   # apaga dados operacionais e recria

Logins criados:
    Admin (painel web): admin   / herbo123
    Hóspede (app):      marcela / herbo123
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from rest_framework.authtoken.models import Token

from core import services
from core.models import (
    ActivityLog,
    CatalogItem,
    Consumption,
    Guest,
    Reservation,
    Room,
    ServiceRequest,
)

User = get_user_model()

ROOMS = [
    ("T01", "Tenda Ipê", "suite", 2, "690.00", "Cama king, banheira externa, deck com vista para o vale",
     "Cama king, Banheira externa, Deck privativo, Ar-condicionado, Wi-Fi"),
    ("T02", "Tenda Jatobá", "glamping", 2, "520.00", "Tenda safári clássica à beira da mata",
     "Cama queen, Rede, Lareira, Wi-Fi"),
    ("T03", "Tenda Aroeira", "glamping", 3, "560.00", "Tenda ampla com sofá-cama e varanda",
     "Cama queen, Sofá-cama, Varanda, Wi-Fi"),
    ("T04", "Tenda Buriti", "suite", 2, "720.00", "Suíte romântica com ofurô aquecido",
     "Cama king, Ofurô, Deck privativo, Ar-condicionado"),
    ("D01", "Domo Estrela", "domo", 2, "850.00", "Domo geodésico com teto transparente para observar o céu",
     "Teto panorâmico, Cama king, Telescópio, Ar-condicionado"),
    ("C01", "Cabana Cedro", "cabana", 4, "780.00", "Cabana rústica para famílias e amigos",
     "2 quartos, Lareira, Cozinha compacta, Wi-Fi"),
]

CATALOG = [
    # nome, categoria, tipo de pedido, preço, descrição
    ("Café da manhã na tenda", "alimentacao", "servico_quarto", "89.00", "Cesta com pães artesanais, frutas e café coado"),
    ("Tábua de queijos e frios", "alimentacao", "servico_quarto", "120.00", "Queijos da serra, embutidos, mel e geleias"),
    ("Risoto de cogumelos", "alimentacao", "servico_quarto", "78.00", "Arbóreo com cogumelos frescos e parmesão"),
    ("Vinho tinto da casa", "bebidas", "servico_quarto", "160.00", "Garrafa 750ml — Cabernet Sauvignon"),
    ("Espumante brut", "bebidas", "servico_quarto", "180.00", "Garrafa 750ml"),
    ("Água mineral", "bebidas", "servico_quarto", "8.00", "500ml"),
    ("Kit fogueira com marshmallow", "experiencias", "fogueira", "95.00", "Lenha, acendimento pela equipe e kit s'mores"),
    ("Fogueira privativa (acendimento)", "servicos", "fogueira", "0.00", "Equipe acende a fogueira da sua tenda"),
    ("Massagem relaxante (60 min)", "experiencias", "experiencia", "280.00", "Na sua tenda ou no deck do spa"),
    ("Trilha guiada ao nascer do sol", "experiencias", "experiencia", "150.00", "Saída às 5h30 com café na montanha"),
    ("Jantar à luz de velas", "experiencias", "experiencia", "390.00", "Menu degustação para o casal no deck"),
    ("Limpeza da tenda", "servicos", "limpeza", "0.00", "Arrumação completa e reposição de amenities"),
    ("Troca de toalhas", "servicos", "limpeza", "0.00", "Toalhas limpas entregues na tenda"),
    ("Lavanderia (peça)", "servicos", "limpeza", "15.00", "Lavagem e passagem por peça"),
]


class Command(BaseCommand):
    help = "Cria dados de demonstração (tendas, catálogo, admin e hóspede Marcela)."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Apaga reservas/pedidos/consumos e recria.")

    @transaction.atomic
    def handle(self, *args, **opts):
        if opts["reset"]:
            ActivityLog.objects.all().delete()
            ServiceRequest.objects.all().delete()
            Consumption.objects.all().delete()
            Reservation.objects.all().delete()
            Guest.objects.all().delete()
            User.objects.filter(is_staff=False).delete()
            Room.objects.update(status=Room.Status.AVAILABLE)
            self.stdout.write(self.style.WARNING("Dados operacionais apagados."))

        # Admin
        admin, created = User.objects.get_or_create(
            username="admin", defaults={"is_staff": True, "is_superuser": True, "first_name": "Recepção",
                                        "email": "recepcao@hotelherbo.com.br"}
        )
        if created:
            admin.set_password("herbo123")
            admin.save()
        Token.objects.get_or_create(user=admin)

        # Tendas
        rooms = {}
        for code, name, cat, cap, rate, desc, amen in ROOMS:
            rooms[code], _ = Room.objects.get_or_create(
                code=code, defaults=dict(name=name, category=cat, capacity=cap, nightly_rate=Decimal(rate),
                                         description=desc, amenities=amen)
            )

        # Catálogo
        items = {}
        for name, cat, rtype, price, desc in CATALOG:
            items[name], _ = CatalogItem.objects.get_or_create(
                name=name, defaults=dict(category=cat, request_type=rtype, price=Decimal(price), description=desc)
            )

        # Hóspede Marcela (já hospedada há 2 dias)
        if not User.objects.filter(username="marcela").exists():
            user = User.objects.create_user("marcela", "marcela@email.com", "herbo123", first_name="Marcela")
            Token.objects.get_or_create(user=user)
            marcela = Guest.objects.create(user=user, full_name="Marcela Andrade", phone="(11) 98888-1234",
                                           profile=Guest.Profile.COUPLE,
                                           notes="Aniversário de casamento. Prefere vinho tinto.")
            today = timezone.localdate()
            res = Reservation.objects.create(
                guest=marcela, room=rooms["T01"], check_in_date=today - timedelta(days=2),
                check_out_date=today + timedelta(days=2), adults=2, created_by=admin,
            )
            services.check_in(res, user=admin)
            Reservation.objects.filter(pk=res.pk).update(checked_in_at=timezone.now() - timedelta(days=2))
            res.refresh_from_db()

            def add(item_name, qty=1):
                item = items[item_name]
                c = Consumption.objects.create(reservation=res, catalog_item=item, description=item.name,
                                               category=item.category, quantity=qty, unit_price=item.price,
                                               created_by=admin)
                services.log_consumption_added(c, user=admin)
                return c

            add("Café da manhã na tenda", 2)
            add("Vinho tinto da casa")
            add("Kit fogueira com marshmallow")
            wrong = add("Espumante brut")
            services.cancel_consumption(wrong, reason="Lançado por engano", user=admin)
            add("Água mineral", 4)

            services.create_guest_order(res, user=user, request_type=ServiceRequest.Type.FIRE,
                                        catalog_item=items["Fogueira privativa (acendimento)"],
                                        notes="Por volta das 19h, por favor.")

            # Um hóspede com reserva para hoje (para testar check-in)
            user2 = User.objects.create_user("rafael", "rafael@email.com", "herbo123", first_name="Rafael")
            rafael = Guest.objects.create(user=user2, full_name="Rafael Monteiro", profile=Guest.Profile.URBAN,
                                          phone="(21) 97777-4321")
            Reservation.objects.create(guest=rafael, room=rooms["D01"], check_in_date=today,
                                       check_out_date=today + timedelta(days=3), adults=2, created_by=admin)

        self.stdout.write(self.style.SUCCESS(
            "Pronto! Painel: admin / herbo123  ·  App: marcela / herbo123 (ou rafael / herbo123)"
        ))
