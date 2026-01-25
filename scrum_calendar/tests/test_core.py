from datetime import date

from core.calendar_engine import dias_habiles
from core.metrics import porcentaje_capacidad
from core.sprint_capacity import calcular_capacidad_sprint, clasificar_estado


def test_dias_habiles_excluye_fines_y_feriados():
    inicio = date(2025, 1, 1)  # miercoles
    fin = date(2025, 1, 7)  # martes
    feriados = {date(2025, 1, 1)}
    dias = dias_habiles(inicio, fin, feriados)
    assert len(dias) == 4
    assert dias[0] == date(2025, 1, 2)
    assert dias[-1] == date(2025, 1, 7)


def test_calcular_capacidad_sprint():
    capacidad = calcular_capacidad_sprint(
        capacidad_diaria=[7.0, 7.0],
        dias_habiles=10,
        descuentos_feriados=7.0,
        descuentos_eventos=14.0,
    )
    assert capacidad == 119.0


def test_porcentaje_capacidad():
    assert porcentaje_capacidad(80.0, 100.0) == 80.0
    assert porcentaje_capacidad(10.0, 0.0) == 0.0


def test_clasificar_estado():
    assert clasificar_estado(90) == "HEALTHY"
    assert clasificar_estado(85) == "ATTENTION"
    assert clasificar_estado(70) == "RISK"
    assert clasificar_estado(69.99) == "CRITICAL"
