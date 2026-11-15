from rest_framework.permissions import BasePermission, SAFE_METHODS
from apps.users.models import User, is_superadmin_telegram_id


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
        if getattr(user, "is_superuser", False) or is_superadmin_telegram_id(getattr(user, "telegram_id", None)):
            return True
        phone = getattr(user, "phone_number", None) or getattr(user, "phone", None)
        if not phone:
            return False
        role = (getattr(user, "role", "") or "").lower()
        if role in (User.RoleChoices.ARENDATOR, "owner"):
            return True
        return bool(getattr(user, "is_onboarded", False))


class IsArendatorOnly(BasePermission):
    """
    Allows access strictly to Arendator owners (blocks user / ijarachi drivers).
    Superadmins can access.
    """
    message = "Ushbu bo'lim faqat arendatorlar uchun mo'ljallangan. Ijarachilar uchun ruxsat etilmagan."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False) or is_superadmin_telegram_id(getattr(user, "telegram_id", None)):
            return True
        role = (getattr(user, "role", "") or "").lower()
        if role in (User.RoleChoices.IJARACHI, User.RoleChoices.USER):
            return False
        return role in (User.RoleChoices.ARENDATOR, "owner")


IsArendator = IsArendatorOnly


class IsIjarachiOnly(BasePermission):
    """
    Strictly restricts endpoints to Ijarachi accounts in read-only (SAFE_METHODS) mode.
    Mutating methods (POST, PUT, PATCH, DELETE) are rejected.
    """
    message = "Ushbu bo'lim faqat mijozlar (ijarachilar) uchun faqat ko'rish rejimida mo'ljallangan."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if request.method not in SAFE_METHODS:
            return False
        if getattr(user, "is_superuser", False) or is_superadmin_telegram_id(getattr(user, "telegram_id", None)):
            return True
        role = (getattr(user, "role", "") or "").lower()
        return role in (User.RoleChoices.IJARACHI, User.RoleChoices.USER)


IsIjarachi = IsIjarachiOnly


class IsSuperAdminUser(BasePermission):
    """
    Allows access strictly to verified Superadmins:
    bool(request.user and request.user.is_authenticated and (request.user.is_superuser or request.user.role == 'superadmin'))
    """
    message = "Ushbu bo'lim faqat vakolatli Superadmin uchun mo'ljallangan."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return bool(
            getattr(user, "is_superuser", False)
            or getattr(user, "role", "") == User.RoleChoices.SUPERADMIN
            or getattr(user, "role", "") == "superadmin"
            or is_superadmin_telegram_id(getattr(user, "telegram_id", None))
        )


IsSuperAdmin = IsSuperAdminUser
IsSuperAdminOnly = IsSuperAdminUser


class IsActiveSubscriptionOrTrial(BasePermission):
    """
    Blocks all mutating requests (POST, PUT, PATCH, DELETE) for Arendators
    if is_frozen=True or their subscription (free trial or standart) has expired.
    Read-only (SAFE_METHODS) requests are allowed so the lessor can view existing data.
    Superusers bypass this check.
    """
    message = "Hisobingiz muzlatilgan yoki obuna muddati tugagan. Ushbu amalni bajarish uchun obunani yangilang."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False) or is_superadmin_telegram_id(getattr(user, "telegram_id", None)):
            return True
        if request.method in SAFE_METHODS:
            return True
        owner = getattr(user, "tenant_owner", user)
        if getattr(owner, "is_frozen", False):
            return False
        return bool(getattr(owner, "is_subscription_active", False))

