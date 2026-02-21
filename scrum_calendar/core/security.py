import base64
import hashlib
import hmac
import secrets

from config.settings import settings

PBKDF2_ROUNDS = max(120_000, int(getattr(settings, "pbkdf2_rounds", 600_000)))


def hash_password(password: str, salt: str | None = None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS)
    encoded = base64.b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt}${encoded}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) == 4:
        algo, rounds_raw, salt, encoded = parts
        try:
            rounds = max(120_000, int(rounds_raw))
        except ValueError:
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds)
        candidate = f"pbkdf2_sha256${rounds}${salt}${base64.b64encode(digest).decode('ascii')}"
    elif len(parts) == 3:
        # Backward compatibility with old hashes: algo$salt$hash
        algo, salt, encoded = parts
        rounds = 120_000
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds)
        candidate = f"pbkdf2_sha256${salt}${base64.b64encode(digest).decode('ascii')}"
    else:
        return False
    if algo != "pbkdf2_sha256":
        return False
    return hmac.compare_digest(candidate, stored)


def needs_password_rehash(stored: str) -> bool:
    parts = (stored or "").split("$")
    if len(parts) == 4:
        try:
            rounds = int(parts[1])
        except ValueError:
            return True
        return rounds < PBKDF2_ROUNDS
    # Old format always rehashes into new format.
    return True


def new_session_token() -> str:
    return secrets.token_urlsafe(32)
