from datetime import date
from typing import List


def calcular_capacidad_sprint(
    capacidad_diaria: List[float],
    dias_habiles: int,
    descuentos_feriados: float,
    descuentos_eventos: float,
) -> float:
    capacidad_teorica = sum(capacidad_diaria) * dias_habiles
    capacidad_real = capacidad_teorica - descuentos_feriados - descuentos_eventos
    return max(capacidad_real, 0.0)


def clasificar_estado(capacidad_porcentaje: float) -> str:
    if capacidad_porcentaje >= 90:
        return "HEALTHY"
    if capacidad_porcentaje >= 80:
        return "ATTENTION"
    if capacidad_porcentaje >= 70:
        return "RISK"
    return "CRITICAL"
