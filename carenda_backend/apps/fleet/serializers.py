import re
from decimal import Decimal
from rest_framework import serializers

from apps.fleet.models import Car, Contract, Driver, Payment

UZBEK_PLATE_REGEX = re.compile(
    r"^(?:\d{2}[A-Z]\d{3}[A-Z]{2}|\d{2}\d{3}[A-Z]{3}|\d{2}\d{4}[A-Z]{2})$"
)


class DriverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = [
            "id",
            "full_name",
            "phone",
            "secondary_phone",
            "passport_info",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PaymentSerializer(serializers.ModelSerializer):
    remaining_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    is_postponed = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id",
            "contract",
            "month_number",
            "due_date",
            "expected_amount",
            "paid_amount",
            "remaining_amount",
            "status",
            "paid_at",
            "comment",
            "is_postponed",
        ]
        read_only_fields = [
            "id",
            "contract",
            "month_number",
            "due_date",
            "expected_amount",
            "paid_amount",
            "remaining_amount",
            "status",
            "paid_at",
            "is_postponed",
        ]

    def get_is_postponed(self, obj: Payment) -> bool:
        return bool(obj.is_postponed or ("[1 oyga surildi]" in (obj.comment or "")))


class ContractSummarySerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source="driver.full_name", read_only=True)
    driver_phone = serializers.CharField(source="driver.phone", read_only=True)
    driver_secondary_phone = serializers.CharField(source="driver.secondary_phone", read_only=True, default="")
    car_name = serializers.CharField(source="car.name", read_only=True)
    plate_number = serializers.CharField(source="car.plate_number", read_only=True)
    car_year = serializers.IntegerField(source="car.year", read_only=True, default=None)
    car_notes = serializers.CharField(source="car.notes", read_only=True, default="")

    class Meta:
        model = Contract
        fields = [
            "id",
            "invite_code",
            "car",
            "car_name",
            "plate_number",
            "car_year",
            "car_notes",
            "driver",
            "driver_name",
            "driver_phone",
            "driver_secondary_phone",
            "car_price",
            "initial_payment",
            "annual_percent",
            "months_count",
            "payment_day",
            "principal_amount",
            "total_amount",
            "monthly_amount",
            "start_date",
            "is_active",
            "closed_at",
            "close_note",
            "created_at",
        ]


class ContractDetailSerializer(ContractSummarySerializer):
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta(ContractSummarySerializer.Meta):
        fields = ContractSummarySerializer.Meta.fields + ["payments"]


class CarListSerializer(serializers.ModelSerializer):
    active_contract_summary = serializers.SerializerMethodField()

    class Meta:
        model = Car
        fields = [
            "id",
            "name",
            "plate_number",
            "year",
            "notes",
            "default_price",
            "status",
            "created_at",
            "active_contract_summary",
        ]

    def get_active_contract_summary(self, obj: Car):
        if obj.status != Car.Status.RENTED:
            return None

        if hasattr(obj, "active_contracts_list"):
            active_contract = (
                obj.active_contracts_list[0]
                if obj.active_contracts_list
                else None
            )
        else:
            active_contract = (
                obj.contracts.filter(is_active=True)
                .select_related("driver")
                .first()
            )

        if not active_contract:
            return None

        if hasattr(active_contract, "pending_payments"):
            next_payment = (
                active_contract.pending_payments[0]
                if active_contract.pending_payments
                else None
            )
        else:
            next_payment = (
                active_contract.payments.filter(
                    status__in=Payment.OPEN_STATUSES
                )
                .order_by("due_date")
                .first()
            )

        return {
            "contract_id": active_contract.id,
            "driver_id": active_contract.driver_id,
            "driver_name": active_contract.driver.full_name,
            "driver_phone": active_contract.driver.phone,
            "driver_secondary_phone": active_contract.driver.secondary_phone,
            "monthly_amount": str(active_contract.monthly_amount),
            "next_due_date": str(next_payment.due_date) if next_payment else None,
        }


