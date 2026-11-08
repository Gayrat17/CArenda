from rest_framework import serializers

from apps.users.models import User, UserSetting


class UserMeSerializer(serializers.ModelSerializer):
    role = serializers.CharField()
    tenant_code = serializers.CharField(read_only=True)
    is_registered = serializers.BooleanField(read_only=True)
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

    class Meta:
        model = User
        fields = [
            "id",
            "telegram_id",
            "username",
            "full_name",
            "phone",
            "role",
            "tenant_code",
            "is_registered",
            "parent_owner",
            "parent_owner_name",
            "driver_id",
            "plan",
            "cars_limit",
            "cars_count",
            "expires_at",
            "is_subscription_active",
            "can_add_car",
            "default_annual_percent",
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


class UserMeUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    default_annual_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, min_value=0
    )
