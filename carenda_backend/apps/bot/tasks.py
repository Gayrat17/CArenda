import asyncio
import logging
from celery import shared_task
from aiogram import Bot
from django.conf import settings

from apps.bot.services import (
    send_arendator_overdue_notifications,
    send_ijarachi_payment_notifications,
)

logger = logging.getLogger(__name__)


def _run_with_bot(coro_factory, task_name: str) -> int:
    """Initializes the Aiogram Bot safely, executes `coro_factory(bot)`, and closes the session."""
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token or bot_token == "dev_bot_token_123456":
        logger.info("Bot token not configured or default dev token; skipping %s.", task_name)
        return 0

    async def _runner():
        bot = Bot(token=bot_token)
        try:
            return await coro_factory(bot)
        finally:
            await bot.session.close()

    try:
        return asyncio.run(_runner())
    except Exception as e:
        logger.error("Error executing %s: %s", task_name, e)
        return 0


@shared_task(name="apps.bot.tasks.send_daily_overdue_alerts_task")
def send_daily_overdue_alerts_task() -> int:
    """
    Celery background task to trigger daily overdue alerts to all Arendators.
    Runs every morning at 09:00 Asia/Tashkent via Celery Beat or manual trigger.
    """
    count = _run_with_bot(send_arendator_overdue_notifications, "send_daily_overdue_alerts_task")
    logger.info("Overdue alerts sent to %s tenants via Celery task.", count)
    return count


@shared_task(name="apps.bot.tasks.send_payment_notifications")
def send_payment_notifications() -> int:
    """
    Celery background task enforcing exact 7-day, due-today, and daily overdue
    Telegram payment notifications for onboarded Ijarachi clients.
    """
    count = _run_with_bot(send_ijarachi_payment_notifications, "send_payment_notifications")
    logger.info("Payment notifications sent to %s Ijarachi installments.", count)
    return count


@shared_task(name="apps.bot.tasks.send_payment_receipt_notification_task")
def send_payment_receipt_notification_task(payment_id: int, amount_paid: str) -> bool:
    """
    Asynchronously delivers a receipt message to the driver (user) when a payment is recorded.
    """
    from apps.fleet.models import Payment
    from apps.bot.handlers import get_client_miniapp_inline_keyboard

    try:
        payment = Payment.objects.select_related(
            "contract",
            "contract__car",
            "contract__driver",
            "contract__driver__user",
            "contract__owner",
        ).get(id=payment_id)
    except Payment.DoesNotExist:
        logger.warning(f"Payment {payment_id} not found for receipt notification.")
        return False

    driver = payment.contract.driver
    driver_user = driver.user if driver else None
    if not driver_user or not driver_user.telegram_id:
        return False

    # Only send receipt notification if driver has completed full onboarding and has phone
    if not getattr(driver_user, "is_onboarded", False) or not (getattr(driver_user, "phone_number", None) or getattr(driver_user, "phone", None)):
        logger.info(f"Driver user {driver_user.id} has not completed onboarding; skipping receipt alert.")
        return False

    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token or bot_token == "dev_bot_token_123456":
        return False

    car_name = payment.contract.car.name
    plate_number = payment.contract.car.plate_number
    owner_name = payment.contract.owner.full_name or payment.contract.owner.username

    text = (
        f"💳 <b>To'lov qabul qilindi!</b>\n\n"
        f"🚗 Avtomobil: <b>{car_name} ({plate_number})</b>\n"
        f"🏢 Arendator: <b>{owner_name}</b>\n"
        f"💵 Qabul qilingan summa: <b>${amount_paid}</b>\n"
        f"📅 Sana: <b>{payment.month_number}-oy to'lovi ({payment.due_date})</b>\n"
        f"📊 Qolgan qarzdorlik: <b>${payment.remaining_amount:.2f}</b>\n\n"
        f"<i>To'lovlar jadvali bilan shaxsiy kabinetingizda tanishishingiz mumkin.</i>"
    )

    async def _send():
        bot = Bot(token=bot_token)
        try:
            await bot.send_message(
                chat_id=driver_user.telegram_id,
                text=text,
                parse_mode="HTML",
                reply_markup=get_client_miniapp_inline_keyboard(),
            )
            return True
        finally:
            await bot.session.close()

    try:
        return asyncio.run(_send())
    except Exception as e:
        logger.error(f"Failed to send payment receipt notification for payment {payment_id}: {e}")
        return False