class CarDetailSerializer(serializers.ModelSerializer):
    active_contract = serializers.SerializerMethodField()
    past_contracts = serializers.SerializerMethodField()

    class Meta:
        model = Car
        fields = [
            "id",
            "name",
            "plate_number",
            "year",
            "notes",
            "default_price",
            "status",
            "created_at",
            "active_contract",
            "past_contracts",
        ]

    def get_active_contract(self, obj: Car):
        active = (
            obj.contracts.filter(is_active=True)
            .select_related("driver")
            .prefetch_related("payments")
            .first()
        )
        if not active:
            return None
        return ContractDetailSerializer(active).data

    def get_past_contracts(self, obj: Car):
        past = (
            obj.contracts.filter(is_active=False)
            .select_related("driver")
            .order_by("-closed_at")[:5]
        )
        return ContractSummarySerializer(past, many=True).data


class CarCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Car
        fields = ["name", "plate_number", "year", "notes", "default_price", "status"]
        extra_kwargs = {
            "status": {"required": False},
            "default_price": {"required": False},
            "year": {"required": False, "allow_null": True},
            "notes": {"required": False, "allow_blank": True},
        }

    def validate_plate_number(self, value):
        if not value:
            raise serializers.ValidationError("Davlat raqami kiritilishi shart.")
        clean_plate = re.sub(r"\s+", "", value.strip().upper())
        if not UZBEK_PLATE_REGEX.match(clean_plate):
            raise serializers.ValidationError(
                "Davlat raqami formati noto'g'ri. Namuna: 01 A 777 AA yoki 01 777 AAA"
            )
        return value.strip().upper()


class CalculateContractSerializer(serializers.Serializer):
    car_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    initial_payment = serializers.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"), min_value=Decimal("0.00")
    )
    annual_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0.00")
    )
    months_count = serializers.IntegerField(min_value=1)


class ContractCreateSerializer(serializers.Serializer):
    car_id = serializers.IntegerField(required=False, allow_null=True)
    car_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    plate_number = serializers.CharField(max_length=30, required=False, allow_blank=True)
    car_year = serializers.IntegerField(required=False, allow_null=True)
    car_notes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    driver_id = serializers.IntegerField(required=False, allow_null=True)
    driver_full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    driver_phone = serializers.CharField(max_length=25, required=False, allow_blank=True)
    driver_secondary_phone = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")

    car_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    initial_payment = serializers.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"), min_value=Decimal("0.00")
    )
    annual_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0.00")
    )
    months_count = serializers.IntegerField(min_value=1)
    payment_day = serializers.IntegerField(min_value=1, max_value=31)
    start_date = serializers.DateField()

    def validate(self, data):
        car_id = data.get("car_id")
        car_name = (data.get("car_name") or "").strip()
        plate_number = (data.get("plate_number") or "").strip()

        if not car_id:
            if not car_name or not plate_number:
                raise serializers.ValidationError(
                    "Mashina tanlang yoki yangi mashina ma'lumotlarini (nomi va davlat raqami) kiriting."
                )
            clean_plate = re.sub(r"\s+", "", plate_number.upper())
            if not UZBEK_PLATE_REGEX.match(clean_plate):
                raise serializers.ValidationError(
                    "Davlat raqami formati noto'g'ri. Namuna: 01 A 777 AA yoki 01 777 AAA"
                )

        driver_id = data.get("driver_id")
        full_name = (data.get("driver_full_name") or "").strip()
        phone = (data.get("driver_phone") or "").strip()

        if not driver_id and (not full_name or not phone):
            raise serializers.ValidationError(
                "Mavjud haydovchini tanlang yoki yangi haydovchi ism-familiyasi va telefon raqamini kiriting."
            )
        return data


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    comment = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class CloseContractSerializer(serializers.Serializer):
    close_note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
