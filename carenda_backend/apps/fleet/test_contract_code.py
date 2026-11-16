"""
Unit tests for RentalContract contract_code generator.

Verifies:
1. Format regex compliance (CRD-YYYY-XXXXX) & dynamic year
2. Exclusion of ambiguous characters (0, O, 1, I, l)
3. Cryptographic randomness / uniqueness across samples
4. Model auto-generation on create
5. Immutability on subsequent updates
6. Collision retry mechanism via savepoints and mocking
7. Exhaustion of max retries raising RuntimeError
8. Serializer inclusion
"""

from datetime import date, timedelta
from decimal import Decimal
import re
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.fleet.contract_code import (
    ALPHABET,
    CODE_LENGTH,
    CONTRACT_CODE_REGEX,
    generate_contract_code,
    is_valid_contract_code,
)
from apps.fleet.models import Car, Contract, Driver, RentalContract
from apps.fleet.serializers import ContractDetailSerializer, ContractSummarySerializer
from apps.users.models import User


class ContractCodeGeneratorUnitTests(TestCase):
    """Test pure helper function generate_contract_code() and its properties."""

    def test_regex_format_compliance(self):
        current_year = timezone.now().year
        for _ in range(50):
            code = generate_contract_code()
            self.assertTrue(
                CONTRACT_CODE_REGEX.match(code),
                f"Generated code {code} does not match contract code pattern."
            )
            self.assertTrue(is_valid_contract_code(code))
            self.assertTrue(code.startswith(f"CRD-{current_year}-"))
            parts = code.split("-")
            self.assertEqual(len(parts), 3)
            self.assertEqual(parts[0], "CRD")
            self.assertEqual(parts[1], str(current_year))
            self.assertEqual(len(parts[2]), CODE_LENGTH)

    def test_unambiguous_alphabet_compliance(self):
        ambiguous_chars = set("0O1Il")
        allowed_chars = set(ALPHABET)
        # Verify alphabet itself excludes ambiguous characters
        self.assertTrue(ambiguous_chars.isdisjoint(allowed_chars))

        # Verify generated codes never contain ambiguous characters
        for _ in range(200):
            code = generate_contract_code()
            suffix = code.split("-")[2]
            for ch in suffix:
                self.assertIn(ch, allowed_chars)
                self.assertNotIn(ch, ambiguous_chars)

    def test_cryptographic_uniqueness_sample(self):
        sample_size = 1000
        codes = {generate_contract_code() for _ in range(sample_size)}
        self.assertEqual(
            len(codes),
            sample_size,
            "Detected collision in 1,000 consecutively generated codes."
        )

    def test_validation_helper_behavior(self):
        current_year = timezone.now().year
        self.assertTrue(is_valid_contract_code(f"CRD-{current_year}-X8K9L"))
        self.assertTrue(is_valid_contract_code("CRD-2025-23456"))

        # Invalid cases
        self.assertFalse(is_valid_contract_code("CRD-2026-08K9L"))   # Contains '0'
        self.assertFalse(is_valid_contract_code("CRD-2026-O8K9L"))   # Contains 'O'
        self.assertFalse(is_valid_contract_code("CRD-2026-18K9L"))   # Contains '1'
        self.assertFalse(is_valid_contract_code("CRD-2026-I8K9L"))   # Contains 'I'
        self.assertFalse(is_valid_contract_code("CRD-2026-l8K9L"))   # Contains 'l'
        self.assertFalse(is_valid_contract_code("CRD-2026-X8K9"))    # Too short
        self.assertFalse(is_valid_contract_code("CRD-2026-X8K9LL"))  # Too long
        self.assertFalse(is_valid_contract_code("INV-2026-X8K9L"))   # Wrong prefix
        self.assertFalse(is_valid_contract_code(None))              # Non-string


