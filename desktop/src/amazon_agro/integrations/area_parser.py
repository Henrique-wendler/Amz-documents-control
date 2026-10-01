"""Strict, locale-aware conversion of optional hectare values."""

from decimal import Decimal, InvalidOperation
import re


def parse_area_ha(value: object) -> Decimal | None:
    """Return hectares as Decimal; None/blank mean absent, never zero.

    A single comma or dot is decimal. Brazilian thousands separators are
    accepted only with a decimal comma and correctly grouped triples.
    Numeric Excel values use their decimal string, not Decimal(float).
    """
    if value is None or isinstance(value, str) and not value.strip():
        return None
    message = "Área inválida: informe um número não negativo, opcionalmente seguido de ha."
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError(message)
    if isinstance(value, str):
        raw = re.sub(r"\s+", "", value)
        raw = re.sub(r"h[aá]$", "", raw, flags=re.IGNORECASE)
        if not re.fullmatch(r"(?:[0-9]+(?:[.,][0-9]+)?|[0-9]{1,3}(?:\.[0-9]{3})+,[0-9]+)", raw):
            raise ValueError(message)
        if "," in raw:
            raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = str(value)
    try:
        result = Decimal(raw)
    except InvalidOperation as error:
        raise ValueError(message) from error
    if not result.is_finite() or result < 0:
        raise ValueError(message)
    return result
