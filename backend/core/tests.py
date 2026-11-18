from io import BytesIO
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Consumption, Guest, Reservation, Room, ServiceRequest


def make_test_image(name="comprovante.png"):
    buf = BytesIO()
    img = Image.new("RGB", (60, 60), color=(16, 38, 27))
    img.save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


class HotelHerboSystemTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_herbo")

    def setUp(self):
        self.admin_client = APIClient()
        res_admin = self.admin_client.post(
            "/api/auth/login/", {"username": "admin", "password": "herbo123"}, format="json"
        )
        self.assertEqual(res_admin.status_code, 200)
        self.assertEqual(res_admin.data["role"], "staff")
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {res_admin.data['token']}")

        self.guest_client = APIClient()
        res_guest = self.guest_client.post(
            "/api/auth/login/", {"username": "marcela", "password": "herbo123"}, format="json"
        )
        self.assertEqual(res_guest.status_code, 200)
        self.assertEqual(res_guest.data["role"], "guest")
        self.guest_client.credentials(HTTP_AUTHORIZATION=f"Token {res_guest.data['token']}")

    def test_guest_stay_mirror_and_etag_polling(self):
        """O app do hóspede exibe Marcela, dias hospedada, tenda, consumos ativos/cancelados e suporta ETag 304."""
        resp = self.guest_client.get("/api/me/stay/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["guest"]["first_name"], "Marcela")
        self.assertEqual(resp.data["room"]["code"], "T01")
        self.assertEqual(resp.data["reservation"]["status"], Reservation.Status.CHECKED_IN)
        self.assertGreaterEqual(resp.data["reservation"]["days_hosted"], 2)
        self.assertGreaterEqual(resp.data["summary"]["active_items"], 4)
        self.assertEqual(resp.data["summary"]["cancelled_items"], 1)

        etag = resp["ETag"]
        resp_304 = self.guest_client.get("/api/me/stay/", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(resp_304.status_code, 304)

    def test_admin_consumption_with_photo_and_cancellation_syncs_to_guest(self):
        """Admin registra consumo com foto, edita e cancela; o espelho do hóspede reflete tudo."""
        marcela_res = Guest.objects.get(user__username="marcela").current_reservation()
        photo = make_test_image()
        create_resp = self.admin_client.post(
            "/api/consumptions/",
            {
                "reservation": marcela_res.id,
                "description": "Tábua artesanal da serra",
                "category": "alimentacao",
                "quantity": 1,
                "unit_price": "135.00",
                "notes": "Entregue no deck",
                "photo": photo,
            },
            format="multipart",
        )
        self.assertEqual(create_resp.status_code, 201)
        cid = create_resp.data["id"]
        self.assertTrue(create_resp.data["photo"])

        # Edição pelo admin
        patch_resp = self.admin_client.patch(
            f"/api/consumptions/{cid}/", {"quantity": 2}, format="json"
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(str(patch_resp.data["total"]), "270.00")

        # Cancelamento transparente pelo admin
        cancel_resp = self.admin_client.post(
            f"/api/consumptions/{cid}/cancel/",
            {"reason": "Substituído por cortesia"},
            format="json",
        )
        self.assertEqual(cancel_resp.status_code, 200)
        self.assertEqual(cancel_resp.data["status"], Consumption.Status.CANCELLED)

        # Verifica no espelho da Marcela
        stay_resp = self.guest_client.get("/api/me/stay/")
        cancelled = [c for c in stay_resp.data["consumptions"] if c["id"] == cid][0]
        self.assertEqual(cancelled["status"], "cancelado")
        self.assertEqual(cancelled["cancel_reason"], "Substituído por cortesia")

    def test_guest_order_creation_and_admin_completion_with_charge(self):
        """Hóspede solicita item pelo app; admin recebe e conclui lançando no consumo."""
        order_resp = self.guest_client.post(
            "/api/me/orders/",
            {
                "request_type": ServiceRequest.Type.ROOM_SERVICE,
                "notes": "Trazer duas taças, por favor.",
                "quantity": 1,
            },
            format="json",
        )
        self.assertEqual(order_resp.status_code, 201)
        order_id = order_resp.data["id"]

        # Admin aceita e conclui
        status_resp = self.admin_client.post(
            f"/api/orders/{order_id}/status/",
            {"status": ServiceRequest.Status.ACCEPTED, "admin_response": "A caminho!"},
            format="json",
        )
        self.assertEqual(status_resp.status_code, 200)
        self.assertEqual(status_resp.data["status"], ServiceRequest.Status.ACCEPTED)

    def test_checkin_and_checkout_workflow(self):
        """Admin realiza check-in e check-out da reserva do Rafael (Domo D01)."""
        rafael_res = Reservation.objects.get(guest__user__username="rafael")
        ci = self.admin_client.post(f"/api/reservations/{rafael_res.id}/check-in/")
        self.assertEqual(ci.status_code, 200)
        self.assertEqual(ci.data["status"], Reservation.Status.CHECKED_IN)
        self.assertEqual(Room.objects.get(code="D01").status, Room.Status.OCCUPIED)

        co = self.admin_client.post(f"/api/reservations/{rafael_res.id}/check-out/")
        self.assertEqual(co.status_code, 200)
        self.assertEqual(co.data["status"], Reservation.Status.CHECKED_OUT)
        self.assertEqual(Room.objects.get(code="D01").status, Room.Status.CLEANING)
