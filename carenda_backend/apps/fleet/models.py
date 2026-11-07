from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Car(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "available", "Bo'sh"
        RENTED = "rented", "Ijarada"
        MAINTENANCE = "maintenance", "Ta'mirda"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cars",
        verbose_name="Owner",
    )
    name = models.CharField(max_length=100, verbose_name="Car Name / Model")
    plate_number = models.CharField(max_length=20, verbose_name="Plate Number")
    default_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Default Price ($)",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AVAILABLE,
        db_index=True,
        verbose_name="Status",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")

    class Meta:
        verbose_name = "Car"
        verbose_name_plural = "Cars"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "plate_number"],
                name="unique_owner_plate",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.plate_number})"


class Driver(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="drivers",
        verbose_name="Owner",
    )
    full_name = models.CharField(max_length=150, verbose_name="Full Name")
    phone = models.CharField(max_length=25, verbose_name="Phone Number")
    passport_info = models.CharField(
        max_length=50, blank=True, verbose_name="Passport Info"
    )
    notes = models.TextField(blank=True, verbose_name="Notes")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")

    class Meta:
        verbose_name = "Driver"
        verbose_name_plural = "Drivers"

    def __str__(self):
        return f"{self.full_name} ({self.phone})"


class Contract(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contracts",
        verbose_name="Owner",
    )
    car = models.ForeignKey(
        Car,
        on_delete=models.PROTECT,
        related_name="contracts",
        verbose_name="Car",
    )
    driver = models.ForeignKey(
        Driver,
        on_delete=models.PROTECT,
        related_name="contracts",
        verbose_name="Driver",
    )

    # Financial Inputs (USD)
    car_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Car Price ($)",
    )
    initial_payment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Initial Payment ($)",
    )
    annual_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="Annual Percent (%)",
    )
    months_count = models.PositiveSmallIntegerField(
        verbose_name="Duration (Months)"
    )
    payment_day = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(31)],
        verbose_name="Payment Day (1-31)",
    )

    # Calculated Financial Outputs (USD)
    principal_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        blank=True,
        verbose_name="Principal Amount ($)",
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        blank=True,
        verbose_name="Total Amount ($)",
    )
    monthly_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        blank=True,
        verbose_name="Monthly Amount ($)",
    )

    # Status & Dates
    start_date = models.DateField(verbose_name="Start Date")
    is_active = models.BooleanField(
        default=True, db_index=True, verbose_name="Is Active"
    )
    closed_at = models.DateTimeField(
        null=True, blank=True, verbose_name="Closed At"
    )
    close_note = models.CharField(
        max_length=255, blank=True, verbose_name="Close Note"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")

    class Meta:
        verbose_name = "Contract"
        verbose_name_plural = "Contracts"

    def calculate_totals(self):
        """Helper to calculate financial outputs if not manually populated."""
        if self.car_price is not None:
            initial = self.initial_payment or Decimal("0.00")
            if not self.principal_amount or self.principal_amount == Decimal("0.00"):
                self.principal_amount = max(Decimal("0.00"), self.car_price - initial)
            if (not self.total_amount or self.total_amount == Decimal("0.00")) and self.months_count and self.annual_percent is not None:
                interest = (
                    self.principal_amount
                    * (self.annual_percent / Decimal("100.00"))
                    * (Decimal(self.months_count) / Decimal("12.00"))
                )
                self.total_amount = (self.principal_amount + interest).quantize(Decimal("0.01"))
            if (not self.monthly_amount or self.monthly_amount == Decimal("0.00")) and self.total_amount and self.months_count:
                self.monthly_amount = (self.total_amount / Decimal(self.months_count)).quantize(Decimal("0.01"))

    def save(self, *args, **kwargs):
        self.calculate_totals()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Contract #{self.pk or 'New'} - {self.car} / {self.driver}"


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Kutilmoqda"
        PARTIAL = "partial", "Qisman"
        PAID = "paid", "To'langan"
        CANCELLED = "cancelled", "Bekor qilingan"

    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name="payments",
        verbose_name="Contract",
    )
    month_number = models.PositiveSmallIntegerField(
        verbose_name="Month Number"
    )
    due_date = models.DateField(db_index=True, verbose_name="Due Date")
    expected_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Expected Amount ($)",
    )
    paid_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Paid Amount ($)",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
        verbose_name="Status",
    )
    paid_at = models.DateTimeField(
        null=True, blank=True, verbose_name="Paid At"
    )
    comment = models.CharField(
        max_length=255, blank=True, verbose_name="Comment"
    )

    class Meta:
        ordering = ["due_date", "month_number"]
        verbose_name = "Payment"
        verbose_name_plural = "Payments"

    @property
    def remaining_amount(self) -> Decimal:
        return max(Decimal("0.00"), self.expected_amount - self.paid_amount)

    def __str__(self):
        return f"Payment #{self.month_number} for Contract #{self.contract_id} (${self.expected_amount} - {self.get_status_display()})"
