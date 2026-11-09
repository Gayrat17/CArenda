from datetime import timedelta
from decimal import Decimal
import random
import string

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


def get_default_expires_at():
    return timezone.now() + timedelta(days=60)


def generate_unique_tenant_code() -> str:
    from apps.users.models import User
    while True:
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        code = f"AR-{suffix}"
        if not User.objects.filter(tenant_code=code).exists():
            return code


class User(AbstractUser):
    class Plan(models.TextChoices):
        FREE = "free", "Free"
        STANDARD = "standard", "Standart"
        # Backward compatibility aliases
        TRIAL = "trial", "Free"
        BASIC = "basic", "Standart"
        PRO = "pro", "Standart"

    class RoleChoices(models.TextChoices):
        SUPERADMIN = "superadmin", "Super Admin"
        ARENDATOR = "arendator", "Arendator"
        IJARACHI = "ijarachi", "Ijarachi (Mijoz)"
        USER = "user", "Foydalanuvchi (Ijarachi)"

    RoleChoices.OWNER = RoleChoices.ARENDATOR

    role = models.CharField(
        max_length=20,
        choices=RoleChoices.choices,
        default=RoleChoices.ARENDATOR,
        verbose_name="Foydalanuvchi roli",
    )
    parent_owner = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sub_users",
        help_text="If role is user (driver), points to the Arendator owner",
        verbose_name="Arendator rahbari",
    )
    linked_arendator = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ijarachilar",
        help_text="Points to the linked Arendator if role is ijarachi/client",
        verbose_name="Bog'langan Arendator",
    )
    tenant_code = models.CharField(
        max_length=12,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Unique code for Arendator, e.g. AR-4829",
        verbose_name="Arendator maxsus kodi",
    )
    invite_code = models.CharField(
        max_length=12,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Unique invite code for Arendator",
        verbose_name="Arendator taklif kodi",
    )
    is_registered = models.BooleanField(
        default=False,
        verbose_name="Ro'yxatdan o'tgan",
        help_text="True only after phone verification in Telegram Bot",
    )
    is_onboarded = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Onboarding yakunlangan",
        help_text="True faqat rol tanlanib, telefon tasdiqlangandan so'ng",
    )
    is_frozen = models.BooleanField(
        default=False,
        verbose_name="Muzlatilgan (Frozen)",
        help_text="Superadmin tomonidan muzlatilgan yoki to'lov qilinmagan",
    )
    telegram_id = models.BigIntegerField(
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        verbose_name="Telegram ID",
    )
    full_name = models.CharField(
        max_length=150,
        blank=True,
        verbose_name="Full Name",
    )
    phone = models.CharField(
        max_length=25,
        blank=True,
        verbose_name="Phone Number",
    )
    phone_number = models.CharField(
        max_length=25,
        blank=True,
        default="",
        verbose_name="Telefon raqam",
    )
    plan = models.CharField(
        max_length=20,
        choices=Plan.choices,
        default=Plan.FREE,
        verbose_name="Subscription Plan",
    )
    cars_limit = models.PositiveIntegerField(
        default=3,
        verbose_name="Cars Limit",
    )
    trial_ends_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Free Trial Ends At",
    )
    subscription_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Paid Subscription Expires At",
    )
    expires_at = models.DateTimeField(
        default=get_default_expires_at,
        verbose_name="Subscription Expires At",
    )

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        indexes = [
            models.Index(fields=["role", "is_registered"]),
            models.Index(fields=["parent_owner", "role"]),
        ]

    def save(self, *args, **kwargs):
        if self.role:
            self.role = self.role.lower()
        # Auto-generate unique tenant_code / invite_code ONLY for arendator if not set
        if self.role == self.RoleChoices.ARENDATOR:
            if not self.tenant_code:
                while True:
                    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
                    code = f"AR-{suffix}"
                    if not User.objects.filter(tenant_code=code).exclude(pk=self.pk).exists():
                        self.tenant_code = code
                        break
            if not self.invite_code:
                self.invite_code = self.tenant_code
        elif self.role not in (self.RoleChoices.ARENDATOR, "owner") and self.tenant_code:
            self.tenant_code = None
            self.invite_code = None

        # Keep phone and phone_number in sync
        if self.phone and not self.phone_number:
            self.phone_number = self.phone
        elif self.phone_number and not self.phone:
            self.phone = self.phone_number

        # Keep is_registered and is_onboarded in sync
        if self.is_registered and not self.is_onboarded and (self.phone or self.phone_number):
            self.is_onboarded = True
        elif self.is_onboarded and not self.is_registered:
            self.is_registered = True
        if self.is_superuser or self.role == self.RoleChoices.SUPERADMIN:
            self.is_onboarded = True
            self.is_registered = True

        # Free tier trial period calculation (60 days)
        if not self.trial_ends_at:
            base_date = self.date_joined if self.date_joined else timezone.now()
            self.trial_ends_at = base_date + timedelta(days=60)

        # Do not overwrite self.expires_at if already set
        if not self.expires_at:
            if self.plan in (self.Plan.STANDARD, self.Plan.BASIC, self.Plan.PRO) and self.subscription_expires_at:
                self.expires_at = self.subscription_expires_at
            else:
                self.expires_at = self.subscription_expires_at or self.trial_ends_at

        if self.expires_at and self.trial_ends_at and self.expires_at < self.trial_ends_at:
            if (self.plan or "free").lower() in ("free", "trial"):
                self.trial_ends_at = self.expires_at

        super().save(*args, **kwargs)

    @property
    def tenant_owner(self):
        """
        Returns the tenant owner for row-level multi-tenancy.
        If user is an ijarachi/driver with parent_owner or linked_arendator, returns that arendator.
        Otherwise, returns self.
        """
        if self.role in (self.RoleChoices.USER, self.RoleChoices.IJARACHI):
            return self.linked_arendator or self.parent_owner or self
        return self

    @property
    def is_superadmin(self) -> bool:
        return bool(self.role == self.RoleChoices.SUPERADMIN or self.is_superuser)

    @property
    def is_arendator(self) -> bool:
        return bool(self.role == self.RoleChoices.ARENDATOR)

    @property
    def is_owner(self) -> bool:
        return self.is_arendator

    @property
    def is_ijarachi(self) -> bool:
        return bool(self.role in (self.RoleChoices.IJARACHI, self.RoleChoices.USER))

    @property
    def is_user(self) -> bool:
        return bool(self.role in (self.RoleChoices.USER, self.RoleChoices.IJARACHI))

    @property
    def is_subscription_active(self) -> bool:
        owner = self.tenant_owner
        if owner.is_frozen or not owner.is_active:
            return False
        now = timezone.now()
        if not owner.expires_at or owner.expires_at < now:
            return False
        if owner.trial_ends_at and now > owner.trial_ends_at:
            return False
        if owner.subscription_expires_at and now > owner.subscription_expires_at:
            return False
        return True

    def check_can_create_contract(self) -> tuple[bool, str]:
        owner = self.tenant_owner
        now = timezone.now()
        sub_settings = SubscriptionSettings.get_settings()

        if owner.is_frozen:
            return False, "Hisobingiz muzlatilgan. Iltimos, administrator bilan bog'laning yoki to'lovni amalga oshiring."

        if not owner.is_subscription_active:
            p = (owner.plan or "free").lower()
            if p in ("free", "trial"):
                return (
                    False,
                    "Free tarif limiti tugadi (maksimum 3 ta shartnoma yoki 2 oylik muddat). Davom etish uchun Standart tarifga o'ting.",
                )
            return False, "Standart tarif obuna muddati tugagan. Davom etish uchun Standart tarifga o'ting."

        p = (owner.plan or "free").lower()
        if p in ("free", "trial"):
            trial_end = owner.trial_ends_at or owner.expires_at
            if trial_end and now > trial_end:
                return (
                    False,
                    "Free tarif limiti tugadi (maksimum 3 ta shartnoma yoki 2 oylik muddat). Davom etish uchun Standart tarifga o'ting.",
                )

            active_contracts = owner.contracts.filter(is_active=True).count()
            if active_contracts >= sub_settings.free_max_contracts:
                return (
                    False,
                    f"Free tarif limiti tugadi (maksimum {sub_settings.free_max_contracts} ta shartnoma yoki 2 oylik muddat). Davom etish uchun Standart tarifga o'ting.",
                )
            return True, ""

        # Standart / Paid tier
        exp = owner.subscription_expires_at or owner.expires_at
        if not exp or now > exp:
            return False, "Standart tarif obuna muddati tugagan. Davom etish uchun Standart tarifga o'ting."

        return True, ""

    @property
    def can_add_car(self) -> bool:
        owner = self.tenant_owner
        if not owner.is_subscription_active:
            return False
        if owner.cars.count() >= owner.cars_limit:
            return False
        can_create, _ = owner.check_can_create_contract()
        return can_create

    def __str__(self):
        role_label = self.get_role_display() if hasattr(self, "get_role_display") else self.role
        name = self.full_name or self.username or str(self.telegram_id or self.pk)
        return f"{name} ({role_label})"


