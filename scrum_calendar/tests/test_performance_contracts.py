import asyncio
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import event

import main as main_mod
from api.routes import _cargar_capacidades_sprints, listar_personas
from api.schemas import PersonaOut
from data.models import Celula, Evento, EventoTipo, Feriado, Persona, Sprint, Task
from tests.test_sprint_unique import client
from tests.test_tasks_authz import bootstrap_admin, create_member, login


def test_bulk_dates_atomic_permissions_and_preserved_fields(client):
    http, sessions = client
    bootstrap_admin(http)
    cell = http.post('/celulas', json={'nombre': 'A', 'jira_codigo': 'A'}).json()['id']
    def create(title):
        response = http.post('/tasks', json={'titulo': title, 'celula_id': cell, 'estado': 'doing'})
        assert response.status_code == 201
        return response.json()
    first, second = create('First'), create('Second')
    payload = {'task_ids': [first['id'], second['id'], first['id']], 'fecha_vencimiento': '2026-10-20'}
    response = http.post('/tasks/bulk-due-date', json=payload)
    assert response.status_code == 200
    assert len(response.json()) == 2
    for before, after in zip([first, second], sorted(response.json(), key=lambda row: row['id'])):
        assert after['fecha_vencimiento'] == '2026-10-20'
        assert after['estado'] == before['estado']
        assert after['start_date'] == before['start_date']
    assert http.post('/tasks/bulk-due-date', json={**payload, 'task_ids': [first['id'], 999999]}).status_code == 404
    assert http.post('/tasks/bulk-due-date', json={'task_ids': []}).status_code == 422
    assert http.post('/tasks/bulk-due-date', json={'task_ids': [first['id']]}).status_code == 422
    create_member(http, 'member')
    http.post('/auth/logout')
    login(http, 'member', 'pass')
    own = create('Own')
    assert http.post('/tasks/bulk-due-date', json={**payload, 'task_ids': [own['id'], first['id']]}).status_code == 403
    with sessions() as db:
        assert db.get(Task, own['id']).fecha_vencimiento is None
        assert db.get(Task, first['id']).fecha_vencimiento == date(2026, 10, 20)
    assert http.post('/tasks/bulk-due-date', json={**payload, 'task_ids': [own['id']]}).status_code == 200
    cleared = http.post('/tasks/bulk-due-date', json={'task_ids': [own['id']], 'fecha_vencimiento': None})
    assert cleared.status_code == 200
    assert cleared.json()[0]['fecha_vencimiento'] is None
    http.post('/auth/logout')
    assert http.post('/tasks/bulk-due-date', json=payload).status_code == 401


def test_capacity_batch_four_queries_and_people_two_queries(client):
    http, sessions = client
    bootstrap_admin(http)
    with sessions() as db:
        a, b = Celula(nombre='A'), Celula(nombre='B')
        dev = Persona(nombre='Shared', apellido='Dev', rol='dev', capacidad_diaria_horas=8, celulas=[a, b])
        po = Persona(nombre='Product', apellido='Owner', rol='po', capacidad_diaria_horas=8, celulas=[a])
        inactive = Persona(nombre='Inactive', apellido='Dev', rol='dev', activo=False, capacidad_diaria_horas=8, celulas=[a])
        kind = EventoTipo(nombre='Vacation test', impacto_capacidad=100)
        sprints = [Sprint(nombre='Sprint', celula=a, fecha_inicio=date(2026, 10, 12), fecha_fin=date(2026, 10, 16)),
                   Sprint(nombre='Sprint', celula=b, fecha_inicio=date(2026, 10, 12), fecha_fin=date(2026, 10, 16))]
        db.add_all([dev, po, inactive, kind, *sprints])
        db.flush()
        db.add(Feriado(nombre='Local', fecha=date(2026, 10, 13), celula_id=a.id))
        db.add(Evento(persona_id=dev.id, tipo_evento_id=kind.id, fecha_inicio=date(2026, 10, 14), fecha_fin=date(2026, 10, 14), impacto_capacidad=100))
        ids = [s.id for s in sprints]
        db.commit()
    queries = []
    def count(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith('SELECT'):
            queries.append(statement)
    engine = sessions.kw['bind']
    event.listen(engine, 'before_cursor_execute', count)
    try:
        with sessions() as db:
            capacities = _cargar_capacidades_sprints(db, ids + ids)
            assert len(queries) == 4
            assert [row['sprint_id'] for row in capacities] == ids
            assert capacities[0]['capacidad_teorica'] == 24
            assert capacities[0]['capacidad_real'] == 16
            assert capacities[1]['capacidad_teorica'] == 32
            assert capacities[1]['capacidad_real'] == 24
            assert len(capacities[0]['detalle_por_persona']) == 2
            assert capacities[0]['detalle_por_persona'][1]['capacidad_real'] == 0
        queries.clear()
        with sessions() as db:
            rows = [PersonaOut.model_validate(person) for person in listar_personas(db=db)]
            assert len(rows) == 3
            assert len(queries) == 2
        with sessions() as db, pytest.raises(HTTPException) as error:
            _cargar_capacidades_sprints(db, ids + [99999])
        assert error.value.status_code == 404
    finally:
        event.remove(engine, 'before_cursor_execute', count)
    response = http.get('/sprints/capacidades', params=[('sprint_ids', i) for i in ids])
    assert response.status_code == 200
    assert response.json() == capacities
    assert http.get('/sprints/capacidades').status_code == 422


def test_session_database_lookup_is_not_on_event_loop(client, monkeypatch):
    http, _ = client
    bootstrap_admin(http)
    original = main_mod._load_valid_session
    calls = []
    def checked(token):
        with pytest.raises(RuntimeError):
            asyncio.get_running_loop()
        calls.append(token)
        return original(token)
    monkeypatch.setattr(main_mod, '_load_valid_session', checked)
    assert http.get('/sprints').status_code == 200
    assert http.get('/ui/index.html').status_code == 200
    assert len(calls) == 2
