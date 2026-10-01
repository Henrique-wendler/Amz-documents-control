from decimal import Decimal

import pytest

from amazon_agro.integrations.area_parser import parse_area_ha


@pytest.mark.parametrize("value", [
    71.1514, "71,1514", "71,1514ha", "71,1514 ha", "71,1514 há",
    "71.1514", " 71,1514 ha ", "71.1514 HA", "71,1514 HÁ", Decimal("71.1514"),
])
def test_equivalent_hectares_are_exact_decimals(value):
    result = parse_area_ha(value)
    assert isinstance(result, Decimal)
    assert result == Decimal("71.1514")


@pytest.mark.parametrize("value", [None, "", " \t\n "])
def test_empty_area_is_absent_not_zero(value):
    assert parse_area_ha(value) is None


@pytest.mark.parametrize("value,expected", [
    (0, "0"), ("0 ha", "0"), ("178,9911ha", "178.9911"),
    ("178.9911 ha", "178.9911"), ("1.234,5678 ha", "1234.5678"),
    ("1.234", "1.234"), ("1\u00a0234,5678\u00a0ha", "1234.5678"),
    (1e-7, "0.0000001"), (Decimal("123456789.123456789"), "123456789.123456789"),
])
def test_area_precision_units_and_brazilian_grouping(value, expected):
    assert parse_area_ha(value) == Decimal(expected)


@pytest.mark.parametrize("value", [
    "não informado", "ha", "há", "cerca de 71 ha", "71 hectares", "71 m2",
    "71ha texto", "1,2,3", "1.23,45", "1,234.56", "1.234.567", "1e3",
    "NaN", "Infinity", "-1 ha", -1, float("nan"), float("inf"), True, [],
])
def test_invalid_area_produces_diagnostic_without_echoing_input(value):
    with pytest.raises(ValueError, match="Área inválida") as error:
        parse_area_ha(value)
    assert "não informado" not in str(error.value)
