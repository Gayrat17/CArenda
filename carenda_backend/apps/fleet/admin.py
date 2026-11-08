from django.contrib import admin

from .models import Car, Contract, Driver, Payment


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = (
        "month_number",
        "due_date",
        "expected_amount",
        "paid_amount",
        "status",
        "paid_at",
        "comment",
    )
    readonly_fields = ()


@admin.register(Car)
class CarAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "plate_number",
        "owner",
        "status",
        "default_price",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("name", "plate_number", "owner__username", "owner__full_name")
    raw_id_fields = ("owner",)


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "full_name",
        "phone",
        "owner",
        "user",
        "passport_info",
        "created_at",
    )
    search_fields = (
        "full_name",
        "phone",
        "passport_info",
        "owner__username",
        "owner__full_name",
        "user__username",
    )
    raw_id_fields = ("owner", "user")


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "owner",
        "car",
        "driver",
        "car_price",
        "initial_payment",
        "principal_amount",
        "total_amount",
        "monthly_amount",
        "months_count",
        "payment_day",
        "start_date",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "start_date", "created_at")
    search_fields = (
        "owner__username",
        "owner__full_name",
        "car__name",
        "car__plate_number",
        "driver__full_name",
    )
    raw_id_fields = ("owner", "car", "driver")
    inlines = [PaymentInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "contract",
        "month_number",
        "due_date",
        "expected_amount",
        "paid_amount",
        "remaining_amount",
        "status",
        "paid_at",
    )
    list_filter = ("status", "due_date")
    search_fields = (
        "contract__id",
        "contract__car__name",
        "contract__driver__full_name",
        "comment",
    )
    raw_id_fields = ("contract",)

    @admin.display(description="Remaining Amount ($)")
    def remaining_amount(self, obj):
        return f"${obj.remaining_amount:.2f}"
