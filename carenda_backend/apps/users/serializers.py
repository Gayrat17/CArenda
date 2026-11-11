from rest_framework import serializers

from apps.users.models import PaymentSettings, SubscriptionRequest, User, UserSetting


class UserMeSerializer(serializers.ModelSerializer):
    role = serializers.CharField()
    tenant_code = serializers.CharField(read_only=True)
    invite_code = serializers.CharField(read_only=True)
    is_registered = serializers.BooleanField(read_only=True)
    is_onboarded = serializers.BooleanField(read_only=True)
    phone_number = serializers.CharField(read_only=True)
    linked_arendator = serializers.PrimaryKeyRelatedField(read_only=True)
    username = serializers.SerializerMethodField()
    parent_owner = serializers.PrimaryKeyRelatedField(read_only=True)
    parent_owner_name = serializers.SerializerMethodField()
    driver_id = serializers.SerializerMethodField()
    cars_count = serializers.SerializerMethodField()
    cars_limit = serializers.SerializerMethodField()
    plan = serializers.SerializerMethodField()
    is_subscription_active = serializers.SerializerMethodField()
    can_add_car = serializers.SerializerMethodField()
    default_annual_percent = serializers.SerializerMethodField()
    trial_ends_at = serializers.SerializerMethodField()
    subscription_expires_at = serializers.SerializerMethodField()
    is_frozen = serializers.SerializerMethodField()
    remaining_days = serializers.SerializerMethodField()
    is_superuser = serializers.BooleanField(read_only=True)
    is_superadmin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "telegram_id",
            "username",
            "full_name",
            "phone",
            "phone_number",
            "role",
            "is_superuser",
            "is_superadmin",
            "tenant_code",
            "invite_code",
            "is_registered",
            "is_onboarded",
            "parent_owner",
            "parent_owner_name",
            "linked_arendator",
            "driver_id",
            "plan",
            "cars_limit",
            "cars_count",
            "expires_at",
            "is_subscription_active",
            "can_add_car",
            "default_annual_percent",
            "trial_ends_at",
            "subscription_expires_at",
            "is_frozen",
            "remaining_days",
        ]

    def get_username(self, obj: User) -> str | None:
        if obj.username and not obj.username.startswith("tg_"):
            return obj.username.lstrip("@")
        return None

    def get_parent_owner_name(self, obj: User) -> str | None:
        if obj.parent_owner:
            return (
                obj.parent_owner.full_name
                or obj.parent_owner.username
                or str(obj.parent_owner.id)
            )
        return None

    def get_driver_id(self, obj: User) -> int | None:
        if hasattr(obj, "driver_profile") and obj.driver_profile:
            return obj.driver_profile.id
        return None

    def get_cars_count(self, obj: User) -> int:
        return obj.tenant_owner.cars.count()

    def get_cars_limit(self, obj: User) -> int:
        return obj.tenant_owner.cars_limit

    def get_plan(self, obj: User) -> str:
        return obj.tenant_owner.plan

    def get_is_subscription_active(self, obj: User) -> bool:
        return obj.tenant_owner.is_subscription_active

    def get_can_add_car(self, obj: User) -> bool:
        return obj.tenant_owner.can_add_car

    def get_default_annual_percent(self, obj: User) -> str:
        setting, _ = UserSetting.objects.get_or_create(owner=obj.tenant_owner)
        return str(setting.default_annual_percent)

    def get_trial_ends_at(self, obj: User):
        return obj.tenant_owner.trial_ends_at

    def get_subscription_expires_at(self, obj: User):
        return obj.tenant_owner.subscription_expires_at

    def get_is_frozen(self, obj: User) -> bool:
        return obj.tenant_owner.is_frozen

    def get_remaining_days(self, obj: User) -> int:
        owner = obj.tenant_owner
        if owner.is_frozen:
            return 0
        from django.utils import timezone
        now = timezone.now()
        target = owner.subscription_expires_at or owner.trial_ends_at or owner.expires_at
        if not target or now > target:
            return 0
        return max(0, (target - now).days)

    def get_is_superadmin(self, obj: User) -> bool:
        return bool(obj.is_superadmin)


class UserMeUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    default_annual_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, min_value=0
    )


class PaymentSettingsSerializer(serializers.ModelSerializer):
    paynet_qr_image = serializers.SerializerMethodField()

    class Meta:
        model = PaymentSettings
        fields = [
            "id",
            "standart_price",
            "free_max_contracts",
            "free_duration_days",
            "paynet_url",
            "paynet_qr_image",
            "card_number",
            "card_holder",
            "support_telegram",
            "standard_plan_price",
            "pro_plan_price",
            "updated_at",
        ]

    def get_paynet_qr_image(self, obj: PaymentSettings) -> str | None:
        if not obj.paynet_qr_image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.paynet_qr_image.url)
        return obj.paynet_qr_image.url


