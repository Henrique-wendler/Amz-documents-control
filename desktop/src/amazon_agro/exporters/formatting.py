from __future__ import annotations

import re
import unicodedata
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


_MONTHS_PT_BR = (
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
)


def format_brl(value: Decimal) -> str:
    if not isinstance(value, Decimal) or not value.is_finite():
        raise ValueError("Valor monetário inválido.")
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    western = f"{rounded:,.2f}"
    return "R$ " + western.replace(",", "\0").replace(".", ",").replace("\0", ".")


def format_percent(value: Decimal) -> str:
    if not isinstance(value, Decimal) or not value.is_finite():
        raise ValueError("Percentual inválido.")
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{rounded:f}".rstrip("0").rstrip(".").replace(".", ",") + "%"


def format_percentage_fixed(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{rounded:.2f}".replace(".", ",") + "%"


def format_date_pt_br(city: str, proposal_date: date) -> str:
    prefix = f"{city.strip()}, " if city.strip() else ""
    return (
        f"{prefix}{proposal_date.day} de "
        f"{_MONTHS_PT_BR[proposal_date.month - 1]} de {proposal_date.year}"
    )


def _safe_part(value: str, fallback: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(
        character for character in ascii_value if not unicodedata.combining(character)
    )
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", ascii_value).strip("_-")
    cleaned = re.sub(r"_+", "_", cleaned)[:70].strip("_-")
    return cleaned or fallback


def proposal_filename_stem(number: str, proponent: str) -> str:
    safe_number = _safe_part(number, "Sem_numero")
    safe_proponent = _safe_part(proponent, "Sem_proponente")
    return f"{safe_number}_{safe_proponent}_proposta"
