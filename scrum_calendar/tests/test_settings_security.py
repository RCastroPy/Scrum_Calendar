from config.settings import Settings, settings
from data.models import TZ_PY


def test_production_forces_secure_session_cookie():
    assert Settings(app_env="production", session_cookie_secure=False).cookie_secure is True


def test_development_can_use_http_session_cookie():
    assert Settings(app_env="development", session_cookie_secure=False).cookie_secure is False


def test_csrf_is_disabled_by_default_for_local_development():
    assert Settings(app_env="development").csrf_protection_enabled is False


def test_production_enables_csrf_by_default():
    assert Settings(app_env="production", csrf_protection_enabled=False).csrf_enabled is True


def test_business_timezone_is_asuncion():
    assert settings.app_timezone == "America/Asuncion"
    assert TZ_PY.key == "America/Asuncion"
