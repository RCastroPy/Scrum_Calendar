import re
from datetime import date, datetime, timedelta
from typing import Optional

from app.shared.infrastructure.tabular import header_base
from app.shared.domain.text import normalize_text
from data.models import Sprint

HEADER_ALIASES = {
    "issue_type": ["issue type", "issuetype", "type"],
    "issue_key": ["issue key", "issuekey", "key"],
    "summary": ["summary", "resumen"],
    "status": ["status", "estado"],
    "story_points": ["custom field (story points)", "story points", "puntos"],
    "assignee": ["assignee", "responsable"],
    "start_date": ["custom field (start date)", "start date", "inicio"],
    "end_date": ["custom field (end date)", "end date", "fin"],
    "due_date": ["due date", "duedate", "fecha limite"],
    "sprint": ["sprint"],
    "quarter": ["quarter", "trimestre", "q"],
}


def resolve_import_columns(fieldnames: list[str]) -> tuple[dict[str, Optional[str]], list[str], list[str]]:
    headers: dict[str, list[str]] = {}
    for header in fieldnames:
        if header:
            headers.setdefault(header_base(header), []).append(header)

    def resolve_header(field: str) -> Optional[str]:
        for alias in HEADER_ALIASES[field]:
            matches = headers.get(header_base(alias), [])
            if matches:
                return matches[0]
        return None

    def resolve_headers(field: str) -> list[str]:
        resolved: list[str] = []
        for alias in HEADER_ALIASES[field]:
            resolved.extend(headers.get(header_base(alias), []))
        return resolved

    resolved = {
        field: resolve_header(field)
        for field in HEADER_ALIASES
        if field != "sprint"
    }
    sprint_headers = resolve_headers("sprint")
    missing = [field for field, header in resolved.items() if header is None and field != "quarter"]
    if not sprint_headers:
        missing.append("sprint")
    return resolved, sprint_headers, missing


def parse_import_date(value: str) -> Optional[date]:
    if not value or not value.strip():
        return None
    cleaned = value.strip()
    formats = ["%d/%b/%y %I:%M %p", "%d/%b/%y", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"]
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    if " " in cleaned:
        base = cleaned.split(" ")[0]
        for fmt in ["%d/%b/%y", "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"]:
            try:
                return datetime.strptime(base, fmt).date()
            except ValueError:
                continue
    return None


def normalize_sprint_name(value: str) -> str:
    cleaned = normalize_text(value).replace("sprint", "").strip()
    return re.sub(r"[^a-z0-9]+", "", cleaned)


def derive_sprint_dates(name: str) -> Optional[tuple[date, date]]:
    match = re.search(r"(\d{4})(\d{2})", name)
    if not match:
        return None
    year, week = int(match.group(1)), int(match.group(2))
    if week < 1 or week > 53:
        return None
    start = date.fromisocalendar(year, week, 1)
    return start, start + timedelta(days=13)


def resolve_sprint(name: str, sprint_map: dict[str, Sprint]) -> Optional[Sprint]:
    if not name:
        return None
    normalized = normalize_sprint_name(name)
    if normalized in sprint_map:
        return sprint_map[normalized]
    digits = re.findall(r"\d+", normalized)
    if digits:
        matches = [sprint for key, sprint in sprint_map.items() if digits[0] in key]
        if len(matches) == 1:
            return matches[0]
    matches = [sprint for key, sprint in sprint_map.items() if normalized in key or key in normalized]
    return matches[0] if len(matches) == 1 else None


def extract_issue_prefix(issue_key: str) -> str:
    match = re.match(r"\s*([A-Za-z0-9]+)[-_]", issue_key or "")
    if match:
        return re.sub(r"[^a-zA-Z0-9]", "", match.group(1)).upper()
    token = (issue_key or "").split("-")[0]
    return re.sub(r"[^a-zA-Z0-9]", "", token).upper()
