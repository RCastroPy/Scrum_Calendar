from api.routes import normalize_quarter_label
from data.models import QuarterOption
from tests.test_sprint_unique import client


def test_quarter_formats_share_one_canonical_label():
    for label in ['2026 Q4', '2026-Q4', 'Q4 2026', 'q4-2026', 'Q4/26']:
        assert normalize_quarter_label(label) == 'Q4 2026'


def test_catalog_normalizes_legacy_labels_and_reuses_existing_ids(client):
    http, sessions = client
    assert http.post('/auth/bootstrap', json={'username': 'admin', 'password': 'secret'}).status_code == 200
    http.headers['X-CSRF-Token'] = http.get('/auth/csrf').json()['csrf_token']
    with sessions() as db:
        legacy = QuarterOption(label='2026 Q4')
        other = QuarterOption(label='2027 Q1')
        db.add_all([legacy, other])
        db.flush()
        legacy_id, other_id = legacy.id, other.id
        db.commit()
    listed = {row['id']: row['label'] for row in http.get('/quarters').json()}
    assert listed[legacy_id] == 'Q4 2026'
    assert listed[other_id] == 'Q1 2027'
    for label in ['2026 Q4', 'Q4-2026', 'Q4 2026']:
        response = http.post('/quarters', json={'label': label})
        assert response.status_code == 201
        assert response.json()['id'] == legacy_id
        assert response.json()['label'] == 'Q4 2026'
    assert http.put(f'/quarters/{other_id}', json={'label': 'Q4 2026'}).status_code == 409
    with sessions() as db:
        assert db.query(QuarterOption).count() == 2
        assert db.get(QuarterOption, legacy_id).label == '2026 Q4'
    response = http.put(f'/quarters/{legacy_id}', json={'label': 'Q4-2026'})
    assert response.status_code == 200
    assert response.json()['label'] == 'Q4 2026'
