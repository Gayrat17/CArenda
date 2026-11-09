from rest_framework.permissions import BasePermission
from apps.users.models import User


class IsOnboarded(BasePermission):
    """
    Blocks API access if user has not completed onboarding (is_onboarded=False)
    or has not provided/confirmed their phone number.
    Superusers and Superadmins bypass this check.
    """
    message = "Iltimos, avval ro'yxatdan o'tish (onboarding) jarayonini yakunlang."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False) or getattr(user, "role", "") == User.RoleChoices.SUPERADMIN:
            return True
        phone = getattr(user, "phone_number", None) or getattr(user, "phone", None)
        return bool(getattr(user, "is_onboarded", False) and phone)


class IsArendator(BasePermission):
    """
    Allows access only to Arendator owners or superadmins (blocks user / ijarachi drivers).
    """
    message = "Ushbu bo'lim faqat arendatorlar uchun mo'ljallangan. Ijarachilar uchun ruxsat etilmagan."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False) or getattr(user, "role", "") == User.RoleChoices.SUPERADMIN:
            return True
        role = (getattr(user, "role", "") or "").lower()
        if role in (User.RoleChoices.IJARACHI, User.RoleChoices.USER):
            return False
        return role in (User.RoleChoices.ARENDATOR, "owner")


class IsIjarachi(BasePermission):
    """
    Allows access only to Ijarachi (client/lessee) accounts.
    """
    message = "Ushbu bo'lim faqat mijozlar (ijarachilar) uchun mo'ljallangan."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False):
            return True
        role = (getattr(user, "role", "") or "").lower()
        return role in (User.RoleChoices.IJARACHI, User.RoleChoices.USER)
