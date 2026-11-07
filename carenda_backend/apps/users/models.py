from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


def get_default_expires_at():
    return timezone.now() + timedelta(days=14)


class User(AbstractUser):
    class Plan(models.TextChoices):
        TRIAL = "trial", "Trial"
        BASIC = "basic", "Basic"
        PRO = "pro", "Pro"

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

    @property
    def is_subscription_active(self) -> bool:
        return bool(
            self.is_active
            and self.expires_at
            and self.expires_at > timezone.now()
        )

    @property
    def can_add_car(self) -> bool:
        return bool(
            self.is_subscription_active
            and (self.cars.count() < self.cars_limit)
        )

    def __str__(self):
        return self.full_name or self.username or str(self.telegram_id or self.pk)


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
