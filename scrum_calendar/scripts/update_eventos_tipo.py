from sqlalchemy import select

from data.db import SessionLocal
from data.models import EventoTipo


UPDATES = {
    "Vacaciones": {
        "nombre": "Vacaciones",
        "impacto_capacidad": 100,
        "planificado": True,
        "prioridad": "alta",
    },
    "Reposo medico": {
        "nombre": "Reposo",
        "impacto_capacidad": 100,
        "planificado": False,
        "prioridad": "alta",
    },
    "Enfermedad": {
        "nombre": "Reposo",
        "impacto_capacidad": 100,
        "planificado": False,
        "prioridad": "alta",
    },
    "Dia FLEX": {
        "nombre": "FLEX",
        "impacto_capacidad": 100,
        "planificado": True,
        "prioridad": "baja",
    },
    "Permiso": {
        "nombre": "Dia libre",
        "impacto_capacidad": 100,
        "planificado": True,
        "prioridad": "baja",
    },
    "Soporte a celula": {
        "nombre": "Soporte a otras celulas",
        "impacto_capacidad": 100,
        "planificado": True,
        "prioridad": "informativa",
    },
    "Ventana nocturna": {
        "nombre": "Ventana nocturna",
        "impacto_capacidad": 100,
        "planificado": True,
        "prioridad": "media",
    },
    "Dia libre por cumple": {
        "nombre": "Dia libre por cumple",
        "impacto_capacidad": 100,
        "planificado": True,
        "prioridad": "media",
    },
}


def main() -> None:
    session = SessionLocal()
    try:
        tipos = session.execute(select(EventoTipo)).scalars().all()
        existing_names = {tipo.nombre for tipo in tipos}
        for tipo in tipos:
            if tipo.nombre not in UPDATES:
                continue
            payload = UPDATES[tipo.nombre]
            tipo.nombre = payload["nombre"]
            tipo.impacto_capacidad = payload["impacto_capacidad"]
            tipo.planificado = payload["planificado"]
            tipo.prioridad = payload["prioridad"]
            tipo.activo = True
        if "Dia libre por cumple" not in existing_names:
            session.add(
                EventoTipo(
                    nombre="Dia libre por cumple",
                    impacto_capacidad=100,
                    planificado=True,
                    prioridad="media",
                    activo=True,
                )
            )
        session.commit()
        print("Tipos de evento actualizados.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
