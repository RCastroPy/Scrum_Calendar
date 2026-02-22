# Rotacion de Credenciales (DB + Sesiones)

Objetivo: rotar credenciales sensibles de forma controlada y dejar evidencia operativa.

## Alcance

- Password del usuario de base de datos usado por la API.
- Invalidacion de sesiones activas (`sesiones`).
- Actualizacion de variables en `.env`.

## Requisitos previos

- Ejecutar en `scrum_calendar/`.
- Tener backup reciente de base de datos.
- Confirmar ventana de cambio (usuarios seran deslogueados si se invalidan sesiones).

## 1) Simulacion (sin aplicar)

```bash
cd scrum_calendar
python3 scripts/rotate_credentials.py --env-file .env
```

## 2) Aplicar en Local

```bash
cd scrum_calendar
python3 scripts/rotate_credentials.py --env-file .env --apply
docker compose up -d --build
```

Verificacion:

1. Login admin funciona con normalidad.
2. Usuarios previos deben volver a iniciar sesion.
3. Revisar logs de API para errores de conexion DB.

## 3) Aplicar en PRD (EC2)

```bash
cd /ruta/proyecto/scrum_calendar
python3 scripts/rotate_credentials.py --env-file .env --apply
docker compose up -d --build
```

Verificacion PRD:

1. `/` responde `{"status":"ok"}`.
2. Login funciona.
3. No aparecen errores de `password authentication failed` en logs.

## 4) Opciones utiles

- Solo invalidar sesiones (sin cambiar password DB):

```bash
python3 scripts/rotate_credentials.py --env-file .env --no-rotate-db-password --apply
```

- Rotar con password definido manualmente:

```bash
python3 scripts/rotate_credentials.py --env-file .env --new-password 'TuNuevoPasswordSeguro' --apply
```

## 5) Rollback rapido

Si hubo error luego de aplicar:

1. Restaurar `.env` previo.
2. Revertir password del rol DB con el mismo script usando `--new-password`.
3. Reiniciar API:

```bash
docker compose up -d --build api
```
