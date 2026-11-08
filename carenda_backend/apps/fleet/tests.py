from datetime import date, timedelta
from decimal import Decimal

from django.contrib.admin.sites import site
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

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


class FleetAPIIntegrationTests(TestCase):
    def setUp(self):
        self.client_a = APIClient()
        self.user_a = User.objects.create_user(
            username="tenant_a",
            full_name="Tenant A",
            phone="+998901111111",
            telegram_id=111111111,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=60),
        )
        UserSetting.objects.create(
            owner=self.user_a, default_annual_percent=Decimal("20.00")
        )
        self.client_a.force_authenticate(user=self.user_a)

        self.client_b = APIClient()
        self.user_b = User.objects.create_user(
            username="tenant_b",
            full_name="Tenant B",
            phone="+998902222222",
            telegram_id=222222222,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=60),
        )
        UserSetting.objects.create(
            owner=self.user_b, default_annual_percent=Decimal("20.00")
        )
        self.client_b.force_authenticate(user=self.user_b)

    def test_full_fleet_api_lifecycle(self):
        # 1. Create Car via API
        car_resp = self.client_a.post(
            "/api/v1/cars/",
            {
                "name": "Chevrolet Tracker Turbo",
                "plate_number": "01T888TT",
                "default_price": "19000.00",
            },
            format="json",
        )
        self.assertEqual(car_resp.status_code, 201)
        car_id = car_resp.json()["id"]

        # 2. Preview calculation endpoint
        calc_resp = self.client_a.post(
            "/api/v1/contracts/calculate/",
            {
                "car_price": "5000.00",
                "initial_payment": "2000.00",
                "months_count": 12,
                # annual_percent omitted to test fallback to 20.00%
            },
            format="json",
        )
        self.assertEqual(calc_resp.status_code, 200)
        calc_data = calc_resp.json()
        self.assertEqual(calc_data["principal_amount"], "3000.00")
        self.assertEqual(calc_data["total_amount"], "3600.00")
        self.assertEqual(calc_data["monthly_amount"], "300.00")

        # 3. Create Contract with inline driver creation
        today = timezone.localdate()
        contract_resp = self.client_a.post(
            "/api/v1/contracts/",
            {
                "car_id": car_id,
                "driver_full_name": "Haydovchi Olim",
                "driver_phone": "+998939998877",
                "car_price": "5000.00",
                "initial_payment": "2000.00",
                "annual_percent": "25.00",
                "months_count": 12,
                "payment_day": 15,
                "start_date": str(today - timedelta(days=75)),  # past start_date so month 2 is overdue
            },
            format="json",
        )
        self.assertEqual(contract_resp.status_code, 201)
        contract_data = contract_resp.json()
        contract_id = contract_data["id"]
        self.assertEqual(contract_data["monthly_amount"], "312.50")
        self.assertEqual(len(contract_data["payments"]), 12)

        # 4. Verify Car Detail includes active_contract with payments schedule
        car_detail_resp = self.client_a.get(f"/api/v1/cars/{car_id}/")
        self.assertEqual(car_detail_resp.status_code, 200)
        car_detail_data = car_detail_resp.json()
        self.assertEqual(car_detail_data["status"], "rented")
        self.assertIsNotNone(car_detail_data["active_contract"])
        self.assertEqual(
            len(car_detail_data["active_contract"]["payments"]), 12
        )

        first_payment = car_detail_data["active_contract"]["payments"][0]
        first_payment_id = first_payment["id"]

        # 5. Record Partial Payment (100.00 out of 312.50)
        pay_part_resp = self.client_a.post(
            f"/api/v1/payments/{first_payment_id}/pay/",
            {"amount": "100.00", "comment": "Qisman to'landi"},
            format="json",
        )
        self.assertEqual(pay_part_resp.status_code, 200)
        pay_part_data = pay_part_resp.json()
        self.assertEqual(pay_part_data["status"], "partial")
        self.assertEqual(pay_part_data["paid_amount"], "100.00")
        self.assertEqual(pay_part_data["remaining_amount"], "212.50")

        # 6. Complete remaining payment (212.50)
        pay_full_resp = self.client_a.post(
            f"/api/v1/payments/{first_payment_id}/pay/",
            {"amount": "212.50", "comment": "Qolgani to'landi"},
            format="json",
        )
        self.assertEqual(pay_full_resp.status_code, 200)
        pay_full_data = pay_full_resp.json()
        self.assertEqual(pay_full_data["status"], "paid")
        self.assertEqual(pay_full_data["remaining_amount"], "0.00")

        # 7. Verify Dashboard Endpoint
        dash_resp = self.client_a.get("/api/v1/dashboard/")
        self.assertEqual(dash_resp.status_code, 200)
        dash_data = dash_resp.json()
        self.assertEqual(dash_data["total_cars"], 1)
        self.assertEqual(dash_data["rented_cars"], 1)
        self.assertEqual(dash_data["active_contracts_count"], 1)
        self.assertEqual(dash_data["total_collected_usd"], "312.50")

        # 8. Verify Overdue Payments Endpoint
        overdue_resp = self.client_a.get("/api/v1/payments/overdue/")
        self.assertEqual(overdue_resp.status_code, 200)
        overdue_items = overdue_resp.json()
        self.assertTrue(len(overdue_items) >= 1)
        # Verify fields on overdue item
        item = overdue_items[0]
        self.assertIn("car_name", item)
        self.assertIn("plate_number", item)
        self.assertIn("driver_name", item)
        self.assertIn("remaining_amount", item)
        self.assertIn("days_overdue", item)

        # 9. Close Contract
        close_resp = self.client_a.post(
            f"/api/v1/contracts/{contract_id}/close/",
            {"close_note": "Muvaffaqiyatli topshirildi"},
            format="json",
        )
        self.assertEqual(close_resp.status_code, 200)
        close_data = close_resp.json()
        self.assertFalse(close_data["is_active"])

        # Car should be available again
        car_check = self.client_a.get(f"/api/v1/cars/{car_id}/").json()
        self.assertEqual(car_check["status"], "available")

        # 10. Attempting to delete car that has contracts should return 400
        del_fail_resp = self.client_a.delete(f"/api/v1/cars/{car_id}/")
        self.assertEqual(del_fail_resp.status_code, 400)
        self.assertIn("o'chirib bo'lmaydi", del_fail_resp.json()["detail"])

    def test_cross_tenant_isolation(self):
        # Create car, driver and contract under tenant A
        car_a = create_car_service(
            owner=self.user_a,
            name="Car A",
            plate_number="01A999AA",
        )
        driver_a = Driver.objects.create(
            owner=self.user_a,
            full_name="Driver A",
            phone="+998901234567",
        )
        contract_a = create_contract_service(
            owner=self.user_a,
            car=car_a,
            driver=driver_a,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=6,
            payment_day=10,
            start_date=timezone.localdate(),
        )
        payment_a = contract_a.payments.first()

        # Tenant B cannot access Tenant A's car
        self.assertEqual(
            self.client_b.get(f"/api/v1/cars/{car_a.id}/").status_code, 404
        )
        self.assertEqual(
            self.client_b.delete(f"/api/v1/cars/{car_a.id}/").status_code, 404
        )

        # Tenant B cannot access Tenant A's driver
        self.assertEqual(
            self.client_b.get(f"/api/v1/drivers/{driver_a.id}/").status_code, 404
        )

        # Tenant B cannot access Tenant A's contract
        self.assertEqual(
            self.client_b.get(f"/api/v1/contracts/{contract_a.id}/").status_code, 404
        )
        self.assertEqual(
            self.client_b.post(f"/api/v1/contracts/{contract_a.id}/close/").status_code, 404
        )

        # Tenant B cannot record payment on Tenant A's installment
        self.assertEqual(
            self.client_b.post(
                f"/api/v1/payments/{payment_a.id}/pay/",
                {"amount": "50.00"},
                format="json",
            ).status_code,
            404,
        )


