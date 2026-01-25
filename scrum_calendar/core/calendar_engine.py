from datetime import date, timedelta
from typing import Iterable, List, Set


def dias_habiles(fecha_inicio: date, fecha_fin: date, feriados: Set[date]) -> List[date]:
    dias = []
    actual = fecha_inicio
    while actual <= fecha_fin:
        if actual.weekday() < 5 and actual not in feriados:
            dias.append(actual)
        actual += timedelta(days=1)
    return dias
