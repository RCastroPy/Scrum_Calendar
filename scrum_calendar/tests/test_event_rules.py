from datetime import date
from types import SimpleNamespace

from api.routes import impacto_por_dia


def test_impacto_por_dia_suma_y_limita():
    dia = date(2025, 1, 2)
    eventos = [
        SimpleNamespace(fecha_inicio=dia, fecha_fin=dia, impacto_capacidad=60),
        SimpleNamespace(fecha_inicio=dia, fecha_fin=dia, impacto_capacidad=50),
    ]
    assert impacto_por_dia(eventos, dia) == 100.0


def test_impacto_por_dia_fuera_de_rango():
    dia = date(2025, 1, 2)
    eventos = [
        SimpleNamespace(fecha_inicio=date(2025, 1, 5), fecha_fin=date(2025, 1, 6), impacto_capacidad=80),
    ]
    assert impacto_por_dia(eventos, dia) == 0.0


def test_impacto_por_dia_no_negativo():
    dia = date(2025, 1, 2)
    eventos = [
        SimpleNamespace(fecha_inicio=dia, fecha_fin=dia, impacto_capacidad=-10),
    ]
    assert impacto_por_dia(eventos, dia) == 0.0
