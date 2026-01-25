import base64
import hashlib
import hmac
import secrets


PBKDF2_ROUNDS = 120_000


def hash_password(password: str, salt: str | None = None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS)
    encoded = base64.b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256${salt}${encoded}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt, encoded = stored.split("$", 2)
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, stored)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)
