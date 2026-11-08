from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.fleet.models import Car, Contract, Driver, Payment
from apps.users.models import User, UserSetting


class Command(BaseCommand):
    help = "Database dan foydalanuvchilar va ularga bog'liq barcha ma'lumotlarni tozalaydi"

    def add_arguments(self, parser):
        parser.add_argument(
            "--keep-superusers",
            action="store_true",
            help="Superuserlarni o'chirmasdan saqlab qolish",
        )

    def handle(self, *args, **options):
        keep_super = options.get("keep_superusers", False)

        self.stdout.write(self.style.WARNING("Tozalash jarayoni boshlanmoqda..."))

        with transaction.atomic():
            if keep_super:
                users_qs = User.objects.filter(is_superuser=False)
                owners_ids = users_qs.filter(role=User.RoleChoices.ARENDATOR).values_list("id", flat=True)

                payments_count = Payment.objects.filter(contract__owner_id__in=owners_ids).delete()[0]
                contracts_count = Contract.objects.filter(owner_id__in=owners_ids).delete()[0]
                cars_count = Car.objects.filter(owner_id__in=owners_ids).delete()[0]
                drivers_count = Driver.objects.filter(owner_id__in=owners_ids).delete()[0]
                settings_count = UserSetting.objects.filter(owner_id__in=owners_ids).delete()[0]
                users_count = users_qs.delete()[0]
            else:
                payments_count = Payment.objects.all().delete()[0]
                contracts_count = Contract.objects.all().delete()[0]
                cars_count = Car.objects.all().delete()[0]
                drivers_count = Driver.objects.all().delete()[0]
                settings_count = UserSetting.objects.all().delete()[0]
                users_count = User.objects.all().delete()[0]

            cache.clear()

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Ma'lumotlar bazasi muvaffaqiyatli tozalandi!\n"
                f"   - O'chirilgan foydalanuvchilar (Users): {users_count}\n"
                f"   - O'chirilgan sozlamalar (Settings): {settings_count}\n"
                f"   - O'chirilgan mashinalar (Cars): {cars_count}\n"
                f"   - O'chirilgan haydovchilar (Drivers): {drivers_count}\n"
                f"   - O'chirilgan shartnomalar (Contracts): {contracts_count}\n"
                f"   - O'chirilgan to'lovlar (Payments): {payments_count}\n"
                f"   - Kesh (Cache): Tozalandi"
            )
        )