class UserSetting(models.Model):
    owner = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="settings",
        verbose_name="Owner",
    )
    default_annual_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("20.00"),
        verbose_name="Default Annual Percent (%)",
    )

    class Meta:
        verbose_name = "User Setting"
        verbose_name_plural = "User Settings"

    def __str__(self):
        return f"Settings for {self.owner}"


class SubscriptionSettings(models.Model):
    standart_price = models.PositiveIntegerField(
        default=150000,
        verbose_name="Standart tarif narxi (UZS / oy)",
    )
    free_max_contracts = models.PositiveIntegerField(
        default=3,
        verbose_name="Free tarif maksimal shartnomalar soni",
    )
    free_duration_days = models.PositiveIntegerField(
        default=60,
        verbose_name="Free tarif muddati (kun)",
    )
    paynet_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        verbose_name="Paynet to'lov havolasi (P2P / QR URL)",
    )
    paynet_qr_image = models.FileField(
        upload_to="payment_qr/",
        blank=True,
        null=True,
        verbose_name="Paynet QR-kod rasmi",
    )
    card_number = models.CharField(
        max_length=30,
        blank=True,
        default="",
        verbose_name="Karta raqami",
    )
    card_holder = models.CharField(
        max_length=100,
        blank=True,
        default="",
        verbose_name="Karta egasi",
    )
    support_telegram = models.CharField(
        max_length=100,
        blank=True,
        default="",
        verbose_name="Qo'llab-quvvatlash Telegrami (@username)",
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Oxirgi tahrir")

    class Meta:
        verbose_name = "Obuna va To'lov sozlamalari (Superadmin)"
        verbose_name_plural = "Obuna va To'lov sozlamalari"

    @property
    def standard_plan_price(self):
        return self.standart_price

    @standard_plan_price.setter
    def standard_plan_price(self, val):
        self.standart_price = val

    @property
    def pro_plan_price(self):
        return self.standart_price

    @classmethod
    def get_settings(cls):
        from django.conf import settings
        instance, created = cls.objects.get_or_create(id=1)
        if created:
            instance.paynet_url = getattr(settings, "DEFAULT_PAYNET_URL", "") or None
            instance.card_number = getattr(settings, "DEFAULT_CARD_NUMBER", "")
            instance.card_holder = getattr(settings, "DEFAULT_CARD_HOLDER", "")
            instance.save(update_fields=["paynet_url", "card_number", "card_holder"])
        return instance

    def __str__(self):
        return "Obuna va To'lov sozlamalari (Yagona konfiguratsiya)"


PaymentSettings = SubscriptionSettings


class SubscriptionRequest(models.Model):
    class PlanType(models.TextChoices):
        STANDARD = "standard", "Standart"
        PRO = "pro", "Pro (Premium)"

    class Status(models.TextChoices):
        PENDING = "pending", "Kutilmoqda"
        APPROVED = "approved", "Tasdiqlandi"
        REJECTED = "rejected", "Rad etildi"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="subscription_requests",
        verbose_name="Foydalanuvchi",
    )
    plan_type = models.CharField(
        max_length=20,
        choices=PlanType.choices,
        verbose_name="So'ralgan tarif",
    )
    amount = models.PositiveIntegerField(
        default=0,
        verbose_name="To'lov summasi (UZS)",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
        verbose_name="Holati",
    )
    note = models.TextField(
        blank=True,
        default="",
        verbose_name="Mijoz izohi / tranzaksiya",
    )
    admin_note = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Admin izohi",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        verbose_name="So'rov vaqti",
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Ko'rib chiqilgan vaqt",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Obuna so'rovi"
        verbose_name_plural = "Obuna so'rovlari"
        indexes = [
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"So'rov #{self.id} - {self.user} ({self.get_plan_type_display()}: {self.get_status_display()})"
