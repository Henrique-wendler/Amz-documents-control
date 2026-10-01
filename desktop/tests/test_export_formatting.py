from datetime import date
from decimal import Decimal

import pytest

from amazon_agro.exporters.formatting import (
    format_brl, format_date_pt_br, format_percent, proposal_filename_stem,
)


def test_brazilian_money_format_uses_decimal_rounding() -> None:
    assert format_brl(Decimal("1234567.895")) == "R$ 1.234.567,90"
    assert format_brl(Decimal("0")) == "R$ 0,00"


def test_percent_format() -> None:
    assert format_percent(Decimal("12.50")) == "12,5%"
    assert format_percent(Decimal("0")) == "0%"


def test_date_format_does_not_require_system_locale() -> None:
    assert format_date_pt_br("Palmas", date(2026, 9, 29)) == (
        "Palmas, 29 de setembro de 2026"
    )


@pytest.mark.parametrize(
    ("number", "name", "expected"),
    [
        ("123/45", "João da Silva", "123_45_Joao_da_Silva_proposta"),
        ("", "", "Sem_numero_Sem_proponente_proposta"),
        ("12:*?", "Ana<>Souza", "12_Ana_Souza_proposta"),
    ],
)
def test_filename_sanitization(number: str, name: str, expected: str) -> None:
    assert proposal_filename_stem(number, name) == expected