class ExcelExportAndNotificationTests(TestCase):
    def setUp(self):
        self.client_a = APIClient()
        self.user_a = User.objects.create_user(
            username="excel_user_a",
            full_name="Excel User A",
            phone="+998901110001",
            telegram_id=999111,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=30),
        )
        UserSetting.objects.create(owner=self.user_a)
        self.client_a.force_authenticate(user=self.user_a)

        self.user_b = User.objects.create_user(
            username="excel_user_b",
            full_name="Excel User B",
            phone="+998901110002",
            telegram_id=999222,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=30),
        )
        UserSetting.objects.create(owner=self.user_b)

        # Create car & contract for user A
        self.car_a = create_car_service(
            owner=self.user_a,
            name="Chevrolet Gentra",
            plate_number="01A777AA",
            default_price=Decimal("12000.00"),
        )
        self.driver_a = Driver.objects.create(
            owner=self.user_a,
            full_name="Olim Haydovchi",
            phone="+998905554433",
        )
        self.contract_a = create_contract_service(
            owner=self.user_a,
            car=self.car_a,
            driver=self.driver_a,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=6,
            payment_day=10,
            start_date=timezone.localdate() - timedelta(days=40),
        )

        # Create car & contract for user B
        self.car_b = create_car_service(
            owner=self.user_b,
            name="Chevrolet Tracker",
            plate_number="01B888BB",
            default_price=Decimal("18000.00"),
        )
        self.driver_b = Driver.objects.create(
            owner=self.user_b,
            full_name="Rustam Haydovchi",
            phone="+998907776655",
        )
        self.contract_b = create_contract_service(
            owner=self.user_b,
            car=self.car_b,
            driver=self.driver_b,
            car_price=Decimal("15000.00"),
            initial_payment=Decimal("3000.00"),
            annual_percent=Decimal("20.00"),
            months_count=6,
            payment_day=10,
            start_date=timezone.localdate() - timedelta(days=40),
        )

    def test_generate_tenant_excel_report_and_export_view(self):
        import io
        import openpyxl
        from apps.fleet.excel import generate_tenant_excel_report

        excel_bytes = generate_tenant_excel_report(self.user_a)
        self.assertTrue(excel_bytes.startswith(b"PK"))  # Valid zip/xlsx header

        wb = openpyxl.load_workbook(io.BytesIO(excel_bytes))
        self.assertIn("Mashinalar va Shartnomalar", wb.sheetnames)
        self.assertIn("To'lovlar Jadvali", wb.sheetnames)

        # Test API Endpoint
        response = self.client_a.get("/api/v1/export/excel/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("carenda_hisobot.xlsx", response["Content-Disposition"])

    def test_build_overdue_summary_text_isolation_and_formatting(self):
        from apps.bot.services import build_overdue_summary_text

        text_a = build_overdue_summary_text(self.user_a)
        self.assertIsNotNone(text_a)
        self.assertIn("Chevrolet Gentra", text_a)
        self.assertIn("01A777AA", text_a)
        self.assertIn("Olim Haydovchi", text_a)

        # Multi-tenant isolation: User B's details must not leak
        self.assertNotIn("Chevrolet Tracker", text_a)
        self.assertNotIn("01B888BB", text_a)
        self.assertNotIn("Rustam Haydovchi", text_a)

        # When all overdue payments are paid
        for p in self.contract_a.payments.filter(due_date__lte=timezone.localdate()):
            p.status = Payment.Status.PAID
            p.paid_amount = p.expected_amount
            p.save()

        text_after_paid = build_overdue_summary_text(self.user_a)
        self.assertIsNone(text_after_paid)


class ClientPortalAndPermissionTests(TestCase):
    def setUp(self):
        from apps.fleet.models import normalize_phone

        self.normalize_phone = normalize_phone
        self.owner = User.objects.create_user(
            username="owner_farhod",
            full_name="Farhod Arendator",
            phone="+998901112233",
            role=User.RoleChoices.OWNER,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.car = Car.objects.create(
            owner=self.owner,
            name="Chevrolet Onix",
            plate_number="01O999OO",
            default_price=Decimal("16000.00"),
            status=Car.Status.AVAILABLE,
        )
        self.client_user = User.objects.create_user(
            username="client_dilshod",
            full_name="Dilshod Haydovchi",
            phone="+998909876543",
            role=User.RoleChoices.USER,
            parent_owner=self.owner,
            is_registered=True,
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            user=self.client_user,
            full_name="Dilshod Haydovchi",
            phone="+998909876543",
            passport_info="AB9998877",
        )
        self.contract = create_contract_service(
            owner=self.owner,
            car=self.car,
            driver=self.driver,
            car_price=Decimal("15000.00"),
            initial_payment=Decimal("3000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=15,
            start_date=timezone.localdate(),
        )

        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.client_user)

    def test_normalize_phone_helper(self):
        self.assertEqual(self.normalize_phone("+998 90 123-45-67"), "901234567")
        self.assertEqual(self.normalize_phone("8901234567"), "901234567")
        self.assertEqual(self.normalize_phone("+998 (90) 123 45 67"), "901234567")
        self.assertEqual(self.normalize_phone("901234567"), "901234567")
        self.assertEqual(self.normalize_phone(""), "")

    def test_user_driver_can_view_my_schedule(self):
        # Test /api/v1/my-schedule/
        response = self.client_api.get("/api/v1/my-schedule/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        contract_data = data[0]
        self.assertEqual(contract_data["car_name"], "Chevrolet Onix")
        self.assertEqual(contract_data["plate_number"], "01O999OO")
        self.assertEqual(contract_data["owner_name"], "Farhod Arendator")
        self.assertEqual(len(contract_data["payments"]), 12)

        # Also test backwards compatibility endpoint /api/v1/client/my-contracts/
        resp_compat = self.client_api.get("/api/v1/client/my-contracts/")
        self.assertEqual(resp_compat.status_code, 200)

    def test_user_driver_is_forbidden_from_arendator_endpoints(self):
        # User driver cannot view dashboard
        dash_resp = self.client_api.get("/api/v1/dashboard/")
        self.assertEqual(dash_resp.status_code, 403)

        # User driver cannot view or manage cars
        cars_resp = self.client_api.get("/api/v1/cars/")
        self.assertEqual(cars_resp.status_code, 403)

        # User driver cannot view drivers list
        drivers_resp = self.client_api.get("/api/v1/drivers/")
        self.assertEqual(drivers_resp.status_code, 403)

        # User driver cannot view contracts list
        contracts_resp = self.client_api.get("/api/v1/contracts/")
        self.assertEqual(contracts_resp.status_code, 403)

        # User driver cannot pay on behalf of owner
        payment = self.contract.payments.first()
        pay_resp = self.client_api.post(f"/api/v1/payments/{payment.id}/pay/", {"amount": "100.00"}, format="json")
        self.assertEqual(pay_resp.status_code, 403)

        # User driver cannot export excel
        excel_resp = self.client_api.get("/api/v1/export/excel/")
        self.assertEqual(excel_resp.status_code, 403)


class PerformanceAndCachingTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        from apps.bot.tasks import (
            send_daily_overdue_alerts_task,
            send_payment_receipt_notification_task,
        )
        cache.clear()
        self.owner = User.objects.create_user(
            username="perf_arendator",
            email="perf@carenda.uz",
            password="pass",
            role=User.RoleChoices.OWNER,
            full_name="Perf Arendator",
            telegram_id=888777666,
            cars_limit=20,
            expires_at=timezone.now() + timedelta(days=30),
            is_registered=True,
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            full_name="Driver Perf",
            phone="+998901234567",
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.owner)

    def test_dashboard_query_count_and_caching(self):
        from django.core.cache import cache
        c1 = Car.objects.create(owner=self.owner, name="Car 1", plate_number="01A111AA", status=Car.Status.AVAILABLE)
        c2 = Car.objects.create(owner=self.owner, name="Car 2", plate_number="01B222BB", status=Car.Status.RENTED)
        c3 = Car.objects.create(owner=self.owner, name="Car 3", plate_number="01C333CC", status=Car.Status.MAINTENANCE)

        create_contract_service(
            owner=self.owner,
            car=c1,
            driver=self.driver,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=10,
            start_date=timezone.localdate(),
        )

        cache.clear()
        # First call: computes dashboard and caches it
        response1 = self.client_api.get("/api/v1/dashboard/")
        self.assertEqual(response1.status_code, 200)

        # Second call: must hit cache with 0 DB queries!
        with self.assertNumQueries(0):
            response2 = self.client_api.get("/api/v1/dashboard/")
            self.assertEqual(response2.status_code, 200)
            self.assertEqual(response1.json(), response2.json())

    def test_cars_list_prefetch_no_n_plus_one(self):
        from django.core.cache import cache
        for i in range(5):
            car = Car.objects.create(
                owner=self.owner,
                name=f"Fleet Car {i}",
                plate_number=f"01X{i:03d}XX",
                status=Car.Status.AVAILABLE,
            )
            if i < 3:
                create_contract_service(
                    owner=self.owner,
                    car=car,
                    driver=self.driver,
                    car_price=Decimal("8000.00"),
                    initial_payment=Decimal("1000.00"),
                    annual_percent=Decimal("20.00"),
                    months_count=6,
                    payment_day=15,
                    start_date=timezone.localdate(),
                )

        cache.clear()
        # First call without cache: bounded queries
        response = self.client_api.get("/api/v1/cars/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 5)

        # Subsequent call: 0 queries (cache hit)
        with self.assertNumQueries(0):
            cached_response = self.client_api.get("/api/v1/cars/")
            self.assertEqual(cached_response.status_code, 200)

    def test_cache_invalidation_on_car_mutation(self):
        from django.core.cache import cache
        cache.clear()
        self.client_api.get("/api/v1/cars/")
        self.assertIsNotNone(cache.get(f"tenant_cars_list:{self.owner.id}"))

        create_car_service(
            owner=self.owner,
            name="New Invalidation Car",
            plate_number="01Z999ZZ",
        )
        self.assertIsNone(cache.get(f"tenant_cars_list:{self.owner.id}"))

    def test_celery_task_send_daily_overdue_alerts(self):
        from apps.bot.tasks import send_daily_overdue_alerts_task
        result = send_daily_overdue_alerts_task()
        self.assertIsInstance(result, int)

    def test_celery_task_send_payment_receipt(self):
        from apps.bot.tasks import send_payment_receipt_notification_task
        result = send_payment_receipt_notification_task(payment_id=999999, amount_paid="100.00")
        self.assertFalse(result)

    def test_bootstrap_endpoint_for_owner_and_caching(self):
        from django.core.cache import cache
        c1 = Car.objects.create(owner=self.owner, name="Bootstrap Tracker", plate_number="01B999BB", status=Car.Status.AVAILABLE)
        create_contract_service(
            owner=self.owner,
            car=c1,
            driver=self.driver,
            car_price=Decimal("12000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=15,
            start_date=timezone.localdate(),
        )

        cache.clear()
        # First call: populates bootstrap cache
        res1 = self.client_api.get("/api/v1/bootstrap/")
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()

        self.assertIn("me", data1)
        self.assertEqual(data1["me"]["username"], "perf_arendator")
        self.assertIsNotNone(data1["dashboard"])
        self.assertGreaterEqual(len(data1["cars"]), 1)
        self.assertIsNone(data1["user_schedule"])

        # Second call: 0 DB queries (cache hit)
        with self.assertNumQueries(0):
            res2 = self.client_api.get("/api/v1/bootstrap/")
            self.assertEqual(res2.status_code, 200)
            self.assertEqual(res1.json(), res2.json())

        # Invalidation check: creating a car must invalidate tenant_bootstrap cache
        create_car_service(
            owner=self.owner,
            name="Brand New Car",
            plate_number="01C888CC",
        )
        today_str = timezone.localdate().isoformat()
        self.assertIsNone(cache.get(f"tenant_bootstrap:{self.owner.id}:{today_str}"))

    def test_bootstrap_endpoint_for_user_driver(self):
        driver_user = User.objects.create_user(
            username="driver_sub_user",
            email="driver@carenda.uz",
            password="pass",
            role=User.RoleChoices.USER,
            parent_owner=self.owner,
            full_name="Driver User Profile",
            phone="+998971112233",
            telegram_id=777666555,
            is_registered=True,
        )
        self.driver.user = driver_user
        self.driver.save(update_fields=["user"])

        c = Car.objects.create(owner=self.owner, name="Driver Car", plate_number="01D111DD", status=Car.Status.AVAILABLE)
        create_contract_service(
            owner=self.owner,
            car=c,
            driver=self.driver,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("1000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=10,
            start_date=timezone.localdate(),
        )

        driver_client = APIClient()
        driver_client.force_authenticate(user=driver_user)

        res = driver_client.get("/api/v1/bootstrap/")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertIn("me", data)
        self.assertEqual(data["me"]["role"], "user")
        self.assertIsNone(data["dashboard"])
        self.assertEqual(data["cars"], [])
        self.assertIsNotNone(data["user_schedule"])
        self.assertGreaterEqual(len(data["user_schedule"]), 1)
        self.assertEqual(data["user_schedule"][0]["car_name"], "Driver Car")


class InlineCarContractCreationTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.owner = User.objects.create_user(
            username="inline_owner",
            email="inline_owner@carenda.uz",
            password="securepass123",
            role=User.RoleChoices.OWNER,
            full_name="Inline Arendator",
            phone="+998901239988",
            telegram_id=999111222,
            cars_limit=3,
            expires_at=timezone.now() + timedelta(days=30),
            is_registered=True,
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            full_name="Inline Driver",
            phone="+998909876543",
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.owner)

    def test_inline_car_and_contract_creation_service(self):
        contract = create_contract_service(
            owner=self.owner,
            car_name="Chevrolet Gentra",
            plate_number="01g777gg",
            driver=self.driver,
            car_price=Decimal("12000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=10,
            start_date=timezone.localdate(),
        )
        self.assertIsNotNone(contract.pk)
        self.assertEqual(contract.car.name, "Chevrolet Gentra")
        self.assertEqual(contract.car.plate_number, "01G777GG")
        self.assertEqual(contract.car.status, Car.Status.RENTED)
        self.assertEqual(contract.car.owner, self.owner)
        self.assertEqual(contract.payments.count(), 12)

    def test_inline_car_reuses_available_car(self):
        existing_car = Car.objects.create(
            owner=self.owner,
            name="Old Cobalt",
            plate_number="01C555CC",
            default_price=Decimal("9000.00"),
            status=Car.Status.AVAILABLE,
        )
        contract = create_contract_service(
            owner=self.owner,
            car_name="Updated Cobalt",
            plate_number="01c555cc",
            driver=self.driver,
            car_price=Decimal("10500.00"),
            initial_payment=Decimal("1500.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=15,
            start_date=timezone.localdate(),
        )
        existing_car.refresh_from_db()
        self.assertEqual(contract.car.id, existing_car.id)
        self.assertEqual(existing_car.name, "Updated Cobalt")
        self.assertEqual(existing_car.status, Car.Status.RENTED)
        self.assertEqual(existing_car.default_price, Decimal("10500.00"))

    def test_inline_car_duplicate_active_plate_raises_error(self):
        create_contract_service(
            owner=self.owner,
            car_name="Chevrolet Cobalt",
            plate_number="01C111CC",
            driver=self.driver,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=10,
            start_date=timezone.localdate(),
        )

        with self.assertRaises(ValidationError) as ctx:
            create_contract_service(
                owner=self.owner,
                car_name="Duplicate Cobalt",
                plate_number="01c111cc",
                driver=self.driver,
                car_price=Decimal("10000.00"),
                initial_payment=Decimal("2000.00"),
                annual_percent=Decimal("20.00"),
                months_count=12,
                payment_day=10,
                start_date=timezone.localdate(),
            )
        self.assertIn("faol shartnoma mavjud", str(ctx.exception))

    def test_inline_car_respects_cars_limit(self):
        # self.owner has cars_limit=3
        while self.owner.cars.count() < self.owner.cars_limit:
            idx = self.owner.cars.count()
            Car.objects.create(
                owner=self.owner,
                name=f"Quota Car {idx}",
                plate_number=f"01Q{idx:03d}QQ",
                status=Car.Status.AVAILABLE,
            )

        with self.assertRaises(ValidationError) as ctx:
            create_contract_service(
                owner=self.owner,
                car_name="Exceeds Quota Car",
                plate_number="01E999EE",
                driver=self.driver,
                car_price=Decimal("15000.00"),
                initial_payment=Decimal("3000.00"),
                annual_percent=Decimal("20.00"),
                months_count=12,
                payment_day=10,
                start_date=timezone.localdate(),
            )
        self.assertIn("limiti to'lgan", str(ctx.exception))

    def test_contract_api_inline_car_creation(self):
        payload = {
            "car_name": "Kia K5",
            "plate_number": "01k555kk",
            "driver_id": self.driver.id,
            "car_price": "25000.00",
            "initial_payment": "5000.00",
            "annual_percent": "20.00",
            "months_count": 24,
            "payment_day": 5,
            "start_date": str(timezone.localdate()),
        }

        res = self.client_api.post("/api/v1/contracts/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["car_name"], "Kia K5")
        self.assertEqual(data["plate_number"], "01K555KK")
        self.assertEqual(len(data["payments"]), 24)

        created_car = Car.objects.get(owner=self.owner, plate_number="01K555KK")
        self.assertEqual(created_car.status, Car.Status.RENTED)

    def test_contract_api_requires_car_or_inline_details(self):
        payload = {
            "driver_id": self.driver.id,
            "car_price": "10000.00",
            "initial_payment": "2000.00",
            "annual_percent": "20.00",
            "months_count": 12,
            "payment_day": 10,
            "start_date": str(timezone.localdate()),
        }
        res = self.client_api.post("/api/v1/contracts/", payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("non_field_errors", res.json())






