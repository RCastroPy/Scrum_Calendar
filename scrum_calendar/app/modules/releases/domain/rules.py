import re


def normalize_issue_key(value: str | None) -> str | None:
    clean = re.sub(r"\s+", "", str(value or "").strip().upper())
    return clean or None


def issue_key_conflict(value: str | None) -> str:
    return f"El Issue Key {normalize_issue_key(value) or ''} ya existe. No se puede crear nuevamente."
