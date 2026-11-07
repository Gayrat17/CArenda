import asyncio
from aiogram import Bot
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.bot.services import send_daily_overdue_notifications


async def execute_send():
    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    try:
        count = await send_daily_overdue_notifications(bot)
        return count
    finally:
        await bot.session.close()


class Command(BaseCommand):
    help = "Manually sends overdue payment notifications to all active tenants."

    def handle(self, *args, **options):
        self.stdout.write("Checking and dispatching overdue alerts to tenants...")
        count = asyncio.run(execute_send())
        self.stdout.write(
            self.style.SUCCESS(f"Successfully dispatched alerts to {count} tenant(s).")
        )
