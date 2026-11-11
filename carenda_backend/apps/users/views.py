import asyncio
from datetime import timedelta
import logging
import re

from django.conf import settings
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.fleet.models import Contract, Driver, normalize_phone
from apps.fleet.services import invalidate_tenant_cache
from apps.users.authentication import TelegramWebAppAuthentication
from apps.users.models import (
    PaymentSettings,
    SubscriptionRequest,
    SubscriptionSettings,
    User,
    UserSetting,
    is_superadmin_telegram_id,
)
from apps.users.permissions import IsArendator, IsIjarachi, IsOnboarded, IsSuperAdmin
from apps.users.serializers import (
    PaymentSettingsSerializer,
    PaymentSettingsUpdateSerializer,
    SubscriptionRequestCreateSerializer,
    SubscriptionRequestSerializer,
    SubscriptionSettingsSerializer,
    SubscriptionSettingsUpdateSerializer,
    SuperadminArendatorSerializer,
    UserMeSerializer,
    UserMeUpdateSerializer,
)
from apps.users.services import (
    grant_arendator_subscription,
    process_subscription_approval,
    process_subscription_rejection,
)

logger = logging.getLogger(__name__)


def format_uzbek_phone(raw_phone: str) -> str:
    """Formats phone number into normalized +998 XX XXX XX XX representation."""
    digits = re.sub(r"\D", "", str(raw_phone or ""))
    if len(digits) == 9:
        digits = "998" + digits
    elif digits.startswith("8") and len(digits) == 10:
        digits = "998" + digits[1:]
    if digits.startswith("998") and len(digits) == 12:
        return f"+{digits[:3]} {digits[3:5]} {digits[5:8]} {digits[8:10]} {digits[10:12]}"
    if len(digits) >= 9:
        last9 = digits[-9:]
        return f"+998 {last9[:2]} {last9[2:5]} {last9[5:7]} {last9[7:9]}"
    return raw_phone


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
    for sid in getattr(settings, "SUPERADMIN_TELEGRAM_IDS", []) or []:
        if sid not in admin_ids:
            admin_ids.append(sid)
    admin_tg_id = getattr(settings, "ADMIN_TELEGRAM_ID", None)
    if admin_tg_id and admin_tg_id not in admin_ids:
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
                    text="✅ Tasdiqlash (+30 kun)",
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


SubscriptionSettingsAPIView = PaymentSettingsAPIView


class SubscriptionRequestAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        requests = SubscriptionRequest.objects.filter(user=request.user).order_by("-created_at")
        serializer = SubscriptionRequestSerializer(requests, many=True)
        return Response(serializer.data)

    def post(self, request):
        user = request.user
        plan_type = request.data.get("plan_type", "standard").lower().strip()
        if plan_type not in ("standard", "pro", "standart"):
            plan_type = "standard"
        if plan_type == "standart":
            plan_type = "standard"

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

        settings_obj = SubscriptionSettings.get_settings()
        amount = request.data.get("amount")
        try:
            amount = int(amount) if amount else None
        except (ValueError, TypeError):
            amount = None

        if not amount or amount <= 0:
            amount = settings_obj.standart_price

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
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        owner = request.user.tenant_owner
        settings_obj = SubscriptionSettings.get_settings()
        pending = SubscriptionRequest.objects.filter(user=owner, status="pending").first()

        plan_code = (owner.plan or "free").lower()
        if plan_code in ("standard", "basic", "pro"):
            plan_code = "standard"
            plan_label = "Standart"
        else:
            plan_code = "free"
            plan_label = "Free (Sinov)"

        now = timezone.now()
        target_expiry = (
            owner.subscription_expires_at
            if plan_code == "standard"
            else (owner.trial_ends_at or (owner.date_joined + timedelta(days=settings_obj.free_duration_days)))
        )
        remaining_days = (
            max(0, (target_expiry - now).days)
            if (target_expiry and owner.is_subscription_active and not owner.is_frozen)
            else 0
        )

        active_contracts_count = owner.contracts.filter(is_active=True).count()
        can_create, cannot_reason = owner.check_can_create_contract()

        return Response({
            "plan": plan_code,
            "plan_label": plan_label,
            "is_active": owner.is_subscription_active,
            "is_frozen": owner.is_frozen,
            "trial_ends_at": owner.trial_ends_at,
            "subscription_expires_at": owner.subscription_expires_at,
            "expires_at": target_expiry,
            "remaining_days": remaining_days,
            "contracts_count": active_contracts_count,
            "active_contracts_count": active_contracts_count,
            "max_contracts": settings_obj.free_max_contracts if plan_code == "free" else 9999,
            "can_create_contract": can_create,
            "cannot_create_reason": cannot_reason,
            "standart_price": settings_obj.standart_price,
            "cars_count": owner.cars.count(),
            "cars_limit": owner.cars_limit,
            "settings": SubscriptionSettingsSerializer(settings_obj, context={"request": request}).data,
            "pending_request": SubscriptionRequestSerializer(pending).data if pending else None,
        })


