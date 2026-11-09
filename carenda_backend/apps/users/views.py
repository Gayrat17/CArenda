import asyncio
import logging
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.fleet.services import invalidate_tenant_cache
from apps.users.models import PaymentSettings, SubscriptionRequest, User, UserSetting
from apps.users.serializers import (
    PaymentSettingsSerializer,
    PaymentSettingsUpdateSerializer,
    SubscriptionRequestCreateSerializer,
    SubscriptionRequestSerializer,
    UserMeSerializer,
    UserMeUpdateSerializer,
)

logger = logging.getLogger(__name__)


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
            user_role = (user.role or "").lower()
            if user_role not in (User.RoleChoices.ARENDATOR, "owner", User.RoleChoices.SUPERADMIN) and not user.is_superadmin:
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


def notify_admins_of_subscription_request(sub_request: SubscriptionRequest) -> bool:
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token or bot_token == "dev_bot_token_123456":
        return False

    admin_ids = []
    admin_tg_id = getattr(settings, "ADMIN_TELEGRAM_ID", None)
    if admin_tg_id:
        admin_ids.append(admin_tg_id)

    superadmins = User.objects.filter(
        Q(role=User.RoleChoices.SUPERADMIN) | Q(is_superuser=True),
        telegram_id__isnull=False,
    )
    for sa in superadmins:
        if sa.telegram_id and sa.telegram_id not in admin_ids:
            admin_ids.append(sa.telegram_id)

    if not admin_ids:
        logger.info("No admin Telegram IDs configured for subscription notification.")
        return False

    user = sub_request.user
    plan_name = sub_request.get_plan_type_display()
    amount_str = f"{sub_request.amount:,}".replace(",", " ")
    created_str = timezone.localtime(sub_request.created_at).strftime("%d.%m.%Y %H:%M")

    text = (
        "🔔 <b>Yangi obuna so'rovi (Paynet / Karta)!</b>\n\n"
        f"👤 <b>Mijoz:</b> {user.full_name or user.username} (@{user.username or 'mavjud emas'})\n"
        f"📱 <b>Telefon:</b> {user.phone or 'kiritilmagan'}\n"
        f"🔑 <b>Arendator kodi:</b> <code>{user.tenant_code or '—'}</code>\n"
        f"📦 <b>Tarif:</b> <b>{plan_name}</b>\n"
        f"💰 <b>Summa:</b> <b>{amount_str} UZS</b>\n"
        f"📝 <b>Izoh:</b> {sub_request.note or 'Kiritilmagan'}\n"
        f"📅 <b>Vaqt:</b> {created_str}\n\n"
        "<i>To'lov kelib tushganini tekshirib, quyidagi tugmalar orqali tasdiqlang:</i>"
    )

    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Tasdiqlash (30 kun)",
                    callback_data=f"sub_approve:{sub_request.id}",
                ),
                InlineKeyboardButton(
                    text="❌ Rad etish",
                    callback_data=f"sub_reject:{sub_request.id}",
                ),
            ]
        ]
    )

    from aiogram import Bot

    async def _send():
        bot = Bot(token=bot_token)
        try:
            for aid in admin_ids:
                try:
                    await bot.send_message(
                        chat_id=aid,
                        text=text,
                        parse_mode="HTML",
                        reply_markup=keyboard,
                    )
                except Exception as ex:
                    logger.warning("Failed to send subscription alert to admin %s: %s", aid, ex)
            return True
        finally:
            await bot.session.close()

    try:
        return asyncio.run(_send())
    except Exception as e:
        logger.error("Error sending subscription admin alerts: %s", e)
        return False


class PaymentSettingsAPIView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        settings_obj = PaymentSettings.get_settings()
        serializer = PaymentSettingsSerializer(settings_obj, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        user = request.user
        user_role = (getattr(user, "role", "") or "").lower()
        if user_role != User.RoleChoices.SUPERADMIN and not getattr(user, "is_superuser", False):
            return Response(
                {"detail": "Faqat Superadmin to'lov sozlamalarini o'zgartirishi mumkin."},
                status=status.HTTP_403_FORBIDDEN,
            )

        settings_obj = PaymentSettings.get_settings()
        serializer = PaymentSettingsUpdateSerializer(settings_obj, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        response_serializer = PaymentSettingsSerializer(settings_obj, context={"request": request})
        return Response(response_serializer.data)

    def put(self, request):
        return self.patch(request)


class SubscriptionRequestAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        requests = SubscriptionRequest.objects.filter(user=request.user).order_by("-created_at")
        serializer = SubscriptionRequestSerializer(requests, many=True)
        return Response(serializer.data)

    def post(self, request):
        user = request.user
        plan_type = request.data.get("plan_type", "standard").lower().strip()
        if plan_type in ("basic", "sinov"):
            plan_type = "standard"

        if plan_type not in ("standard", "pro"):
            return Response(
                {"detail": "Noto'g'ri tarif turi tanlandi. Mavjud tariflar: standard, pro."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check existing pending request
        pending = SubscriptionRequest.objects.filter(user=user, status="pending").first()
        if pending:
            return Response(
                {
                    "detail": "Sizda allaqachon ko'rib chiqilayotgan obuna so'rovi mavjud. Iltimos, admin tasdiqlashini kuting.",
                    "pending_request": SubscriptionRequestSerializer(pending).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj = PaymentSettings.get_settings()
        amount = request.data.get("amount")
        try:
            amount = int(amount) if amount else None
        except (ValueError, TypeError):
            amount = None

        if not amount or amount <= 0:
            amount = settings_obj.pro_plan_price if plan_type == "pro" else settings_obj.standard_plan_price

        note = str(request.data.get("note") or "").strip()

        sub_req = SubscriptionRequest.objects.create(
            user=user,
            plan_type=plan_type,
            amount=amount,
            note=note,
        )

        # Asynchronously or directly notify admin via Telegram
        notify_admins_of_subscription_request(sub_req)

        serializer = SubscriptionRequestSerializer(sub_req)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SubscriptionStatusAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = request.user.tenant_owner
        pending = SubscriptionRequest.objects.filter(user=owner, status="pending").first()

        plan_label = owner.get_plan_display() if hasattr(owner, "get_plan_display") else owner.plan
        if owner.plan in ("standard", "basic"):
            plan_label = "Standart"
        elif owner.plan == "pro":
            plan_label = "Pro (Premium)"
        elif owner.plan == "trial":
            plan_label = "Sinov (Trial)"

        return Response({
            "plan": owner.plan,
            "plan_label": plan_label,
            "is_active": owner.is_subscription_active,
            "expires_at": owner.expires_at,
            "cars_count": owner.cars.count(),
            "cars_limit": owner.cars_limit,
            "pending_request": SubscriptionRequestSerializer(pending).data if pending else None,
        })
