from sqlalchemy import insert

from data.db import engine
from data.models import Base, EventoTipo


EVENTOS_BASE = [
    {"nombre": "Vacaciones", "impacto_capacidad": 100, "planificado": True, "prioridad": "alta"},
    {"nombre": "Reposo", "impacto_capacidad": 100, "planificado": False, "prioridad": "alta"},
    {"nombre": "FLEX", "impacto_capacidad": 100, "planificado": True, "prioridad": "baja"},
    {"nombre": "Dia libre", "impacto_capacidad": 100, "planificado": True, "prioridad": "baja"},
    {"nombre": "Soporte a otras celulas", "impacto_capacidad": 100, "planificado": True, "prioridad": "informativa"},
    {"nombre": "Dia libre por cumple", "impacto_capacidad": 100, "planificado": True, "prioridad": "media"},
    {"nombre": "Ventana nocturna", "impacto_capacidad": 100, "planificado": True, "prioridad": "media"},
]


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(insert(EventoTipo), EVENTOS_BASE)
    print("Seed completado")
