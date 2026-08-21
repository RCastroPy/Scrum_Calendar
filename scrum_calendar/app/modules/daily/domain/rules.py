import re


def normalize_issue_key(value: str | None) -> str:
    """Return the canonical uppercase representation used by Daily items."""
    return re.sub(r"\s+", "", str(value or "").strip().upper())


def is_valid_issue_key(value: str | None) -> bool:
    return bool(re.fullmatch(r"[A-Z][A-Z0-9_]*-\d+", normalize_issue_key(value)))
