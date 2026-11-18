"""
Autenticação de WebSocket via token DRF na query string:
    ws://<host>:8000/ws/admin/?token=<token>
    ws://<host>:8000/ws/guest/?token=<token>
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def get_user_for_token(key):
    from rest_framework.authtoken.models import Token

    try:
        return Token.objects.select_related("user").get(key=key).user
    except Token.DoesNotExist:
        return AnonymousUser()


class TokenAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())
        token = (query.get("token") or [None])[0]
        scope["user"] = await get_user_for_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
