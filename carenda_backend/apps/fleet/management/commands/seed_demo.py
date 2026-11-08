from datetime import timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.fleet.models import Car, Driver, Payment
from apps.fleet.services import (
    create_car_service,
    create_contract_service,
    invalidate_tenant_cache,
    record_payment_service,
)
from apps.users.models import User, UserSetting


class Command(BaseCommand):
    help = "Seeds initial demo data into PostgreSQL for the Demo Arendator and test users."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("🌱 Starting Carenda demo data seeding..."))

        # 1. Create or Update Demo Arendator
        demo_owner, created = User.objects.get_or_create(
            telegram_id=999999999,
            defaults={
                "username": "demo_arendator",
                "full_name": "Demo Arendator",
                "phone": "+998901234567",
                "role": User.RoleChoices.ARENDATOR,
                "is_registered": True,
                "tenant_code": "AR-7777",
                "cars_limit": 50,
                "plan": User.Plan.PRO,
                "expires_at": timezone.now() + timedelta(days=365),
            },
        )
        if not created:
            demo_owner.username = "demo_arendator"
            demo_owner.full_name = "Demo Arendator"
            demo_owner.phone = "+998901234567"
            demo_owner.role = User.RoleChoices.ARENDATOR
            demo_owner.is_registered = True
            demo_owner.tenant_code = "AR-7777"
            demo_owner.cars_limit = 50
            demo_owner.plan = User.Plan.PRO
            demo_owner.expires_at = timezone.now() + timedelta(days=365)
            demo_owner.save()

        user_setting, _ = UserSetting.objects.get_or_create(owner=demo_owner)
        user_setting.default_annual_percent = Decimal("20.00")
        user_setting.save()

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Demo Arendator ready: {demo_owner.full_name} (@{demo_owner.username}, Code: {demo_owner.tenant_code})"
            )
        )

        # 2. Check if demo owner already has cars
        if demo_owner.cars.count() > 0:
            self.stdout.write(
                self.style.WARNING(
                    f"Demo Arendator already has {demo_owner.cars.count()} cars. Seeding skipped."
                )
            )
            invalidate_tenant_cache(demo_owner.id, demo_owner.telegram_id)
            return

        # 3. Create 3 Realistic Cars
        car1 = create_car_service(
            owner=demo_owner,
            name="Chevrolet Gentra",
            plate_number="01A777AA",
            default_price=Decimal("12000.00"),
        )
        car2 = create_car_service(
            owner=demo_owner,
            name="Chevrolet Cobalt",
            plate_number="01B888BB",
            default_price=Decimal("11000.00"),
        )
        car3 = create_car_service(
            owner=demo_owner,
            name="Chevrolet Tracker",
            plate_number="01C999CC",
            default_price=Decimal("19000.00"),
        )
        self.stdout.write(self.style.SUCCESS("✓ Created 3 cars (Gentra, Cobalt, Tracker)"))

        # 4. Create 2 Drivers (User + Driver profile)
        driver1_user, _ = User.objects.get_or_create(
            telegram_id=888111222,
            defaults={
                "username": "jasur_haydovchi",
                "full_name": "Jasur Aliyev",
                "phone": "+998909876543",
                "role": User.RoleChoices.USER,
                "parent_owner": demo_owner,
                "is_registered": True,
            },
        )
        driver1, _ = Driver.objects.get_or_create(
            owner=demo_owner,
            phone="+998909876543",
            defaults={
                "full_name": "Jasur Aliyev",
                "passport_info": "AA1234567",
                "user": driver1_user,
            },
        )
        if not driver1.user:
            driver1.user = driver1_user
            driver1.save(update_fields=["user"])

        driver2_user, _ = User.objects.get_or_create(
            telegram_id=888333444,
            defaults={
                "username": "sardor_haydovchi",
                "full_name": "Sardor Rahimov",
                "phone": "+998935556677",
                "role": User.RoleChoices.USER,
                "parent_owner": demo_owner,
                "is_registered": True,
            },
        )
        driver2, _ = Driver.objects.get_or_create(
            owner=demo_owner,
            phone="+998935556677",
            defaults={
                "full_name": "Sardor Rahimov",
                "passport_info": "AB7654321",
                "user": driver2_user,
            },
        )
        if not driver2.user:
            driver2.user = driver2_user
            driver2.save(update_fields=["user"])

        self.stdout.write(self.style.SUCCESS("✓ Created 2 drivers (Jasur Aliyev, Sardor Rahimov)"))

        today = timezone.localdate()

        # 5. Contract 1: Gentra + Jasur (1 paid payment)
        contract1 = create_contract_service(
            owner=demo_owner,
            car=car1,
            driver=driver1,
            car_price=Decimal("12000.00"),
            initial_payment=Decimal("2000.00"),
            months_count=12,
            payment_day=10,
            start_date=today - relativedelta(months=1),
            annual_percent=Decimal("20.00"),
        )
        first_payment = contract1.payments.filter(month_number=1).first()
        if first_payment:
            record_payment_service(
                owner=demo_owner,
                payment=first_payment,
                amount=first_payment.expected_amount,
                comment="1-oy to'lovi to'liq qabul qilindi",
            )
        self.stdout.write(self.style.SUCCESS("✓ Created Contract 1 (Gentra) with 1 paid payment"))

        # 6. Contract 2: Cobalt + Sardor (1 overdue payment)
        contract2 = create_contract_service(
            owner=demo_owner,
            car=car2,
            driver=driver2,
            car_price=Decimal("11000.00"),
            initial_payment=Decimal("2000.00"),
            months_count=12,
            payment_day=5,
            start_date=today - relativedelta(months=2),
            annual_percent=Decimal("20.00"),
        )
        overdue_payment = contract2.payments.filter(month_number=1).first()
        if overdue_payment:
            overdue_payment.due_date = today - timedelta(days=5)
            overdue_payment.status = Payment.Status.PENDING
            overdue_payment.save(update_fields=["due_date", "status"])

        self.stdout.write(self.style.SUCCESS("✓ Created Contract 2 (Cobalt) with 1 overdue payment"))
        self.stdout.write(self.style.SUCCESS("✓ Car 3 (Tracker) remains AVAILABLE in fleet"))

        # Invalidate all caches
        invalidate_tenant_cache(demo_owner.id, demo_owner.telegram_id)
        self.stdout.write(self.style.SUCCESS("🎉 Seeding complete! Database successfully populated."))
