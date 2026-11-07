from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.fleet.models import Car
from apps.users.models import User, UserSetting


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

        # Inactive user
        self.user.is_active = False
        self.assertFalse(self.user.is_subscription_active)
        self.user.is_active = True

        # Expired subscription
        self.user.expires_at = timezone.now() - timedelta(days=1)
        self.assertFalse(self.user.is_subscription_active)

        # No expiration
        self.user.expires_at = None
        self.assertFalse(self.user.is_subscription_active)

    def test_can_add_car_property(self):
        self.assertTrue(self.user.can_add_car)

        # Add 1st car
        Car.objects.create(
            owner=self.user,
            name="Chevrolet Cobalt",
            plate_number="01A111AA",
        )
        self.assertEqual(self.user.cars.count(), 1)
        self.assertTrue(self.user.can_add_car)

        # Add 2nd car (reaches cars_limit=2)
        Car.objects.create(
            owner=self.user,
            name="Chevrolet Gentra",
            plate_number="01B222BB",
        )
        self.assertEqual(self.user.cars.count(), 2)
        self.assertFalse(self.user.can_add_car)

        # Inactive subscription should return False even if under limit
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
