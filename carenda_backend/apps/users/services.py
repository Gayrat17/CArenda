from datetime import timedelta
import logging
from django.conf import settings
from django.utils import timezone

from apps.fleet.services import invalidate_tenant_cache
from apps.users.models import SubscriptionRequest, User

logger = logging.getLogger(__name__)


def grant_arendator_subscription(
    user: User,
    days: int = 30,
    plan_type: str = "standard",
    notify: bool = True,
) -> User:
    """
    Upgrades/extends an Arendator's subscription to Standart for `days` days,
    unfreezes the account, clears tenant caches, and sends a Telegram confirmation message.
    """
    user.plan = plan_type if plan_type in ("pro", "standard") else "standard"
    user.cars_limit = 9999
    user.is_frozen = False

    now = timezone.now()
    base_time = (
        user.subscription_expires_at
        if (user.subscription_expires_at and user.subscription_expires_at > now)
        else (user.expires_at if (user.expires_at and user.expires_at > now) else now)
    )
    new_expires = base_time + timedelta(days=days)
    user.subscription_expires_at = new_expires
    user.expires_at = new_expires
    user.save(update_fields=["plan", "cars_limit", "is_frozen", "subscription_expires_at", "expires_at"])

    invalidate_tenant_cache(user.id, user.telegram_id)

    if notify and user.telegram_id:
        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        if bot_token and bot_token != "dev_bot_token_123456":
            import asyncio
            from aiogram import Bot
            from apps.bot.handlers import get_miniapp_inline_keyboard

            plan_name = "Standart" if user.plan == "standard" else "Pro (Premium)"
            expires_str = timezone.localtime(user.expires_at).strftime("%d.%m.%Y")
            msg = (
                f"🎉 <b>Tabriklaymiz!</b>\n\n"
                f"Sizning <b>{plan_name}</b> obunangiz <b>{days} kunga</b> faollashtirildi!\n"
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
                logger.warning("Failed to notify user of subscription grant: %s", e)

    return user


def process_subscription_approval(
    sub_request: SubscriptionRequest,
    reviewer_label: str = "Admin",
) -> bool:
    """
    Approves a pending subscription request:
    1. Sets sub_request.status = 'approved'
    2. Grants/extends Standart subscription via grant_arendator_subscription
    """
    if sub_request.status != SubscriptionRequest.Status.PENDING:
        return False

    sub_request.status = SubscriptionRequest.Status.APPROVED
    sub_request.reviewed_at = timezone.now()
    sub_request.admin_note = f"Tasdiqladi: {reviewer_label}"
    sub_request.save(update_fields=["status", "reviewed_at", "admin_note"])

    grant_arendator_subscription(
        user=sub_request.user,
        days=30,
        plan_type=sub_request.plan_type,
        notify=True,
    )
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
