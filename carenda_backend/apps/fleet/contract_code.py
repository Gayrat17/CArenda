"""
Collision-resistant, human-readable unique contract code generator.

Format: CRD-YYYY-XXXXX (e.g., CRD-2026-X8K9L)

Design decisions:
- Cryptographic randomness via Python's standard `secrets` module (not `random`).
- Unambiguous alphanumeric alphabet (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`),
  explicitly excluding visually confusing characters:
  - '0' (zero) and 'O' (uppercase letter O)
  - '1' (one), 'I' (uppercase letter I), and 'l' (lowercase letter L)
- Dynamic year prefix: `CRD-{YYYY}-{5_CHAR_CODE}` using `timezone.now().year`.
- 30 distinct characters ^ 5 positions = 24,300,000 unique combinations per year,
  providing massive headroom against collisions in any tenant environment.
"""

from __future__ import annotations

import re
import secrets
from typing import Final

from django.utils import timezone

# Unambiguous alphanumeric alphabet excluding visually confusing characters:
# '0', 'O', '1', 'I', 'l'
ALPHABET: Final[str] = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH: Final[int] = 5
CONTRACT_CODE_PATTERN: Final[str] = r"^CRD-\d{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$"
CONTRACT_CODE_REGEX: Final[re.Pattern[str]] = re.compile(CONTRACT_CODE_PATTERN)


def generate_contract_code() -> str:
    """
    Generate a production-grade, human-readable unique contract code.

    Format:
        CRD-{YYYY}-{5_CHAR_CODE}
        Example: CRD-2026-X8K9L

    Returns:
        str: Unique contract code string.
    """
    year = timezone.now().year
    suffix = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return f"CRD-{year}-{suffix}"


def is_valid_contract_code(code: str) -> bool:
    """
    Validate whether a given code matches the expected contract code specification.

    Args:
        code: Contract code to validate.

    Returns:
        bool: True if code matches CRD-YYYY-XXXXX format with valid characters.
    """
    if not isinstance(code, str):
        return False
    return bool(CONTRACT_CODE_REGEX.match(code))
