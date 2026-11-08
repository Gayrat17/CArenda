from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User, UserSetting


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "id",
        "username",
        "full_name",
        "role",
        "tenant_code",
        "is_registered",
        "parent_owner",
        "phone",
        "telegram_id",
        "plan",
        "cars_limit",
        "expires_at",
        "is_subscription_active",
        "is_active",
    )
    list_filter = ("role", "is_registered", "plan", "is_active", "is_staff", "is_superuser")
    search_fields = ("username", "full_name", "phone", "tenant_code", "telegram_id", "email")
    ordering = ("-id",)
    raw_id_fields = ("parent_owner",)

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (
            "Personal info",
            {
                "fields": (
                    "full_name",
                    "first_name",
                    "last_name",
                    "email",
                    "phone",
                    "telegram_id",
                )
            },
        ),
        (
            "Carenda Role & Multi-Tenancy",
            {"fields": ("role", "tenant_code", "is_registered", "parent_owner")},
        ),
        (
            "Carenda SaaS Subscription",
            {"fields": ("plan", "cars_limit", "expires_at")},
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )


@admin.register(UserSetting)
class UserSettingAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "default_annual_percent")
    search_fields = ("owner__username", "owner__full_name", "owner__phone")
    raw_id_fields = ("owner",)
