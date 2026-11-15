from django.core.management.base import BaseCommand
from apps.bot.tasks import (
    send_daily_overdue_alerts_task,
    send_payment_notifications,
)


class Command(BaseCommand):
    help = "Triggers both Arendator overdue alerts and Ijarachi payment notifications."

    def add_arguments(self, parser):
        parser.add_argument(
            "--async",
            dest="use_async",
            action="store_true",
            help="Queue tasks in Celery worker instead of running synchronously",
        )

    def handle(self, *args, **options):
        if options.get("use_async"):
            self.stdout.write("Dispatching notification tasks via Celery...")
            task_arendator = send_daily_overdue_alerts_task.delay()
            task_ijarachi = send_payment_notifications.delay()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Tasks queued: arendator={task_arendator.id}, ijarachi={task_ijarachi.id}"
                )
            )
            return

        self.stdout.write("Running notification scheduler synchronously...")
        ar_count = send_daily_overdue_alerts_task()
        ij_count = send_payment_notifications()
        self.stdout.write(
            self.style.SUCCESS(
                f"Notifications completed: {ar_count} arendator alerts, {ij_count} ijarachi notifications."
            )
        )
