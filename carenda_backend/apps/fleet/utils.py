"""
Fleet utilities module.
Re-exports contract code utilities, phone normalization, and validation tools.
"""

from __future__ import annotations

from apps.fleet.contract_code import (
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
