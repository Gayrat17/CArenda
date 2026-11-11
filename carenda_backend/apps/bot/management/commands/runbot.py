import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.bot.handlers import router
from apps.bot.services import send_daily_overdue_notifications

logger = logging.getLogger(__name__)


def get_fsm_storage():
    """Uses persistent RedisStorage when Redis is online, falling back to MemoryStorage."""
    if getattr(settings, "REDIS_ONLINE", False):
        try:
            from aiogram.fsm.storage.redis import RedisStorage
            redis_url = getattr(settings, "REDIS_URL", "redis://127.0.0.1:6379/0")
            storage = RedisStorage.from_url(redis_url)
            logger.info("Bot FSM storage initialized with RedisStorage (%s).", redis_url)
            return storage
        except Exception as e:
            logger.warning("Failed to initialize RedisStorage (%s), falling back to MemoryStorage.", e)
    return MemoryStorage()


async def main():
    logging.basicConfig(level=logging.INFO)

    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token or bot_token == "dev_bot_token_123456":
        logger.warning(
            "TELEGRAM_BOT_TOKEN is using the dev fallback token. "
            "Ensure BOT_TOKEN is configured in .env for production."
        )

    bot = Bot(token=bot_token)
    dp = Dispatcher(storage=get_fsm_storage())
    dp.include_router(router)

    try:
        await bot.delete_webhook(drop_pending_updates=False)
    except Exception as e:
        logger.warning("Could not delete webhook before polling: %s", e)

    # Initialize APScheduler for daily 09:00 alerts in Tashkent timezone
    scheduler = AsyncIOScheduler(timezone="Asia/Tashkent")
    scheduler.add_job(
        send_daily_overdue_notifications,
        trigger="cron",
        hour=9,
        minute=0,
        args=[bot],
        id="daily_overdue_alerts",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler started: Daily overdue alerts scheduled at 09:00 Asia/Tashkent.")

    try:
        logger.info("Starting Telegram Bot long-polling...")
        await dp.start_polling(bot)
    finally:
        scheduler.shutdown()
        await bot.session.close()


class Command(BaseCommand):
    help = "Starts the Carenda Aiogram 3 Telegram Bot and the daily APScheduler."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Launching Carenda Telegram Bot..."))
        try:
            asyncio.run(main())
        except (KeyboardInterrupt, SystemExit):
            self.stdout.write(self.style.WARNING("Carenda Bot stopped gracefully."))
