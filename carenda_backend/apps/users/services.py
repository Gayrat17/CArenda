from datetime import timedelta
import logging
from django.conf import settings
from django.utils import timezone

from apps.fleet.services import invalidate_tenant_cache
from apps.users.models import SubscriptionRequest, User

logger = logging.getLogger(__name__)


def process_subscription_approval(
    sub_request: SubscriptionRequest,
    reviewer_label: str = "Admin",
) -> bool:
    """
    Approves a pending subscription request:
    1. Sets sub_request.status = 'approved'
    2. Updates user plan: 'standard' or 'pro'
    3. Sets user.cars_limit: 15 for standard, 9999 for pro
    4. Extends user.expires_at by 30 days
    5. Clears cache
    6. Sends confirmation message to user via Telegram Bot
    """
    if sub_request.status != SubscriptionRequest.Status.PENDING:
        return False

    sub_request.status = SubscriptionRequest.Status.APPROVED
    sub_request.reviewed_at = timezone.now()
    sub_request.admin_note = f"Tasdiqladi: {reviewer_label}"
    sub_request.save(update_fields=["status", "reviewed_at", "admin_note"])

    user = sub_request.user
    target_plan = sub_request.plan_type
    user.plan = target_plan
    user.cars_limit = 15 if target_plan == "standard" else 9999

    now = timezone.now()
    base_time = user.expires_at if (user.expires_at and user.expires_at > now) else now
    user.expires_at = base_time + timedelta(days=30)
    user.save(update_fields=["plan", "cars_limit", "expires_at"])

    invalidate_tenant_cache(user.id, user.telegram_id)

    # Deliver Telegram notification to user
    if user.telegram_id:
        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        if bot_token and bot_token != "dev_bot_token_123456":
            import asyncio
            from aiogram import Bot
            from apps.bot.handlers import get_miniapp_inline_keyboard

            plan_name = sub_request.get_plan_type_display()
            expires_str = timezone.localtime(user.expires_at).strftime("%d.%m.%Y")
            msg = (
                f"🎉 <b>Tabriklaymiz!</b>\n\n"
                f"Sizning <b>{plan_name}</b> obunangiz <b>30 kunga</b> faollashtirildi!\n"
                f"⏳ Yangi amal qilish muddati: <b>{expires_str}</b> gacha.\n\n"
                f"<i>Carenda xizmatidan foydalanganingiz uchun rahmat!</i>"
            )

            async def _send():
                bot = Bot(token=bot_token)
                try:
                    await bot.send_message(
                        chat_id=user.telegram_id,
                        text=msg,
                        parse_mode="HTML",
                        reply_markup=get_miniapp_inline_keyboard(),
                    )
                finally:
                    await bot.session.close()

            try:
                asyncio.run(_send())
            except Exception as e:
                logger.warning("Failed to notify user of subscription approval: %s", e)

    return True


def process_subscription_rejection(
    sub_request: SubscriptionRequest,
    reviewer_label: str = "Admin",
    reason: str = "",
) -> bool:
    """
    Rejects a pending subscription request and notifies user.
    """
    if sub_request.status != SubscriptionRequest.Status.PENDING:
        return False

    sub_request.status = SubscriptionRequest.Status.REJECTED
    sub_request.reviewed_at = timezone.now()
    sub_request.admin_note = f"Rad etdi: {reviewer_label}" + (f" ({reason})" if reason else "")
    sub_request.save(update_fields=["status", "reviewed_at", "admin_note"])

    user = sub_request.user
    if user.telegram_id:
        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        if bot_token and bot_token != "dev_bot_token_123456":
            import asyncio
            from aiogram import Bot

            plan_name = sub_request.get_plan_type_display()
            msg = (
                f"❌ <b>Obuna to'lovi tasdiqlanmadi</b>\n\n"
                f"Sizning <b>{plan_name}</b> tarifi uchun yuborgan to'lov so'rovingiz tasdiqlanmadi.\n"
                f"Iltimos, to'lov muvaffaqiyatli amalga oshganini tekshiring yoki administrator bilan bog'laning."
            )

            async def _send():
                bot = Bot(token=bot_token)
                try:
                    await bot.send_message(
                        chat_id=user.telegram_id,
                        text=msg,
                        parse_mode="HTML",
                    )
                finally:
                    await bot.session.close()

            try:
                asyncio.run(_send())
            except Exception as e:
                logger.warning("Failed to notify user of subscription rejection: %s", e)

    return True
