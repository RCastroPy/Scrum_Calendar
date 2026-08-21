from app.modules.daily.domain.rules import is_valid_issue_key, normalize_issue_key
from app.modules.releases.domain.rules import issue_key_conflict


def test_daily_issue_key_normalization_and_validation():
    assert normalize_issue_key(" sm- 123 ") == "SM-123"
    assert is_valid_issue_key("SM-123")
    assert not is_valid_issue_key("SM")


def test_release_issue_conflict_message_uses_canonical_key():
    assert issue_key_conflict(" sm-123 ") == "El Issue Key SM-123 ya existe. No se puede crear nuevamente."