class TelegramAuthAPIView(APIView):
    """
    Dedicated endpoint for Telegram Mini App authentication.
    Returns the authenticated user's current status and onboarding state.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            # Try authenticating via TelegramWebAppAuthentication if init_data was supplied in body
            init_data = request.data.get("init_data") or request.data.get("initData")
            if init_data:
                auth = TelegramWebAppAuthentication()
                try:
                    res = auth._validate_telegram_init_data(init_data)
                    if res:
                        user = res[0]
                except Exception as e:
                    return Response({"detail": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        if not user or not user.is_authenticated:
            return Response(
                {"detail": "Avtorizatsiya amalga oshmadi. Telegram initData talab qilinadi."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if is_superadmin_telegram_id(getattr(user, "telegram_id", None)):
            if not (user.is_superuser and user.is_staff and user.is_onboarded):
                user.is_superuser = True
                user.is_staff = True
                user.is_onboarded = True
                user.is_registered = True
                user.save(update_fields=["is_superuser", "is_staff", "is_onboarded", "is_registered"])

        return Response(UserMeSerializer(user).data, status=status.HTTP_200_OK)


def _find_contract_or_arendator_by_code(raw_code: str):
    """Finds an active Contract or Arendator matching the normalized invite code."""
    clean = str(raw_code or "").strip().upper().replace(" ", "")
    if not clean:
        return None, None
    candidates = [clean]
    if clean.startswith("AR") and "-" not in clean and len(clean) >= 5:
        candidates.append(f"AR-{clean[2:]}")
    if clean.startswith("CR") and "-" in clean:
        candidates.append(clean.replace("-", ""))

    for code in candidates:
        contract = (
            Contract.objects.filter(invite_code__iexact=code, is_active=True)
            .select_related("owner", "car", "driver")
            .first()
        )
        if contract:
            return contract, contract.owner
        arendator = (
            User.objects.filter(
                Q(tenant_code__iexact=code) | Q(invite_code__iexact=code),
                role=User.RoleChoices.ARENDATOR,
            )
            .first()
        )
        if arendator:
            return None, arendator
    return None, None


class VerifyInviteCodeAPIView(APIView):
    """
    Verifies a special invite code entered by an Ijarachi/client.
    Accepts: {"code": "CR4829"} (or {"invite_code": "..."}).
    Returns 200 with metadata if valid, or 400 with exact Uzbek error message if invalid.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_code = str(request.data.get("code") or request.data.get("invite_code") or "")
        contract, arendator = _find_contract_or_arendator_by_code(raw_code)

        if contract:
            owner_name = contract.owner.full_name or contract.owner.username or "Arendator"
            return Response(
                {
                    "valid": True,
                    "type": "contract",
                    "code": contract.invite_code,
                    "contract_id": contract.id,
                    "arendator_id": contract.owner.id,
                    "arendator_name": owner_name,
                    "car_name": contract.car.name,
                    "plate_number": contract.car.plate_number,
                    "driver_name": contract.driver.full_name,
                    "monthly_amount": str(contract.monthly_amount),
                },
                status=status.HTTP_200_OK,
            )

        if arendator:
            owner_name = arendator.full_name or arendator.username or "Arendator"
            return Response(
                {
                    "valid": True,
                    "type": "arendator",
                    "code": arendator.invite_code or arendator.tenant_code,
                    "arendator_id": arendator.id,
                    "arendator_name": owner_name,
                    "car_name": None,
                    "plate_number": None,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "valid": False,
                "detail": "Kiritilgan maxsus kod xato! Iltimos, arendatoringizdan to'g'ri kodni so'rang.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


class CompleteOnboardingAPIView(APIView):
    """
    Completes user onboarding by setting role, saving verified phone,
    and linking Ijarachi to their Arendator/Contract.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        role = str(request.data.get("role") or "").strip().lower()
        if role not in (User.RoleChoices.ARENDATOR, User.RoleChoices.IJARACHI, "user", "owner"):
            return Response(
                {"detail": "Noto'g'ri rol tanlandi. Iltimos, 'arendator' yoki 'ijarachi' tanlang."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if role == "owner":
            role = User.RoleChoices.ARENDATOR
        elif role == "user":
            role = User.RoleChoices.IJARACHI

        raw_phone = str(request.data.get("phone_number") or request.data.get("phone") or "").strip()
        digits = re.sub(r"\D", "", raw_phone)
        if len(digits) < 9:
            return Response(
                {"detail": "Telefon raqami noto'g'ri. Kamida 9 ta raqam kiritilishi lozim."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        formatted_phone = format_uzbek_phone(raw_phone)
        normalized_incoming = normalize_phone(raw_phone)

        invite_code = str(request.data.get("invite_code") or request.data.get("code") or "").strip().upper()
        full_name = str(request.data.get("full_name") or "").strip()

        if role == User.RoleChoices.IJARACHI:
            if not invite_code:
                return Response(
                    {"detail": "Ijarachi uchun maxsus kod kiritilishi majburiy."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Match contract or arendator
            contract, matched_arendator = _find_contract_or_arendator_by_code(invite_code)
            if not matched_arendator:
                return Response(
                    {
                        "valid": False,
                        "detail": "Kiritilgan maxsus kod xato! Iltimos, arendatoringizdan to'g'ri kodni so'rang.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.linked_arendator = matched_arendator
            user.parent_owner = matched_arendator
            if contract:
                if contract.driver:
                    contract.driver.user = user
                    if not contract.driver.phone:
                        contract.driver.phone = formatted_phone
                    contract.driver.save(update_fields=["user", "phone"])
                if not User.objects.filter(invite_code__iexact=contract.invite_code).exclude(pk=user.pk).exists():
                    user.invite_code = contract.invite_code
            else:
                # Link matching driver under this arendator
                matched_d = None
                for d in matched_arendator.drivers.all():
                    if normalized_incoming in [normalize_phone(p) for p in d.all_phones]:
                        matched_d = d
                        d.user = user
                        d.save(update_fields=["user"])
                        break
                if not matched_d and full_name:
                    for d in matched_arendator.drivers.filter(user__isnull=True):
                        if d.full_name and d.full_name.strip().lower() == full_name.strip().lower():
                            d.user = user
                            if not d.phone:
                                d.phone = formatted_phone
                            d.save(update_fields=["user", "phone"])
                            break

            user.role = User.RoleChoices.IJARACHI

        else: # Arendator
            user.role = User.RoleChoices.ARENDATOR
            user.linked_arendator = None
            user.parent_owner = None

        user.phone = formatted_phone
        user.phone_number = formatted_phone
        user.is_onboarded = True
        user.is_registered = True
        if full_name and (not user.full_name or user.full_name.startswith("tg_")):
            user.full_name = full_name

        user.save()
        invalidate_tenant_cache(user.tenant_owner.id, getattr(user, "telegram_id", None))

        return Response(UserMeSerializer(user).data, status=status.HTTP_200_OK)


# =============================================================================
# Superadmin Endpoints (Protected strictly by IsSuperAdmin)
# =============================================================================

class SuperadminArendatorsAPIView(APIView):
    """
    Lists all Arendators (lessors) with top KPI metrics, search, and status filter.
    GET /api/superadmin/arendators/?search=...&filter=all|standard|free|expired|frozen
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        base_qs = (
            User.objects.filter(
                role__in=[User.RoleChoices.ARENDATOR, "owner", User.RoleChoices.SUPERADMIN]
            )
            .annotate(
                annotated_cars_count=Count("cars", distinct=True),
                annotated_active_contracts=Count(
                    "contracts", filter=Q(contracts__is_active=True), distinct=True
                ),
            )
            .order_by("-date_joined")
        )

        # Compute global KPIs across all registered Arendators
        kpi = {
            "total": 0,
            "standard": 0,
            "free": 0,
            "expired": 0,
            "frozen": 0,
            "pending_requests": SubscriptionRequest.objects.filter(
                status=SubscriptionRequest.Status.PENDING
            ).count(),
        }
        all_arendators = list(base_qs)
        for u in all_arendators:
            kpi["total"] += 1
            if u.is_frozen:
                kpi["frozen"] += 1
            elif not u.is_subscription_active:
                kpi["expired"] += 1
            else:
                p = (u.plan or "free").lower()
                if p in ("standard", "basic", "pro"):
                    kpi["standard"] += 1
                else:
                    kpi["free"] += 1

        search_q = str(request.query_params.get("search") or "").strip().lower()
        filter_tab = str(request.query_params.get("filter") or "all").strip().lower()

        filtered = []
        for u in all_arendators:
            if search_q:
                haystack = " ".join(
                    filter(
                        None,
                        [
                            u.full_name,
                            u.phone,
                            u.phone_number,
                            u.username,
                            u.tenant_code,
                        ],
                    )
                ).lower()
                if search_q not in haystack:
                    continue

            if filter_tab == "frozen" and not u.is_frozen:
                continue
            elif filter_tab == "expired" and (u.is_frozen or u.is_subscription_active):
                continue
            elif filter_tab == "standard":
                p = (u.plan or "free").lower()
                if u.is_frozen or not u.is_subscription_active or p not in ("standard", "basic", "pro"):
                    continue
            elif filter_tab == "free":
                p = (u.plan or "free").lower()
                if u.is_frozen or not u.is_subscription_active or p in ("standard", "basic", "pro"):
                    continue

            filtered.append(u)

        serializer = SuperadminArendatorSerializer(filtered, many=True)
        return Response({
            "kpi": kpi,
            "arendators": serializer.data,
        })


class SuperadminToggleFreezeAPIView(APIView):
    """
    Freezes or unfreezes an Arendator account.
    POST /api/superadmin/arendators/<int:pk>/toggle-freeze/
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        if target.pk == request.user.pk and not target.is_frozen:
            return Response(
                {"detail": "O'zingizning superadmin hisobingizni muzlatib qo'ya olmaysiz."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target.is_frozen = not target.is_frozen
        target.save(update_fields=["is_frozen"])
        invalidate_tenant_cache(target.id, getattr(target, "telegram_id", None))

        msg = (
            f"❄️ {target.full_name or target.username} hisobi muzlatildi."
            if target.is_frozen
            else f"▶️ {target.full_name or target.username} hisobi muzlatishdan chiqarildi."
        )
        return Response({
            "detail": msg,
            "arendator": SuperadminArendatorSerializer(target).data,
        })


class SuperadminGrantSubscriptionAPIView(APIView):
    """
    Activates or extends an Arendator's Standart subscription (+30 days by default).
    POST /api/superadmin/arendators/<int:pk>/grant-subscription/
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        try:
            days = int(request.data.get("days") or 30)
            if days < 1 or days > 3650:
                days = 30
        except (ValueError, TypeError):
            days = 30

        grant_arendator_subscription(user=target, days=days, plan_type="standard", notify=True)
        return Response({
            "detail": f"✅ Standart obuna {days} kunga muvaffaqiyatli faollashtirildi!",
            "arendator": SuperadminArendatorSerializer(target).data,
        })


class SuperadminSettingsAPIView(APIView):
    """
    Reads and updates global SubscriptionSettings (pricing, Paynet URL, Paynet QR, card info).
    GET / PUT / PATCH /api/superadmin/settings/
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        settings_obj = SubscriptionSettings.get_settings()
        return Response(SubscriptionSettingsSerializer(settings_obj, context={"request": request}).data)

    def patch(self, request):
        settings_obj = SubscriptionSettings.get_settings()
        serializer = SubscriptionSettingsUpdateSerializer(settings_obj, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        updated = serializer.save()
        return Response(SubscriptionSettingsSerializer(updated, context={"request": request}).data)

    def put(self, request):
        return self.patch(request)


class SuperadminSubscriptionRequestsAPIView(APIView):
    """
    Lists incoming payment/subscription requests submitted by Arendators.
    GET /api/superadmin/requests/?status=pending|approved|rejected|all
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        status_filter = str(request.query_params.get("status") or "pending").strip().lower()
        qs = SubscriptionRequest.objects.select_related("user").order_by("-created_at")
        if status_filter != "all":
            qs = qs.filter(status=status_filter)
        serializer = SubscriptionRequestSerializer(qs, many=True)
        return Response(serializer.data)


class SuperadminApproveRequestAPIView(APIView):
    """
    Approves a pending SubscriptionRequest from Superadmin Web UI.
    POST /api/superadmin/requests/<int:pk>/approve/
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        sub_req = get_object_or_404(SubscriptionRequest.objects.select_related("user"), pk=pk)
        if sub_req.status != SubscriptionRequest.Status.PENDING:
            return Response(
                {"detail": f"Bu so'rov allaqachon ko'rib chiqilgan ({sub_req.get_status_display()})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reviewer = request.user.username or request.user.full_name or "Superadmin"
        process_subscription_approval(sub_request=sub_req, reviewer_label=reviewer)
        return Response({
            "detail": "✅ To'lov tasdiqlandi va Standart obuna (+30 kun) faollashtirildi!",
            "request": SubscriptionRequestSerializer(sub_req).data,
        })


class SuperadminRejectRequestAPIView(APIView):
    """
    Rejects a pending SubscriptionRequest from Superadmin Web UI.
    POST /api/superadmin/requests/<int:pk>/reject/
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        sub_req = get_object_or_404(SubscriptionRequest.objects.select_related("user"), pk=pk)
        if sub_req.status != SubscriptionRequest.Status.PENDING:
            return Response(
                {"detail": f"Bu so'rov allaqachon ko'rib chiqilgan ({sub_req.get_status_display()})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get("reason") or "").strip()
        reviewer = request.user.username or request.user.full_name or "Superadmin"
        process_subscription_rejection(sub_request=sub_req, reviewer_label=reviewer, reason=reason)
        return Response({
            "detail": "❌ To'lov so'rovi rad etildi.",
            "request": SubscriptionRequestSerializer(sub_req).data,
        })
