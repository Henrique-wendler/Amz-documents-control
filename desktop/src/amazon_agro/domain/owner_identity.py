"""Local source identity only; no legal or document-validity determination."""

import hashlib
import json
import re


def normalized_owner_document(value: str) -> str:
    if not re.fullmatch(r"[0-9.\s/\-]+", value):
        return ""
    digits = re.sub(r"\D", "", value)
    return digits if len(digits) in {11, 14} else ""


def owner_id(document: str, source_key: tuple[str, ...]) -> str:
    normalized = normalized_owner_document(document)
    # Only a recognized document can join different source occurrences.
    identity = ("document", normalized) if normalized else ("source", *source_key)
    payload = json.dumps(identity, ensure_ascii=False, separators=(",", ":"))
    return "ow_" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
