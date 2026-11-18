from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsStaff(BasePermission):
    """Equipe do hotel (painel admin web)."""

    message = "Acesso restrito à equipe do Hotel Herbo."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsGuest(BasePermission):
    """Hóspede com perfil cadastrado (app mobile)."""

    message = "Acesso restrito a hóspedes."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and hasattr(user, "guest_profile"))


class IsStaffOrGuestReadOnly(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_staff:
            return True
        return request.method in SAFE_METHODS and hasattr(user, "guest_profile")
