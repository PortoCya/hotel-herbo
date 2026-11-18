from django.urls import path

from .consumers import GuestConsumer, StaffConsumer

websocket_urlpatterns = [
    path("ws/admin/", StaffConsumer.as_asgi()),
    path("ws/guest/", GuestConsumer.as_asgi()),
]
