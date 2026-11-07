import asyncio
import logging

from aiogram import Bot, Dispatcher
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.bot.handlers import router
from apps.bot.services import send_daily_overdue_notifications

logger = logging.getLogger(__name__)


async def main():
    logging.basicConfig(level=logging.INFO)

    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token or bot_token == "dev_bot_token_123456":
        logger.warning(
            "TELEGRAM_BOT_TOKEN is using the dev fallback token. "
            "Ensure BOT_TOKEN is configured in .env for production."
        )

    bot = Bot(token=bot_token)
    dp = Dispatcher()
    dp.include_router(router)

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
