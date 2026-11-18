"""
Camada de tempo real: envia eventos para os grupos do Django Channels.

Grupos:
    "staff"            -> todos os painéis admin conectados
    "guest_<guest_id>" -> o(s) app(s) do hóspede logado

Formato da mensagem entregue ao cliente (JSON):
    {"event": "order.created", "data": {...}, "ts": "2026-11-17T22:00:00-03:00"}
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

STAFF_GROUP = "staff"


def guest_group(guest_id):
    return f"guest_{guest_id}"


def _send(group, event, data):
    layer = get_channel_layer()
    if layer is None:
        return
    payload = {"event": event, "data": data or {}, "ts": timezone.localtime().isoformat()}
    try:
        async_to_sync(layer.group_send)(group, {"type": "herbo.event", "payload": payload})
    except Exception:  # nunca derruba a requisição HTTP por falha no WebSocket
        logger.exception("Falha ao enviar evento %s para %s", event, group)


def broadcast(group, event, data=None):
    """
    Envia o evento somente após o commit da transação, garantindo que o cliente
    que recarregar os dados já encontre a versão atualizada no banco.
    `data` pode ser um dict ou uma função (avaliada após o commit).
    """

    def _callback():
        _send(group, event, data() if callable(data) else data)

    transaction.on_commit(_callback)


def notify_staff(event, data=None):
    broadcast(STAFF_GROUP, event, data)


def notify_guest(guest_id, event="stay.updated", data=None):
    if guest_id:
        broadcast(guest_group(guest_id), event, data)
