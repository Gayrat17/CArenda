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
        self.assertIn(data["plan"], ("free", "trial"))

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
        # Phone must remain unchanged (read-only for security)
        self.assertEqual(data["phone"], "+998901110022")
        self.assertEqual(data["default_annual_percent"], "25.00")

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.full_name, "Baxrom G'. Aliyev")
        self.assertEqual(self.owner.phone, "+998901110022")
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

        # But user driver CAN update their own name (phone remains protected)
        response_ok = self.client.patch(
            "/api/v1/me/",
            {"full_name": "Dilshod Haydovchi", "phone": "+998931112233"},
            format="json",
        )
        self.assertEqual(response_ok.status_code, status.HTTP_200_OK)
        driver_user.refresh_from_db()
        self.assertEqual(driver_user.full_name, "Dilshod Haydovchi")
        self.assertEqual(driver_user.phone, "")


class SubscriptionFlowTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner_sub_test",
            role=User.RoleChoices.ARENDATOR,
            plan=User.Plan.TRIAL,
            cars_limit=2,
            full_name="Test Arendator",
            phone="+998901234567",
            telegram_id=99887711,
            expires_at=timezone.now() + timedelta(days=5),
        )
        self.superadmin = User.objects.create_user(
            username="superadmin_test",
            role=User.RoleChoices.SUPERADMIN,
            is_superuser=True,
            is_staff=True,
            full_name="Super Admin",
            telegram_id=88776655,
        )
        self.client_owner = APIClient()
        self.client_owner.force_authenticate(user=self.owner)

        self.client_super = APIClient()
        self.client_super.force_authenticate(user=self.superadmin)

    def test_payment_settings_get(self):
        res = self.client_owner.get("/api/v1/subscriptions/payment-settings/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn("standard_plan_price", data)
        self.assertIn("pro_plan_price", data)
        self.assertIn("card_number", data)

    def test_payment_settings_patch_restricted_to_superadmin(self):
        # Regular owner should be forbidden
        res = self.client_owner.patch(
            "/api/v1/subscriptions/payment-settings/",
            {"standard_plan_price": 130000},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Superadmin succeeds
        res_ok = self.client_super.patch(
            "/api/v1/subscriptions/payment-settings/",
            {
                "standard_plan_price": 150000,
                "paynet_url": "https://paynet.uz/p2p/test",
                "card_number": "8600123412341234",
                "card_holder": "ALISHER N.",
            },
            format="json",
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        data = res_ok.json()
        self.assertEqual(data["standard_plan_price"], 150000)
        self.assertEqual(data["paynet_url"], "https://paynet.uz/p2p/test")
        self.assertEqual(data["card_number"], "8600123412341234")

    def test_create_subscription_request_and_duplicate_prevention(self):
        # 1. Create first pending request
        res = self.client_owner.post(
            "/api/v1/subscriptions/request/",
            {"plan_type": "pro", "note": "To'lov qilindi"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data["plan_type"], "pro")
        self.assertEqual(data["status"], "pending")

        # 2. Second request while first is pending must fail with 400
        res_dup = self.client_owner.post(
            "/api/v1/subscriptions/request/",
            {"plan_type": "pro"},
            format="json",
        )
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("allaqachon ko'rib chiqilayotgan", res_dup.json()["detail"])

    def test_subscription_approval_service(self):
        from apps.users.models import SubscriptionRequest
        from apps.users.services import process_subscription_approval

        sub_req = SubscriptionRequest.objects.create(
            user=self.owner,
            plan_type="pro",
            amount=250000,
            status=SubscriptionRequest.Status.PENDING,
        )
        old_expiry = self.owner.expires_at

        # Process approval
        success = process_subscription_approval(sub_req, reviewer_label="@admin")
        self.assertTrue(success)

        sub_req.refresh_from_db()
        self.assertEqual(sub_req.status, SubscriptionRequest.Status.APPROVED)

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.plan, "pro")
        self.assertEqual(self.owner.cars_limit, 9999)
        self.assertGreater(self.owner.expires_at, old_expiry)
        # Should be roughly 30 days added
        diff_days = (self.owner.expires_at - old_expiry).days
        self.assertEqual(diff_days, 30)

    def test_subscription_rejection_service(self):
        from apps.users.models import SubscriptionRequest
        from apps.users.services import process_subscription_rejection

        sub_req = SubscriptionRequest.objects.create(
            user=self.owner,
            plan_type="standard",
            amount=120000,
            status=SubscriptionRequest.Status.PENDING,
        )

        success = process_subscription_rejection(sub_req, reviewer_label="@admin", reason="Chek topilmadi")
        self.assertTrue(success)

        sub_req.refresh_from_db()
        self.assertEqual(sub_req.status, SubscriptionRequest.Status.REJECTED)
        self.assertIn("Rad etdi", sub_req.admin_note)

    def test_two_tier_free_limits_and_403_contract_creation(self):
        from decimal import Decimal
        from apps.fleet.models import Car, Contract, Driver

        # Newly registered owner defaults to Free tier with 60 days duration and limit 3
        new_user = User.objects.create_user(
            username="new_free_owner",
            role=User.RoleChoices.ARENDATOR,
        )
        self.assertEqual(new_user.plan, "free")
        self.assertIsNotNone(new_user.trial_ends_at)
        self.assertEqual(new_user.cars_limit, 3)

        self.owner.plan = "free"
        self.owner.cars_limit = 3
        self.owner.save()

        driver = Driver.objects.create(
            owner=self.owner,
            full_name="Haydovchi Sinov",
            phone="+998901234567",
        )

        # Create 3 contracts (allowed)
        for i in range(1, 4):
            car = Car.objects.create(
                owner=self.owner,
                name=f"Mashina {i}",
                plate_number=f"01A00{i}AA",
                status=Car.Status.AVAILABLE,
            )
            res = self.client_owner.post(
                "/api/v1/contracts/",
                {
                    "car_id": car.id,
                    "driver_id": driver.id,
                    "car_price": "10000.00",
                    "initial_payment": "1000.00",
                    "months_count": 12,
                    "payment_day": 5,
                    "start_date": "2026-03-01",
                },
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 4th contract must be blocked with 403 Forbidden
        car4 = Car.objects.create(
            owner=self.owner,
            name="Mashina 4",
            plate_number="01A004AA",
            status=Car.Status.AVAILABLE,
        )
        res4 = self.client_owner.post(
            "/api/v1/contracts/",
            {
                "car_id": car4.id,
                "driver_id": driver.id,
                "car_price": "10000.00",
                "initial_payment": "1000.00",
                "months_count": 12,
                "payment_day": 5,
                "start_date": "2026-03-01",
            },
            format="json",
        )
        self.assertEqual(res4.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res4.json().get("code"), "subscription_limit_reached")
        self.assertIn("Free tarif limiti tugadi", res4.json().get("detail", ""))

    def test_account_freezing_blocks_contract_creation(self):
        self.owner.is_frozen = True
        self.owner.save()

        res = self.client_owner.post(
            "/api/v1/contracts/",
            {
                "car_name": "Spark",
                "plate_number": "01F777FF",
                "driver_full_name": "Test Driver",
                "driver_phone": "+998901112233",
                "car_price": "10000.00",
                "months_count": 12,
                "payment_day": 5,
                "start_date": "2026-03-01",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("muzlatilgan", res.json().get("detail", ""))

    def test_subscription_settings_and_status_endpoints(self):
        # GET /api/subscriptions/settings/
        res_settings = self.client_owner.get("/api/v1/subscriptions/settings/")
        self.assertEqual(res_settings.status_code, status.HTTP_200_OK)
        s_data = res_settings.json()
        self.assertIn("standart_price", s_data)
        self.assertIn("free_max_contracts", s_data)
        self.assertEqual(s_data["free_max_contracts"], 3)

        # GET /api/subscriptions/status/
        res_status = self.client_owner.get("/api/v1/subscriptions/status/")
        self.assertEqual(res_status.status_code, status.HTTP_200_OK)
        stat_data = res_status.json()
        self.assertEqual(stat_data["plan"], "free")
        self.assertIn("remaining_days", stat_data)
        self.assertIn("active_contracts_count", stat_data)


class AuthOnboardingRBACFlowTests(TestCase):
    def setUp(self):
        from apps.fleet.models import Car, Contract, Driver
        self.arendator = User.objects.create_user(
            username="test_arendator_rbac",
            full_name="Arendator Aka",
            phone="+998901112233",
            phone_number="+998901112233",
            role=User.RoleChoices.ARENDATOR,
            is_registered=True,
            is_onboarded=True,
        )
        self.car = Car.objects.create(
            owner=self.arendator,
            name="Chevrolet Cobalt",
            plate_number="01A999AA",
            default_price=Decimal("12000.00"),
        )
        self.driver = Driver.objects.create(
            owner=self.arendator,
            full_name="Haydovchi Botir",
            phone="+998912223344",
        )
        self.contract = Contract.objects.create(
            owner=self.arendator,
            car=self.car,
            driver=self.driver,
            car_price=Decimal("12000.00"),
            initial_payment=Decimal("2000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=15,
            start_date="2026-03-01",
        )
        self.raw_user = User.objects.create_user(
            username="tg_newbie_123",
            telegram_id=987654321,
            is_registered=False,
            is_onboarded=False,
        )
        self.client_raw = APIClient()
        self.client_raw.force_authenticate(user=self.raw_user)

        self.client_arendator = APIClient()
        self.client_arendator.force_authenticate(user=self.arendator)

    def test_verify_code_invalid_returns_exact_uzbek_message(self):
        res = self.client_raw.post(
            "/api/v1/auth/verify-code/",
            {"code": "INVALID_XYZ"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        data = res.json()
        self.assertFalse(data.get("valid"))
        self.assertEqual(
            data.get("detail"),
            "Kiritilgan maxsus kod xato! Iltimos, arendatoringizdan to'g'ri kodni so'rang.",
        )

    def test_verify_code_with_contract_and_arendator_codes(self):
        # 1. Verify contract invite code
        res_contract = self.client_raw.post(
            "/api/v1/auth/verify-code/",
            {"code": self.contract.invite_code},
            format="json",
        )
        self.assertEqual(res_contract.status_code, status.HTTP_200_OK)
        c_data = res_contract.json()
        self.assertTrue(c_data["valid"])
        self.assertEqual(c_data["type"], "contract")
        self.assertEqual(c_data["car_name"], "Chevrolet Cobalt")
        self.assertEqual(c_data["plate_number"], "01A999AA")

        # 2. Verify Arendator tenant/invite code
        res_arendator = self.client_raw.post(
            "/api/v1/auth/verify-code/",
            {"code": self.arendator.tenant_code},
            format="json",
        )
        self.assertEqual(res_arendator.status_code, status.HTTP_200_OK)
        a_data = res_arendator.json()
        self.assertTrue(a_data["valid"])
        self.assertEqual(a_data["type"], "arendator")
        self.assertEqual(a_data["arendator_name"], "Arendator Aka")

    def test_complete_onboarding_arendator(self):
        res = self.client_raw.post(
            "/api/v1/auth/complete-onboarding/",
            {
                "role": "arendator",
                "phone_number": "+998909876543",
                "full_name": "Yangi Arendator",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["role"], "arendator")
        self.assertTrue(data["is_onboarded"])
        self.assertIn("987 65 43", data["phone_number"])

        self.raw_user.refresh_from_db()
        self.assertTrue(self.raw_user.is_onboarded)
        self.assertEqual(self.raw_user.role, User.RoleChoices.ARENDATOR)
        self.assertTrue(bool(self.raw_user.tenant_code))

    def test_complete_onboarding_ijarachi_links_contract_and_driver(self):
        res = self.client_raw.post(
            "/api/v1/auth/complete-onboarding/",
            {
                "role": "ijarachi",
                "phone_number": "+998912223344",
                "invite_code": self.contract.invite_code,
                "full_name": "Haydovchi Botirjon",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["role"], "ijarachi")
        self.assertTrue(data["is_onboarded"])

        self.raw_user.refresh_from_db()
        self.assertEqual(self.raw_user.role, User.RoleChoices.IJARACHI)
        self.assertEqual(self.raw_user.linked_arendator, self.arendator)

        # Check driver linked
        self.driver.refresh_from_db()
        self.assertEqual(self.driver.user, self.raw_user)

    def test_strict_rbac_ijarachi_cannot_access_arendator_endpoints(self):
        # Onboard as Ijarachi
        self.client_raw.post(
            "/api/v1/auth/complete-onboarding/",
            {
                "role": "ijarachi",
                "phone_number": "+998912223344",
                "invite_code": self.contract.invite_code,
            },
            format="json",
        )

        # 1. Accessing Arendator Dashboard must return 403 Forbidden
        res_dash = self.client_raw.get("/api/v1/dashboard/")
        self.assertEqual(res_dash.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Accessing Contracts CRUD must return 403 Forbidden
        res_contracts = self.client_raw.get("/api/v1/contracts/")
        self.assertEqual(res_contracts.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Accessing Client Portal /api/client/my-contracts/ must return 200 OK
        res_client = self.client_raw.get("/api/v1/client/my-contracts/")
        self.assertEqual(res_client.status_code, status.HTTP_200_OK)
        client_data = res_client.json()
        self.assertEqual(len(client_data), 1)
        self.assertEqual(client_data[0]["car_name"], "Chevrolet Cobalt")

        # 4. Arendator accessing /api/client/my-contracts/ must return 403 Forbidden
        res_arendator_client = self.client_arendator.get("/api/v1/client/my-contracts/")
        self.assertEqual(res_arendator_client.status_code, status.HTTP_403_FORBIDDEN)

    def test_client_dashboard_and_excel_export(self):
        # Onboard as Ijarachi
        self.client_raw.post(
            "/api/v1/auth/complete-onboarding/",
            {
                "role": "ijarachi",
                "phone_number": "+998912223344",
                "invite_code": self.contract.invite_code,
            },
            format="json",
        )

        # GET /api/v1/client/dashboard/
        res_dash = self.client_raw.get("/api/v1/client/dashboard/")
        self.assertEqual(res_dash.status_code, status.HTTP_200_OK)
        data = res_dash.json()
        self.assertIn("client", data)
        self.assertIn("contracts", data)
        self.assertIn("summary", data)
        self.assertEqual(len(data["contracts"]), 1)
        self.assertEqual(data["contracts"][0]["car_name"], "Chevrolet Cobalt")

        # Arendator calling /api/v1/client/dashboard/ must return 403 Forbidden
        res_aren_dash = self.client_arendator.get("/api/v1/client/dashboard/")
        self.assertEqual(res_aren_dash.status_code, status.HTTP_403_FORBIDDEN)

        # Client exporting their contract excel
        res_excel = self.client_raw.get(f"/api/v1/client/contracts/{self.contract.id}/export/excel/")
        self.assertEqual(res_excel.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res_excel.get("Content-Type"),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

