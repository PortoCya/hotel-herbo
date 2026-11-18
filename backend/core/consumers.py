"""
Consumers WebSocket.

- StaffConsumer: painel admin. Recebe "order.created" (alerta sonoro),
  "order.updated", "consumption.changed", "reservation.changed", "room.changed".
- GuestConsumer: app do hóspede. Recebe "stay.updated" sempre que algo do seu
  perfil muda no painel; o app então recarrega /api/me/stay/.
"""
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .realtime import STAFF_GROUP, guest_group


class BaseHerboConsumer(AsyncJsonWebsocketConsumer):
    group_name = None

    async def disconnect(self, code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Heartbeat simples para manter a conexão viva / medir latência.
        if content.get("type") == "ping":
            await self.send_json({"event": "pong"})

    async def herbo_event(self, event):
        await self.send_json(event["payload"])


class StaffConsumer(BaseHerboConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated or not user.is_staff:
            await self.close(code=4401)
            return
        self.group_name = STAFF_GROUP
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "data": {"role": "staff", "user": user.get_username()}})


class GuestConsumer(BaseHerboConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        guest_id = await self._guest_id(user)
        if not guest_id:
            await self.close(code=4403)
            return
        self.group_name = guest_group(guest_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "data": {"role": "guest", "guest_id": guest_id}})

    @database_sync_to_async
    def _guest_id(self, user):
        profile = getattr(user, "guest_profile", None)
        return profile.pk if profile else None
