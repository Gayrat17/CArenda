from datetime import timedelta
from django.db import migrations
from django.utils import timezone


def backfill_free_subscription(apps, schema_editor):
    User = apps.get_model("users", "User")
    for user in User.objects.all():
        p = (user.plan or "").lower()
        if p in ("trial", "free", ""):
            user.plan = "free"
            if user.cars_limit < 3:
                user.cars_limit = 3
            base_date = user.date_joined if user.date_joined else timezone.now()
            user.trial_ends_at = base_date + timedelta(days=60)
            user.expires_at = user.trial_ends_at
            user.save(update_fields=["plan", "cars_limit", "trial_ends_at", "expires_at"])


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_subscriptionsettings_delete_paymentsettings_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_free_subscription, reverse_code=migrations.RunPython.noop),
    ]
