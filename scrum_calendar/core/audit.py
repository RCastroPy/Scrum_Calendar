import json
import logging
from datetime import datetime, timezone
from typing import Any

from config.settings import settings

_LOGGER = logging.getLogger("scrum.security")
if not _LOGGER.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _LOGGER.addHandler(_handler)
_LOGGER.setLevel(logging.INFO)
_LOGGER.propagate = False


def log_security_event(event: str, severity: str = "INFO", **fields: Any) -> None:
    if not settings.security_audit_log_enabled:
        return
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": str(event or "").strip() or "unknown_event",
        "severity": str(severity or "INFO").upper(),
    }
    for key, value in fields.items():
        if value is None:
            continue
        payload[str(key)] = value
    message = json.dumps(payload, ensure_ascii=True, default=str)
    level = logging.INFO
    if payload["severity"] in {"WARNING", "WARN"}:
        level = logging.WARNING
    elif payload["severity"] in {"ERROR", "CRITICAL"}:
        level = logging.ERROR
    _LOGGER.log(level, message)
