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
            role=User.RoleChoices.ARENDATOR,
            plan=User.Plan.TRIAL,
            cars_limit=2,
            expires_at=timezone.now() + timedelta(days=14),
        )

    def test_user_creation_and_str(self):
        self.assertIn("Alisher Navoiy", str(self.user))
        self.assertEqual(self.user.telegram_id, 123456789)
        self.assertEqual(self.user.role, User.RoleChoices.ARENDATOR)
        self.assertEqual(self.user.plan, "trial")
        self.assertEqual(self.user.cars_limit, 2)
        self.assertTrue(self.user.is_owner)
        self.assertTrue(self.user.is_arendator)
        self.assertFalse(self.user.is_user)
        self.assertFalse(self.user.is_superadmin)

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

    def test_owner_tenant_code_auto_generation(self):
        self.assertIsNotNone(self.user.tenant_code)
        self.assertTrue(self.user.tenant_code.startswith("AR-"))
        self.assertEqual(len(self.user.tenant_code), 7)

    def test_user_driver_role_properties(self):
        user_driver = User.objects.create_user(
            username="driver_user",
            full_name="Haydovchi Bobur",
            role=User.RoleChoices.USER,
            parent_owner=self.user,
            phone="+998901112233",
            is_registered=True,
        )
        self.assertTrue(user_driver.is_user)
        self.assertFalse(user_driver.is_owner)
        self.assertEqual(user_driver.tenant_owner, self.user)
        self.assertTrue(user_driver.is_registered)


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

    def test_real_telegram_hmac_auth_auto_registration(self):
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
        self.assertEqual(data["role"], "arendator")
        self.assertEqual(data["plan"], "trial")

        # Verify User and UserSetting created in DB
        user = User.objects.get(telegram_id=777888999)
        self.assertEqual(user.role, User.RoleChoices.ARENDATOR)
        self.assertTrue(UserSetting.objects.filter(owner=user).exists())

    def test_real_telegram_hmac_auth_preserves_existing_user_role(self):
        owner = User.objects.create_user(
            username="big_arendator",
            role=User.RoleChoices.ARENDATOR,
        )
        User.objects.create_user(
            username="user_nodir",
            telegram_id=666777888,
            full_name="Nodir Haydovchi",
            role=User.RoleChoices.USER,
            parent_owner=owner,
        )

        init_data = make_tg_init_data(
            {"id": 666777888, "first_name": "Nodir", "username": "user_nodir"}
        )
        response = self.client.get(
            "/api/v1/me/", HTTP_AUTHORIZATION=f"tma {init_data}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["role"], "user")
        self.assertEqual(data["parent_owner"], owner.id)

    def test_real_telegram_hmac_auth_tampered_signature_fails(self):
        init_data = make_tg_init_data(
            {"id": 555666777, "first_name": "Fake"}
        )
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
        self.assertEqual(data["role"], "arendator")
        self.assertEqual(data["cars_limit"], 10)


class UserMeAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="me_user",
            full_name="Baxrom Aliyev",
            phone="+998901110022",
            telegram_id=888111222,
            role=User.RoleChoices.ARENDATOR,
            cars_limit=5,
            expires_at=timezone.now() + timedelta(days=30),
        )
        UserSetting.objects.create(
            owner=self.owner,
            default_annual_percent=Decimal("20.00"),
        )

    def test_get_me(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get("/api/v1/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["full_name"], "Baxrom Aliyev")
        self.assertEqual(data["username"], "me_user")
        self.assertEqual(data["telegram_id"], 888111222)
        self.assertEqual(data["role"], "arendator")
        self.assertEqual(data["default_annual_percent"], "20.00")
        self.assertEqual(data["cars_count"], 0)

    def test_patch_me_owner_can_update_annual_percent(self):
        self.client.force_authenticate(user=self.owner)
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

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.full_name, "Baxrom G'. Aliyev")
        self.assertEqual(self.owner.settings.default_annual_percent, Decimal("25.00"))

    def test_patch_me_user_driver_forbidden_from_updating_annual_percent(self):
        driver_user = User.objects.create_user(
            username="driver_dilshod",
            role=User.RoleChoices.USER,
            parent_owner=self.owner,
        )
        self.client.force_authenticate(user=driver_user)

        # Attempt to modify default_annual_percent as user driver
        response = self.client.patch(
            "/api/v1/me/",
            {"default_annual_percent": "35.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("error", response.json())

        # But user driver CAN update their own name and phone
        response_ok = self.client.patch(
            "/api/v1/me/",
            {"full_name": "Dilshod Haydovchi", "phone": "+998931112233"},
            format="json",
        )
        self.assertEqual(response_ok.status_code, status.HTTP_200_OK)
        driver_user.refresh_from_db()
        self.assertEqual(driver_user.full_name, "Dilshod Haydovchi")
        self.assertEqual(driver_user.phone, "+998931112233")
