def porcentaje_capacidad(capacidad_real: float, capacidad_teorica: float) -> float:
    if capacidad_teorica <= 0:
        return 0.0
    return round((capacidad_real / capacidad_teorica) * 100, 2)
