"""
Contract utilities shim pointing to apps.fleet.utils.
"""

from apps.fleet.utils import (
    ALPHABET,
    CODE_LENGTH,
    CONTRACT_CODE_PATTERN,
    CONTRACT_CODE_REGEX,
    generate_contract_code,
    is_valid_contract_code,
)

__all__ = [
    "ALPHABET",
    "CODE_LENGTH",
    "CONTRACT_CODE_PATTERN",
    "CONTRACT_CODE_REGEX",
    "generate_contract_code",
    "is_valid_contract_code",
]
