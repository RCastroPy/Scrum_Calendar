import re
import unicodedata


def normalize_text(value: str) -> str:
    cleaned = unicodedata.normalize("NFD", value or "")
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip().lower()


def clean_label(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())