class PaymentSettingsUpdateSerializer(serializers.ModelSerializer):
    standard_plan_price = serializers.IntegerField(required=False, min_value=0)
    pro_plan_price = serializers.IntegerField(required=False, min_value=0)

    class Meta:
        model = PaymentSettings
        fields = [
            "standart_price",
            "free_max_contracts",
            "free_duration_days",
            "paynet_url",
            "paynet_qr_image",
            "card_number",
            "card_holder",
            "support_telegram",
            "standard_plan_price",
            "pro_plan_price",
        ]
        extra_kwargs = {
            "standart_price": {"required": False, "min_value": 0},
            "free_max_contracts": {"required": False, "min_value": 1},
            "free_duration_days": {"required": False, "min_value": 1},
            "paynet_url": {"required": False, "allow_null": True, "allow_blank": True},
            "paynet_qr_image": {"required": False, "allow_null": True},
            "card_number": {"required": False, "allow_blank": True},
            "card_holder": {"required": False, "allow_blank": True},
            "support_telegram": {"required": False, "allow_blank": True},
        }

    def update(self, instance, validated_data):
        if "standard_plan_price" in validated_data and "standart_price" not in validated_data:
            validated_data["standart_price"] = validated_data.pop("standard_plan_price")
        validated_data.pop("pro_plan_price", None)
        return super().update(instance, validated_data)


SubscriptionSettingsSerializer = PaymentSettingsSerializer
SubscriptionSettingsUpdateSerializer = PaymentSettingsUpdateSerializer


class SubscriptionRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionRequest
        fields = ["plan_type", "amount", "note"]
        extra_kwargs = {
            "amount": {"required": False},
            "note": {"required": False, "allow_blank": True},
        }


class SubscriptionRequestSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    user_phone = serializers.CharField(source="user.phone", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)
    user_tenant_code = serializers.CharField(source="user.tenant_code", read_only=True)
    plan_display = serializers.CharField(source="get_plan_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = SubscriptionRequest
        fields = [
            "id",
            "user_id",
            "plan_type",
            "plan_display",
            "amount",
            "status",
            "status_display",
            "note",
            "admin_note",
            "user_name",
            "user_phone",
            "user_username",
            "user_tenant_code",
            "created_at",
            "reviewed_at",
        ]


class SuperadminArendatorSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    plan = serializers.SerializerMethodField()
    plan_label = serializers.SerializerMethodField()
    cars_count = serializers.SerializerMethodField()
    active_contracts_count = serializers.SerializerMethodField()
    is_subscription_active = serializers.SerializerMethodField()
    status_category = serializers.SerializerMethodField()
    days_delta = serializers.SerializerMethodField()
    expires_date = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "telegram_id",
            "username",
            "full_name",
            "phone",
            "tenant_code",
            "plan",
            "plan_label",
            "cars_limit",
            "cars_count",
            "active_contracts_count",
            "is_frozen",
            "is_superuser",
            "is_onboarded",
            "is_subscription_active",
            "status_category",
            "days_delta",
            "date_joined",
            "trial_ends_at",
            "subscription_expires_at",
            "expires_at",
            "expires_date",
        ]

    def get_username(self, obj: User) -> str | None:
        if obj.username and not obj.username.startswith("tg_"):
            return obj.username.lstrip("@")
        return None

    def get_plan(self, obj: User) -> str:
        p = (obj.plan or "free").lower()
        return "standard" if p in ("standard", "basic", "pro") else "free"

    def get_plan_label(self, obj: User) -> str:
        return "Standart" if self.get_plan(obj) == "standard" else "Free (Sinov)"

    def get_cars_count(self, obj: User) -> int:
        val = getattr(obj, "annotated_cars_count", None)
        return val if val is not None else obj.cars.count()

    def get_active_contracts_count(self, obj: User) -> int:
        val = getattr(obj, "annotated_active_contracts", None)
        return val if val is not None else obj.contracts.filter(is_active=True).count()

    def get_is_subscription_active(self, obj: User) -> bool:
        return obj.is_subscription_active

    def get_expires_date(self, obj: User):
        p = self.get_plan(obj)
        if p == "standard":
            return obj.subscription_expires_at or obj.expires_at
        return obj.trial_ends_at or obj.expires_at

    def get_status_category(self, obj: User) -> str:
        if obj.is_frozen:
            return "frozen"
        if not obj.is_subscription_active:
            return "expired"
        return self.get_plan(obj)

    def get_days_delta(self, obj: User) -> int:
        from django.utils import timezone
        target = self.get_expires_date(obj)
        if not target:
            return 0
        delta = (target - timezone.now()).days
        return delta
