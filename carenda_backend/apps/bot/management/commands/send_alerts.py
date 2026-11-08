import asyncio
from aiogram import Bot
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.bot.services import send_daily_overdue_notifications
from apps.bot.tasks import send_daily_overdue_alerts_task


async def execute_send():
    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    try:
        count = await send_daily_overdue_notifications(bot)
        return count
    finally:
        await bot.session.close()


class Command(BaseCommand):
    help = "Manually sends overdue payment notifications to all active tenants (directly or via Celery)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--async",
            dest="use_async",
            action="store_true",
            help="Dispatch via Celery worker instead of running synchronously",
        )

    def handle(self, *args, **options):
        if options.get("use_async"):
            self.stdout.write("Queueing overdue alert task in Celery...")
            try:
                task = send_daily_overdue_alerts_task.delay()
                self.stdout.write(self.style.SUCCESS(f"Task queued successfully with ID: {task.id}"))
                return
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Celery queue failed ({e}), falling back to direct run..."))

        self.stdout.write("Checking and dispatching overdue alerts to tenants...")
        count = asyncio.run(execute_send())
        self.stdout.write(
            self.style.SUCCESS(f"Successfully dispatched alerts to {count} tenant(s).")
        )
