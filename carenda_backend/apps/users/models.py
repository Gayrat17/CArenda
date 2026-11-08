from datetime import timedelta
from decimal import Decimal
import random
import string

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


def get_default_expires_at():
    return timezone.now() + timedelta(days=14)


def generate_unique_tenant_code() -> str:
    from apps.users.models import User
    while True:
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        code = f"AR-{suffix}"
        if not User.objects.filter(tenant_code=code).exists():
            return code


class User(AbstractUser):
    class Plan(models.TextChoices):
        TRIAL = "trial", "Trial"
        BASIC = "basic", "Basic"
        PRO = "pro", "Pro"

    class RoleChoices(models.TextChoices):
        SUPERADMIN = "superadmin", "Super Admin"
        ARENDATOR = "arendator", "Arendator"
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
    tenant_code = models.CharField(
        max_length=12,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Unique code for Arendator, e.g. AR-4829",
        verbose_name="Arendator maxsus kodi",
    )
    is_registered = models.BooleanField(
        default=False,
        verbose_name="Ro'yxatdan o'tgan",
        help_text="True only after phone verification in Telegram Bot",
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
    plan = models.CharField(
        max_length=20,
        choices=Plan.choices,
        default=Plan.TRIAL,
        verbose_name="Subscription Plan",
    )
    cars_limit = models.PositiveIntegerField(
        default=2,
        verbose_name="Cars Limit",
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
        # Auto-generate unique tenant_code ONLY for arendator if not set
        if self.role == self.RoleChoices.ARENDATOR and not self.tenant_code:
            while True:
                suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
                code = f"AR-{suffix}"
                if not User.objects.filter(tenant_code=code).exclude(pk=self.pk).exists():
                    self.tenant_code = code
                    break
        elif self.role != self.RoleChoices.ARENDATOR and self.tenant_code:
            self.tenant_code = None
        super().save(*args, **kwargs)

    @property
    def tenant_owner(self):
        """
        Returns the tenant owner for row-level multi-tenancy.
        If user is a user (driver) with parent_owner, returns parent_owner.
        Otherwise, returns self.
        """
        if self.role == self.RoleChoices.USER and self.parent_owner:
            return self.parent_owner
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
    def is_user(self) -> bool:
        return bool(self.role == self.RoleChoices.USER)

    @property
    def is_subscription_active(self) -> bool:
        owner = self.tenant_owner
        return bool(
            owner.is_active
            and owner.expires_at
            and owner.expires_at > timezone.now()
        )

    @property
    def can_add_car(self) -> bool:
        owner = self.tenant_owner
        return bool(
            owner.is_subscription_active
            and (owner.cars.count() < owner.cars_limit)
        )

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
