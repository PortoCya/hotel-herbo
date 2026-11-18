from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "Hotel Herbo"

    def ready(self):
        # Registra os sinais que disparam eventos em tempo real (WebSocket).
        from . import signals  # noqa: F401
