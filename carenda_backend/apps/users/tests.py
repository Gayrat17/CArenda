import hashlib
import hmac
import json
import urllib.parse
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.fleet.models import Car
from apps.users.models import User, UserSetting


def make_tg_init_data(
    user_dict: dict,
    bot_token: str = getattr(settings, "TELEGRAM_BOT_TOKEN", "dev_bot_token_123456"),
    auth_date: int = 1700000000,
) -> str:
    user_json = json.dumps(user_dict, separators=(",", ":"))
    params = [
        ("auth_date", str(auth_date)),
        ("query_id", "AAG_test_query_id"),
        ("user", user_json),
    ]
    params.sort(key=lambda x: x[0])
    data_check_string = "\n".join(f"{k}={v}" for k, v in params)

    secret_key = hmac.new(
        b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256
    ).digest()
    hash_val = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    return f"auth_date={auth_date}&hash={hash_val}&query_id=AAG_test_query_id&user={urllib.parse.quote(user_json)}"


class UserModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="arendator1",
            email="arendator1@carenda.uz",
            password="securepassword123",
            full_name="Alisher Navoiy",
            phone="+998901234567",
            telegram_id=123456789,
            plan=User.Plan.TRIAL,
            cars_limit=2,
            expires_at=timezone.now() + timedelta(days=14),
        )

    def test_user_creation_and_str(self):
        self.assertEqual(str(self.user), "Alisher Navoiy")
        self.assertEqual(self.user.telegram_id, 123456789)
        self.assertEqual(self.user.plan, "trial")
        self.assertEqual(self.user.cars_limit, 2)

    def test_subscription_active_property(self):
        self.assertTrue(self.user.is_subscription_active)

        self.user.is_active = False
        self.assertFalse(self.user.is_subscription_active)
        self.user.is_active = True

        self.user.expires_at = timezone.now() - timedelta(days=1)
        self.assertFalse(self.user.is_subscription_active)

        self.user.expires_at = None
        self.assertFalse(self.user.is_subscription_active)

    def test_can_add_car_property(self):
        self.assertTrue(self.user.can_add_car)

        Car.objects.create(
            owner=self.user,
            name="Chevrolet Cobalt",
            plate_number="01A111AA",
        )
        self.assertEqual(self.user.cars.count(), 1)
        self.assertTrue(self.user.can_add_car)

        Car.objects.create(
            owner=self.user,
            name="Chevrolet Gentra",
            plate_number="01B222BB",
        )
        self.assertEqual(self.user.cars.count(), 2)
        self.assertFalse(self.user.can_add_car)

        self.user.cars_limit = 5
        self.user.expires_at = timezone.now() - timedelta(days=1)
        self.assertFalse(self.user.can_add_car)


class UserSettingModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="arendator2",
            email="arendator2@carenda.uz",
            password="securepassword123",
        )

    def test_user_setting_creation(self):
        setting = UserSetting.objects.create(
            owner=self.user,
            default_annual_percent=Decimal("24.00"),
        )
        self.assertEqual(setting.owner, self.user)
        self.assertEqual(setting.default_annual_percent, Decimal("24.00"))
        self.assertIn("Settings for", str(setting))


class TelegramAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_real_telegram_hmac_auth_success(self):
        init_data = make_tg_init_data(
            {"id": 777888999, "first_name": "Sardor", "username": "sardor_tg"}
        )
        response = self.client.get(
            "/api/v1/me/", HTTP_AUTHORIZATION=f"tma {init_data}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["telegram_id"], 777888999)
        self.assertEqual(data["full_name"], "Sardor")

        # Verify User and UserSetting created in DB
        user = User.objects.get(telegram_id=777888999)
        self.assertTrue(UserSetting.objects.filter(owner=user).exists())

    def test_real_telegram_hmac_auth_tampered_signature_fails(self):
        init_data = make_tg_init_data(
            {"id": 555666777, "first_name": "Fake"}
        )
        # Tamper with the hash
        tampered = init_data.replace("hash=", "hash=deadbeef")
        response = self.client.get(
            "/api/v1/me/", HTTP_AUTHORIZATION=f"tma {tampered}"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(DEBUG=True)
    def test_dev_fallback_auth(self):
        response = self.client.get(
            "/api/v1/me/", HTTP_AUTHORIZATION="tma dev"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["telegram_id"], 999999999)
        self.assertEqual(data["username"], "demo_arendator")
        self.assertEqual(data["cars_limit"], 10)


class UserMeAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="me_user",
            full_name="Baxrom Aliyev",
            phone="+998901110022",
            telegram_id=888111222,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=30),
        )
        UserSetting.objects.create(
            owner=self.user,
            default_annual_percent=Decimal("20.00"),
        )
        self.client.force_authenticate(user=self.user)

    def test_get_me(self):
        response = self.client.get("/api/v1/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["full_name"], "Baxrom Aliyev")
        self.assertEqual(data["default_annual_percent"], "20.00")
        self.assertEqual(data["cars_count"], 0)

    def test_patch_me_updates_profile_and_annual_percent(self):
        response = self.client.patch(
            "/api/v1/me/",
            {
                "full_name": "Baxrom G'. Aliyev",
                "phone": "+998909998877",
                "default_annual_percent": "25.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["full_name"], "Baxrom G'. Aliyev")
        self.assertEqual(data["phone"], "+998909998877")
        self.assertEqual(data["default_annual_percent"], "25.00")

        self.user.refresh_from_db()
        self.assertEqual(self.user.full_name, "Baxrom G'. Aliyev")
        self.assertEqual(self.user.settings.default_annual_percent, Decimal("25.00"))