class RentalContractCodeModelTests(TestCase):
    """Test RentalContract model lifecycle, immutability, and concurrency safety."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="contract_owner",
            email="contract_owner@carenda.uz",
            password="testpass123",
            full_name="Temur Aliyev",
            phone="+998901234567",
            telegram_id=777888999,
            cars_limit=10,
            expires_at=timezone.now() + timedelta(days=60),
        )
        self.car = Car.objects.create(
            owner=self.owner,
            name="Chevrolet Malibu 2",
            plate_number="01M777MM",
            default_price=Decimal("25000.00"),
            status=Car.Status.AVAILABLE,
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            full_name="Sanjar Rahmonov",
            phone="+998909876543",
        )

    def _create_contract(self, **kwargs) -> RentalContract:
        defaults = {
            "owner": self.owner,
            "car": self.car,
            "driver": self.driver,
            "car_price": Decimal("20000.00"),
            "initial_payment": Decimal("5000.00"),
            "annual_percent": Decimal("18.00"),
            "months_count": 24,
            "payment_day": 15,
            "start_date": date(2026, 3, 1),
        }
        defaults.update(kwargs)
        return RentalContract.objects.create(**defaults)

    def test_model_alias_identity(self):
        """Verify RentalContract is a canonical alias for Contract."""
        self.assertIs(RentalContract, Contract)

    def test_contract_code_auto_generated_on_create(self):
        contract = self._create_contract()
        self.assertIsNotNone(contract.contract_code)
        self.assertTrue(
            CONTRACT_CODE_REGEX.match(contract.contract_code),
            f"Expected contract_code matching pattern, got: {contract.contract_code}"
        )
        # Check DB persistence
        contract.refresh_from_db()
        self.assertTrue(CONTRACT_CODE_REGEX.match(contract.contract_code))

    def test_multiple_contracts_receive_unique_codes(self):
        car2 = Car.objects.create(
            owner=self.owner,
            name="Chevrolet Cobalt",
            plate_number="01C888CC",
        )
        c1 = self._create_contract()
        c2 = self._create_contract(car=car2)
        self.assertNotEqual(c1.contract_code, c2.contract_code)

    def test_contract_code_immutability_on_update(self):
        contract = self._create_contract()
        initial_code = contract.contract_code

        # 1. Updating unrelated fields preserves contract_code
        contract.car_price = Decimal("22000.00")
        contract.months_count = 36
        contract.save()

        contract.refresh_from_db()
        self.assertEqual(contract.contract_code, initial_code)

        # 2. Explicit attempt to mutate contract_code raises ValidationError
        contract.contract_code = "CRD-2026-MUTATED"
        with self.assertRaises(ValidationError) as ctx:
            contract.save()
        self.assertIn("contract_code is immutable", str(ctx.exception))

        # Confirm value in DB was NOT mutated
        contract.refresh_from_db()
        self.assertEqual(contract.contract_code, initial_code)

    def test_collision_retry_succeeds_via_mocking(self):
        """
        Simulate collision where generate_contract_code returns an existing code
        on the first 2 attempts, then a unique code on the 3rd attempt.
        """
        existing = self._create_contract()
        colliding_code = existing.contract_code
        unique_code = "CRD-2026-99999"

        car2 = Car.objects.create(
            owner=self.owner,
            name="Chevrolet Tracker 2",
            plate_number="01T999TT",
        )

        call_count = 0

        def mocked_generator():
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                # Collide with existing contract's code
                return colliding_code
            return unique_code

        with patch("apps.fleet.contract_code.generate_contract_code", side_effect=mocked_generator):
            new_contract = self._create_contract(car=car2)

        self.assertEqual(call_count, 3)
        self.assertEqual(new_contract.contract_code, unique_code)
        new_contract.refresh_from_db()
        self.assertEqual(new_contract.contract_code, unique_code)

    def test_collision_retry_exhaustion_raises_runtime_error(self):
        """
        Simulate persistent collision where all 10 attempts return an existing code.
        Verify RuntimeError is raised with clear explanation.
        """
        existing = self._create_contract()
        colliding_code = existing.contract_code

        car2 = Car.objects.create(
            owner=self.owner,
            name="Chevrolet Gentra",
            plate_number="01G111GG",
        )

        with patch("apps.fleet.contract_code.generate_contract_code", return_value=colliding_code):
            with self.assertRaises(RuntimeError) as ctx:
                self._create_contract(car=car2)

        self.assertIn("Could not generate a unique contract_code after 10 attempts", str(ctx.exception))

    def test_serializer_includes_contract_code(self):
        contract = self._create_contract()
        summary_data = ContractSummarySerializer(contract).data
        self.assertIn("contract_code", summary_data)
        self.assertEqual(summary_data["contract_code"], contract.contract_code)

        detail_data = ContractDetailSerializer(contract).data
        self.assertIn("contract_code", detail_data)
        self.assertEqual(detail_data["contract_code"], contract.contract_code)
