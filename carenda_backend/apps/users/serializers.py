from rest_framework import serializers

from apps.users.models import User, UserSetting


class UserMeSerializer(serializers.ModelSerializer):
    cars_count = serializers.SerializerMethodField()
    default_annual_percent = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "telegram_id",
            "username",
            "full_name",
            "phone",
            "plan",
            "cars_limit",
            "cars_count",
            "expires_at",
            "is_subscription_active",
            "can_add_car",
            "default_annual_percent",
        ]

    def get_cars_count(self, obj: User) -> int:
        return obj.cars.count()

    def get_default_annual_percent(self, obj: User) -> str:
        setting, _ = UserSetting.objects.get_or_create(owner=obj)
        return str(setting.default_annual_percent)


class UserMeUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=25, required=False, allow_blank=True)
    default_annual_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, min_value=0
    )
