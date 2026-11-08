from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.fleet.services import invalidate_tenant_cache
from apps.users.models import User, UserSetting
from apps.users.serializers import UserMeSerializer, UserMeUpdateSerializer


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserMeSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserMeUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        validated_data = serializer.validated_data

        user_fields_to_update = []
        if "full_name" in validated_data:
            user.full_name = validated_data["full_name"]
            user_fields_to_update.append("full_name")

        if user_fields_to_update:
            user.save(update_fields=user_fields_to_update)

        if "default_annual_percent" in validated_data:
            if user.role != User.RoleChoices.ARENDATOR and not user.is_superadmin:
                return Response(
                    {"error": "Faqat arendator (rahbar) standart foiz stavkasini o'zgartirishi mumkin."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            target_owner = user.tenant_owner
            setting, _ = UserSetting.objects.get_or_create(owner=target_owner)
            setting.default_annual_percent = validated_data["default_annual_percent"]
            setting.save(update_fields=["default_annual_percent"])

        invalidate_tenant_cache(user.tenant_owner.id, getattr(user, "telegram_id", None))
        response_serializer = UserMeSerializer(user)
        return Response(response_serializer.data)
