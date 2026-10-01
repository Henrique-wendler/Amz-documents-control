"""Small display-only privacy helpers."""

from __future__ import annotations

import re


def mask_document(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        return "—"
    return digits[:3] + "•" * max(3, len(digits) - 5) + digits[-2:]


def short_owner_name(value: str) -> str:
    parts = value.split()
    if len(parts) < 2:
        return value or "—"
    return parts[0] + " " + parts[1][0] + "."
