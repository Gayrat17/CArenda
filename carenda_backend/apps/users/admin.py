from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import PaymentSettings, SubscriptionRequest, User, UserSetting


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


@admin.register(PaymentSettings)
class PaymentSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "standard_plan_price",
        "pro_plan_price",
        "paynet_url",
        "card_number",
        "card_holder",
        "support_telegram",
        "updated_at",
    )
    fieldsets = (
        (
            "Paynet Sozlamalari",
            {
                "fields": (
                    "paynet_url",
                    "paynet_qr_image",
                )
            },
        ),
        (
            "Plastik Karta Sozlamalari",
            {
                "fields": (
                    "card_number",
                    "card_holder",
                )
            },
        ),
        (
            "Tarif Narxlari va Qo'llab-quvvatlash",
            {
                "fields": (
                    "standard_plan_price",
                    "pro_plan_price",
                    "support_telegram",
                )
            },
        ),
    )

    def has_add_permission(self, request):
        return not PaymentSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SubscriptionRequest)
class SubscriptionRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "plan_type",
        "amount",
        "status",
        "created_at",
        "reviewed_at",
    )
    list_filter = ("status", "plan_type", "created_at")
    search_fields = ("user__username", "user__full_name", "user__phone", "note", "admin_note")
    raw_id_fields = ("user",)
    readonly_fields = ("created_at", "reviewed_at")
    actions = ["approve_requests", "reject_requests"]

    @admin.action(description="Tanlangan so'rovlarni tasdiqlash (30 kun faollashtirish)")
    def approve_requests(self, request, queryset):
        from apps.users.services import process_subscription_approval

        count = 0
        for req in queryset.filter(status=SubscriptionRequest.Status.PENDING):
            if process_subscription_approval(req, reviewer_label=f"Admin {request.user.username}"):
                count += 1
        self.message_user(request, f"{count} ta obuna so'rovi tasdiqlandi.")

    @admin.action(description="Tanlangan so'rovlarni rad etish")
    def reject_requests(self, request, queryset):
        from apps.users.services import process_subscription_rejection

        count = 0
        for req in queryset.filter(status=SubscriptionRequest.Status.PENDING):
            if process_subscription_rejection(req, reviewer_label=f"Admin {request.user.username}"):
                count += 1
        self.message_user(request, f"{count} ta obuna so'rovi rad etildi.")
