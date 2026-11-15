from datetime import date, timedelta
from decimal import Decimal
import hmac
import hashlib
import json
import urllib.parse

from django.conf import settings
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.fleet.models import Car, Contract, Driver, Payment
from apps.bot.services import (
    collect_ijarachi_payment_notifications,
    format_ijarachi_payment_notification,
)


def make_tg_init_data(user_dict: dict, bot_token: str | None = None, auth_date: int | None = None) -> str:
    if bot_token is None:
        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "dev_bot_token_123456")
    user_json = json.dumps(user_dict, separators=(",", ":"))
    if auth_date is None:
        auth_date = int(timezone.now().timestamp())
    params = [
        ("auth_date", str(auth_date)),
        ("query_id", "AAG_test_query_id"),
        ("user", user_json),
    ]
    params.sort(key=lambda x: x[0])
    data_check_string = "\n".join(f"{k}={v}" for k, v in params)
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    hash_value = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"auth_date={auth_date}&hash={hash_value}&query_id=AAG_test_query_id&user={urllib.parse.quote(user_json)}"


@override_settings(SUPERADMIN_TELEGRAM_IDS=[999000111])
class SecurityRBACAndPermissionsTests(TestCase):
    def setUp(self):
        self.superadmin = User.objects.create_user(
            username="super_test",
            telegram_id=999000111,
            role=User.RoleChoices.ARENDATOR,
            is_superuser=True,
            is_staff=True,
            is_onboarded=True,
            phone="+998901110001",
        )
        self.arendator = User.objects.create_user(
            username="arendator_test",
            telegram_id=888000222,
            role=User.RoleChoices.ARENDATOR,
            is_onboarded=True,
            phone="+998902220002",
        )
        self.ijarachi = User.objects.create_user(
            username="ijarachi_test",
            telegram_id=777000333,
            role=User.RoleChoices.IJARACHI,
            is_onboarded=True,
            phone="+998903330003",
        )

        self.client_super = APIClient()
        self.client_super.force_authenticate(user=self.superadmin)

        self.client_aren = APIClient()
        self.client_aren.force_authenticate(user=self.arendator)

        self.client_ijarachi = APIClient()
        self.client_ijarachi.force_authenticate(user=self.ijarachi)

    def test_ijarachi_calling_arendator_endpoints_returns_403(self):
        # Ijarachi cannot access Arendator dashboard
        res = self.client_ijarachi.get("/api/v1/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Ijarachi cannot access or create Contracts
        res = self.client_ijarachi.get("/api/v1/contracts/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client_ijarachi.post("/api/v1/contracts/", {})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Ijarachi cannot access or create Cars
        res = self.client_ijarachi.get("/api/v1/cars/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client_ijarachi.post("/api/v1/cars/", {})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_ijarachi_calling_superadmin_endpoints_returns_403(self):
        res = self.client_ijarachi.get("/api/v1/superadmin/arendators/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client_ijarachi.post("/api/v1/superadmin/trigger-notifications/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_arendator_calling_superadmin_endpoints_returns_403(self):
        res = self.client_aren.get("/api/v1/superadmin/arendators/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client_aren.post("/api/v1/superadmin/trigger-notifications/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client_aren.get("/api/v1/superadmin/settings/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client_aren.post(f"/api/v1/superadmin/arendators/{self.arendator.id}/toggle-monitoring/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_superadmin_can_trigger_notifications(self):
        res = self.client_super.post("/api/v1/superadmin/trigger-notifications/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("arendator_alerts_sent", res.data)
        self.assertIn("ijarachi_alerts_sent", res.data)

    def test_superadmin_can_toggle_monitoring(self):
        self.assertTrue(self.arendator.can_monitor_renters)
        res = self.client_super.post(f"/api/v1/superadmin/arendators/{self.arendator.id}/toggle-monitoring/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.arendator.refresh_from_db()
        self.assertFalse(self.arendator.can_monitor_renters)


class SecurityIDORProtectionTests(TestCase):
    def setUp(self):
        self.aren_a = User.objects.create_user(
            username="tenant_a",
            telegram_id=111111,
            role=User.RoleChoices.ARENDATOR,
            is_onboarded=True,
            phone="+998901111111",
        )
        self.aren_b = User.objects.create_user(
            username="tenant_b",
            telegram_id=222222,
            role=User.RoleChoices.ARENDATOR,
            is_onboarded=True,
            phone="+998902222222",
        )

        self.car_b = Car.objects.create(
            owner=self.aren_b,
            name="Cobalt B",
            plate_number="01 B 002 BB",
            default_price=Decimal("8000.00"),
        )
        self.driver_b = Driver.objects.create(
            owner=self.aren_b,
            full_name="Driver B",
            phone="998909998877",
        )
        self.contract_b = Contract.objects.create(
            owner=self.aren_b,
            car=self.car_b,
            driver=self.driver_b,
            car_price=Decimal("8000.00"),
            months_count=12,
            annual_percent=Decimal("20.00"),
            payment_day=10,
            start_date=date(2026, 1, 1),
        )
        self.payment_b = Payment.objects.create(
            contract=self.contract_b,
            month_number=1,
            due_date=date(2026, 2, 10),
            expected_amount=Decimal("500.00"),
        )

        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.aren_a)

    def test_cross_tenant_idor_contract_read_modify_returns_404(self):
        # Arendator A trying to read Contract B
        res = self.client_a.get(f"/api/v1/contracts/{self.contract_b.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Arendator A trying to close Contract B
        res = self.client_a.post(f"/api/v1/contracts/{self.contract_b.id}/close/", {"close_note": "Hacked"})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_tenant_idor_payment_pay_and_postpone_returns_404(self):
        # Arendator A trying to record payment on Payment B
        res = self.client_a.post(f"/api/v1/payments/{self.payment_b.id}/pay/", {"amount": "500.00"})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Arendator A trying to postpone Payment B
        res = self.client_a.post(f"/api/v1/payments/{self.payment_b.id}/postpone/", {"comment": "Postponed"})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_tenant_idor_car_and_driver_returns_404(self):
        # Arendator A trying to delete Car B
        res = self.client_a.delete(f"/api/v1/cars/{self.car_b.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Arendator A trying to modify Driver B
        res = self.client_a.patch(f"/api/v1/drivers/{self.driver_b.id}/", {"full_name": "Hacked Driver"})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class SecurityMassAssignmentAndTamperingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="regular_user",
            telegram_id=333333333,
            role=User.RoleChoices.ARENDATOR,
            is_superuser=False,
            is_staff=False,
            is_frozen=False,
            is_onboarded=True,
            phone="+998903333333",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_mass_assignment_privilege_escalation_blocked(self):
        # Attempt to escalate role and permissions via PATCH /api/v1/me/
        malicious_payload = {
            "role": "superadmin",
            "is_superuser": True,
            "is_staff": True,
            "is_frozen": True,
            "telegram_id": 999999999,
        }
        res = self.client.patch("/api/v1/me/", malicious_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.RoleChoices.ARENDATOR)
        self.assertFalse(self.user.is_superuser)
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_frozen)
        self.assertEqual(self.user.telegram_id, 333333333)


class SecurityTelegramInitDataReplayTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_expired_auth_date_rejected_replay_attack_401(self):
        # auth_date 2 hours in the past (> 3600s max age)
        old_auth_date = int(timezone.now().timestamp()) - 7200
        expired_init_data = make_tg_init_data(
            {"id": 444444444, "first_name": "Replay", "username": "replay_user"},
            auth_date=old_auth_date,
        )

        res = self.client.post("/api/v1/auth/telegram/", {"initData": expired_init_data}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("expired", res.json().get("detail", "").lower())

    def test_tampered_signature_rejected_401(self):
        valid_init_data = make_tg_init_data(
            {"id": 444444444, "first_name": "Legit", "username": "legit_user"}
        )
        # Tamper query string
        tampered = valid_init_data + "&extra_tamper=1"
        res = self.client.post("/api/v1/auth/telegram/", {"initData": tampered}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class SecurityNotificationSchedulerRulesTests(TestCase):
    def setUp(self):
        self.today = date(2026, 11, 13)
        self.owner = User.objects.create_user(
            username="owner_notif",
            telegram_id=123123123,
            role=User.RoleChoices.ARENDATOR,
            is_onboarded=True,
            phone="+998901112233",
        )
        self.client_user = User.objects.create_user(
            username="client_notif",
            telegram_id=456456456,
            role=User.RoleChoices.IJARACHI,
            is_onboarded=True,
            phone="+998909990011",
            phone_number="+998909990011",
        )
        self.car = Car.objects.create(
            owner=self.owner,
            name="Spark",
            plate_number="01 S 777 SS",
            default_price=Decimal("6000.00"),
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            user=self.client_user,
            full_name="Alisher Ijarachi",
            phone="998909990011",
        )
        self.contract = Contract.objects.create(
            owner=self.owner,
            car=self.car,
            driver=self.driver,
            car_price=Decimal("6000.00"),
            months_count=12,
            annual_percent=Decimal("20.00"),
            payment_day=13,
            start_date=date(2026, 1, 1),
            is_active=True,
        )

    def test_exact_notification_rules_and_deduplication(self):
        # 1. 7-Days Before (due_date = today + 7) -> Eligible
        p_7days = Payment.objects.create(
            contract=self.contract,
            month_number=1,
            due_date=self.today + timedelta(days=7),
            expected_amount=Decimal("300.00"),
            paid_amount=Decimal("0.00"),
            status=Payment.Status.PENDING,
        )

        # 2. Due Today (due_date = today) -> Eligible
        p_today = Payment.objects.create(
            contract=self.contract,
            month_number=2,
            due_date=self.today,
            expected_amount=Decimal("300.00"),
            paid_amount=Decimal("0.00"),
            status=Payment.Status.PENDING,
        )

        # 3. Overdue (due_date = today - 3 days) -> Eligible
        p_overdue = Payment.objects.create(
            contract=self.contract,
            month_number=3,
            due_date=self.today - timedelta(days=3),
            expected_amount=Decimal("300.00"),
            paid_amount=Decimal("0.00"),
            status=Payment.Status.OVERDUE,
        )

        # 4. Paid installment (due_date = today, paid_amount >= expected_amount) -> MUST NEVER NOTIFY
        p_paid = Payment.objects.create(
            contract=self.contract,
            month_number=4,
            due_date=self.today,
            expected_amount=Decimal("300.00"),
            paid_amount=Decimal("300.00"),
            status=Payment.Status.PAID,
        )

        # 5. Already notified today -> MUST NOT NOTIFY
        p_dedup = Payment.objects.create(
            contract=self.contract,
            month_number=5,
            due_date=self.today,
            expected_amount=Decimal("300.00"),
            paid_amount=Decimal("0.00"),
            status=Payment.Status.PENDING,
            last_notified_date=self.today,
        )

        notifs = collect_ijarachi_payment_notifications(today=self.today)
        notif_payment_ids = [n["payment_id"] for n in notifs]

        self.assertIn(p_7days.id, notif_payment_ids)
        self.assertIn(p_today.id, notif_payment_ids)
        self.assertIn(p_overdue.id, notif_payment_ids)
        self.assertNotIn(p_paid.id, notif_payment_ids, "Paid installment must NEVER be notified")
        self.assertNotIn(p_dedup.id, notif_payment_ids, "Already notified today installment must be deduplicated")

        # Verify formatting
        fmt_7 = format_ijarachi_payment_notification(p_7days, self.today)
        self.assertEqual(fmt_7[0], "7days")
        self.assertIn("7 kun qoldi", fmt_7[1])

        fmt_today = format_ijarachi_payment_notification(p_today, self.today)
        self.assertEqual(fmt_today[0], "today")
        self.assertIn("bugun", fmt_today[1].lower())

        fmt_overdue = format_ijarachi_payment_notification(p_overdue, self.today)
        self.assertEqual(fmt_overdue[0], "overdue")
        self.assertIn("3 kunga kechikmoqda", fmt_overdue[1])
