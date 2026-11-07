from datetime import date, timedelta
from decimal import Decimal

from django.contrib.admin.sites import site
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase
from django.utils import timezone

from apps.fleet.admin import ContractAdmin
from apps.fleet.models import Car, Contract, Driver, Payment
from apps.fleet.services import (
    calculate_contract_totals,
    close_contract_service,
    create_car_service,
    create_contract_service,
    record_payment_service,
)
from apps.users.models import User, UserSetting


class FleetModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="arendator",
            email="arendator@carenda.uz",
            password="securepassword123",
            full_name="Jamshid Karimov",
            phone="+998901112233",
            telegram_id=987654321,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.car = Car.objects.create(
            owner=self.owner,
            name="Chevrolet Tracker",
            plate_number="01T777TT",
            default_price=Decimal("18000.00"),
            status=Car.Status.AVAILABLE,
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            full_name="Bobur Mirzo",
            phone="+998935556677",
            passport_info="AA1234567",
            notes="Tajribali haydovchi",
        )

    def test_car_creation_and_str(self):
        self.assertEqual(str(self.car), "Chevrolet Tracker (01T777TT)")
        self.assertEqual(self.car.status, Car.Status.AVAILABLE)
        self.assertEqual(self.car.default_price, Decimal("18000.00"))

    def test_car_unique_owner_plate_constraint(self):
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Car.objects.create(
                    owner=self.owner,
                    name="Another Tracker",
                    plate_number="01T777TT",
                )

        other_owner = User.objects.create_user(
            username="other_arendator",
            email="other@carenda.uz",
            password="pass",
        )
        other_car = Car.objects.create(
            owner=other_owner,
            name="Different Owner Tracker",
            plate_number="01T777TT",
        )
        self.assertIsNotNone(other_car.pk)

    def test_driver_creation_and_str(self):
        self.assertEqual(str(self.driver), "Bobur Mirzo (+998935556677)")
        self.assertEqual(self.driver.owner, self.owner)

    def test_contract_creation_and_financial_calculations(self):
        contract = Contract.objects.create(
            owner=self.owner,
            car=self.car,
            driver=self.driver,
            car_price=Decimal("15000.00"),
            initial_payment=Decimal("3000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=15,
            start_date=date(2026, 1, 1),
        )
        self.assertEqual(contract.principal_amount, Decimal("12000.00"))
        self.assertEqual(contract.total_amount, Decimal("14400.00"))
        self.assertEqual(contract.monthly_amount, Decimal("1200.00"))
        self.assertTrue(contract.is_active)
        self.assertIn("Contract #", str(contract))

    def test_payment_creation_and_remaining_amount(self):
        contract = Contract.objects.create(
            owner=self.owner,
            car=self.car,
            driver=self.driver,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("15.00"),
            months_count=6,
            payment_day=10,
            start_date=date(2026, 1, 1),
        )
        payment = Payment.objects.create(
            contract=contract,
            month_number=1,
            due_date=date(2026, 2, 10),
            expected_amount=Decimal("1500.00"),
            paid_amount=Decimal("500.00"),
            status=Payment.Status.PARTIAL,
        )
        self.assertEqual(payment.remaining_amount, Decimal("1000.00"))

        payment.paid_amount = Decimal("1500.00")
        payment.status = Payment.Status.PAID
        self.assertEqual(payment.remaining_amount, Decimal("0.00"))

        payment.paid_amount = Decimal("1600.00")
        self.assertEqual(payment.remaining_amount, Decimal("0.00"))

    def test_payment_ordering(self):
        contract = Contract.objects.create(
            owner=self.owner,
            car=self.car,
            driver=self.driver,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("0.00"),
            annual_percent=Decimal("10.00"),
            months_count=3,
            payment_day=5,
            start_date=date(2026, 1, 1),
        )
        p2 = Payment.objects.create(
            contract=contract,
            month_number=2,
            due_date=date(2026, 3, 5),
            expected_amount=Decimal("1000.00"),
        )
        p1 = Payment.objects.create(
            contract=contract,
            month_number=1,
            due_date=date(2026, 2, 5),
            expected_amount=Decimal("1000.00"),
        )
        payments = list(contract.payments.all())
        self.assertEqual(payments, [p1, p2])


class AdminRegistrationTests(TestCase):
    def test_all_models_registered_in_admin(self):
        registered_models = site._registry.keys()
        self.assertIn(User, registered_models)
        self.assertIn(UserSetting, registered_models)
        self.assertIn(Car, registered_models)
        self.assertIn(Driver, registered_models)
        self.assertIn(Contract, registered_models)
        self.assertIn(Payment, registered_models)

    def test_contract_admin_has_payment_inline(self):
        contract_admin = site._registry[Contract]
        inline_models = [inline.model for inline in contract_admin.inlines]
        self.assertIn(Payment, inline_models)


class FleetServiceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="service_owner",
            email="owner@carenda.uz",
            password="pass",
            full_name="Anvar Rahimov",
            phone="+998901230000",
            telegram_id=111222333,
            cars_limit=3,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.other_owner = User.objects.create_user(
            username="rival_owner",
            email="rival@carenda.uz",
            password="pass",
            full_name="Rustam Qodirov",
            phone="+998909990000",
            telegram_id=444555666,
            cars_limit=3,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            full_name="Haydovchi Ali",
            phone="+998931112233",
        )

    def test_calculate_contract_totals_benchmarks(self):
        # Benchmark 1: 5000 - 2000 at 25% for 12 months -> principal=3000.00, total=3750.00, monthly=312.50
        res1 = calculate_contract_totals(
            car_price=Decimal("5000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("25.00"),
            months_count=12,
        )
        self.assertEqual(res1["principal_amount"], Decimal("3000.00"))
        self.assertEqual(res1["total_amount"], Decimal("3750.00"))
        self.assertEqual(res1["monthly_amount"], Decimal("312.50"))

        # Benchmark 2: 5000 - 2000 at 20% for 24 months -> principal=3000.00, total=4200.00, monthly=175.00
        res2 = calculate_contract_totals(
            car_price=Decimal("5000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=24,
        )
        self.assertEqual(res2["principal_amount"], Decimal("3000.00"))
        self.assertEqual(res2["total_amount"], Decimal("4200.00"))
        self.assertEqual(res2["monthly_amount"], Decimal("175.00"))

    def test_calculate_contract_totals_validations(self):
        with self.assertRaises(ValidationError) as ctx:
            calculate_contract_totals(
                car_price=Decimal("0.00"),
                initial_payment=Decimal("0.00"),
                annual_percent=Decimal("20.00"),
                months_count=12,
            )
        self.assertIn("Mashina narxi 0 dan katta", str(ctx.exception))

        with self.assertRaises(ValidationError) as ctx:
            calculate_contract_totals(
                car_price=Decimal("5000.00"),
                initial_payment=Decimal("5000.00"),
                annual_percent=Decimal("20.00"),
                months_count=12,
            )
        self.assertIn("kam bo'lishi kerak", str(ctx.exception))

        with self.assertRaises(ValidationError) as ctx:
            calculate_contract_totals(
                car_price=Decimal("5000.00"),
                initial_payment=Decimal("-100.00"),
                annual_percent=Decimal("20.00"),
                months_count=12,
            )
        self.assertIn("manfiy bo'lishi mumkin emas", str(ctx.exception))

        with self.assertRaises(ValidationError) as ctx:
            calculate_contract_totals(
                car_price=Decimal("5000.00"),
                initial_payment=Decimal("1000.00"),
                annual_percent=Decimal("20.00"),
                months_count=0,
            )
        self.assertIn("kamida 1 oy", str(ctx.exception))

    def test_create_car_service_success_and_normalization(self):
        car = create_car_service(
            owner=self.owner,
            name="  Chevrolet Onix  ",
            plate_number="  01a777bc  ",
            default_price=Decimal("12000.00"),
        )
        self.assertEqual(car.name, "Chevrolet Onix")
        self.assertEqual(car.plate_number, "01A777BC")
        self.assertEqual(car.status, Car.Status.AVAILABLE)

    def test_create_car_service_expired_subscription(self):
        self.owner.expires_at = timezone.now() - timedelta(days=1)
        self.owner.save()
        with self.assertRaises(ValidationError) as ctx:
            create_car_service(
                owner=self.owner,
                name="Chevrolet Onix",
                plate_number="01A123BC",
            )
        self.assertIn("Obuna muddatingiz tugagan", str(ctx.exception))

    def test_create_car_service_quota_limit(self):
        self.owner.cars_limit = 1
        self.owner.save()
        create_car_service(
            owner=self.owner,
            name="Car 1",
            plate_number="01A001AA",
        )
        with self.assertRaises(ValidationError) as ctx:
            create_car_service(
                owner=self.owner,
                name="Car 2",
                plate_number="01A002AA",
            )
        self.assertIn("Tarif bo'yicha mashinalar limiti to'lgan", str(ctx.exception))

    def test_create_contract_service_with_setting_fallback_and_day_31_february(self):
        UserSetting.objects.create(
            owner=self.owner,
            default_annual_percent=Decimal("20.00"),
        )
        car = create_car_service(
            owner=self.owner,
            name="Tracker 2",
            plate_number="01X999XX",
            default_price=Decimal("5000.00"),
        )

        # start_date on Jan 31, 2026, payment_day=31, months_count=3
        contract = create_contract_service(
            owner=self.owner,
            car=car,
            driver=self.driver,
            car_price=Decimal("5000.00"),
            initial_payment=Decimal("2000.00"),
            months_count=3,
            payment_day=31,
            start_date=date(2026, 1, 31),
            annual_percent=None,  # Fallback to UserSetting 20%
        )

        self.assertEqual(contract.annual_percent, Decimal("20.00"))
        car.refresh_from_db()
        self.assertEqual(car.status, Car.Status.RENTED)

        # Verify payments bulk-created with clamped day for February
        payments = list(contract.payments.order_by("month_number"))
        self.assertEqual(len(payments), 3)

        # Month 1: Feb 2026 (non-leap year, 28 days) -> clamped to Feb 28, 2026
        self.assertEqual(payments[0].due_date, date(2026, 2, 28))
        # Month 2: Mar 2026 (31 days) -> Mar 31, 2026
        self.assertEqual(payments[1].due_date, date(2026, 3, 31))
        # Month 3: Apr 2026 (30 days) -> clamped to Apr 30, 2026
        self.assertEqual(payments[2].due_date, date(2026, 4, 30))

    def test_create_contract_cross_tenant_and_availability_blocks(self):
        car = create_car_service(
            owner=self.owner,
            name="Cobalt",
            plate_number="01C555CC",
        )
        rival_driver = Driver.objects.create(
            owner=self.other_owner,
            full_name="Rival Driver",
            phone="+998900000000",
        )

        # Cross-tenant driver blocked
        with self.assertRaises(ValidationError) as ctx:
            create_contract_service(
                owner=self.owner,
                car=car,
                driver=rival_driver,
                car_price=Decimal("5000.00"),
                initial_payment=Decimal("2000.00"),
                months_count=12,
                payment_day=10,
                start_date=date(2026, 1, 1),
                annual_percent=Decimal("20.00"),
            )
        self.assertIn("sizga tegishli emas", str(ctx.exception))

        # Successfully create first contract
        create_contract_service(
            owner=self.owner,
            car=car,
            driver=self.driver,
            car_price=Decimal("5000.00"),
            initial_payment=Decimal("2000.00"),
            months_count=12,
            payment_day=10,
            start_date=date(2026, 1, 1),
            annual_percent=Decimal("20.00"),
        )

        # Second contract on same car blocked (car is rented)
        with self.assertRaises(ValidationError) as ctx:
            create_contract_service(
                owner=self.owner,
                car=car,
                driver=self.driver,
                car_price=Decimal("5000.00"),
                initial_payment=Decimal("2000.00"),
                months_count=12,
                payment_day=10,
                start_date=date(2026, 1, 1),
                annual_percent=Decimal("20.00"),
            )
        self.assertIn("Avtomobil band yoki ta'mirda", str(ctx.exception))

    def test_record_payment_service_partial_and_full(self):
        car = create_car_service(
            owner=self.owner,
            name="Gentra",
            plate_number="01G888GG",
        )
        contract = create_contract_service(
            owner=self.owner,
            car=car,
            driver=self.driver,
            car_price=Decimal("5000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("25.00"),
            months_count=12,
            payment_day=15,
            start_date=date(2026, 1, 1),
        )
        payment = contract.payments.first()  # expected_amount: 312.50

        # Partial payment: 100.00 -> status "partial", remaining 212.50
        record_payment_service(
            owner=self.owner,
            payment=payment,
            amount=Decimal("100.00"),
            comment="Qisman to'lov",
        )
        payment.refresh_from_db()
        self.assertEqual(payment.paid_amount, Decimal("100.00"))
        self.assertEqual(payment.status, Payment.Status.PARTIAL)
        self.assertEqual(payment.remaining_amount, Decimal("212.50"))

        # Cross-tenant block: other_owner cannot pay on this payment
        with self.assertRaises(ValidationError) as ctx:
            record_payment_service(
                owner=self.other_owner,
                payment=payment,
                amount=Decimal("50.00"),
            )
        self.assertIn("sizga tegishli emas", str(ctx.exception))

        # Full completion: pay remaining 212.50 -> status "paid"
        record_payment_service(
            owner=self.owner,
            payment=payment,
            amount=Decimal("212.50"),
            comment="Qolgan qismi to'landi",
        )
        payment.refresh_from_db()
        self.assertEqual(payment.paid_amount, Decimal("312.50"))
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertEqual(payment.remaining_amount, Decimal("0.00"))

        # Cannot pay further on completed payment
        with self.assertRaises(ValidationError) as ctx:
            record_payment_service(
                owner=self.owner,
                payment=payment,
                amount=Decimal("10.00"),
            )
        self.assertIn("To'langan yoki bekor qilingan", str(ctx.exception))

    def test_close_contract_service_frees_car_and_cancels_pending(self):
        car = create_car_service(
            owner=self.owner,
            name="Spark",
            plate_number="01S333SS",
        )
        contract = create_contract_service(
            owner=self.owner,
            car=car,
            driver=self.driver,
            car_price=Decimal("5000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=6,
            payment_day=10,
            start_date=date(2026, 1, 1),
        )

        # Cross-tenant block: rival_owner cannot close owner's contract
        with self.assertRaises(ValidationError) as ctx:
            close_contract_service(
                owner=self.other_owner,
                contract=contract,
                close_note="Hacked close",
            )
        self.assertIn("sizga tegishli emas", str(ctx.exception))

        # Close contract properly
        closed = close_contract_service(
            owner=self.owner,
            contract=contract,
            close_note="Muddatidan oldin qaytarildi",
        )
        self.assertFalse(closed.is_active)
        self.assertIsNotNone(closed.closed_at)
        self.assertEqual(closed.close_note, "Muddatidan oldin qaytarildi")

        car.refresh_from_db()
        self.assertEqual(car.status, Car.Status.AVAILABLE)

        # Pending payments cancelled
        pending_count = contract.payments.filter(status=Payment.Status.PENDING).count()
        cancelled_count = contract.payments.filter(status=Payment.Status.CANCELLED).count()
        self.assertEqual(pending_count, 0)
        self.assertEqual(cancelled_count, 6)

        # Cannot close already closed contract
        with self.assertRaises(ValidationError) as ctx:
            close_contract_service(
                owner=self.owner,
                contract=contract,
            )
        self.assertIn("allaqachon yopilgan", str(ctx.exception))


class HealthCheckRouteTests(TestCase):
    def test_health_check_endpoint(self):
        client = Client()
        response = client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "ok", "service": "carenda_backend"},
        )
