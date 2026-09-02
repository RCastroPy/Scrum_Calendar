# Despliegue: Vercel + Render + Supabase + GitHub

## Arquitectura

- GitHub es la unica fuente de codigo y dispara ambos despliegues.
- Vercel publica `ScrumV2/dist` bajo `/ui` y redirige `/` al dashboard.
- Vercel reescribe las solicitudes HTTP que no son archivos `/ui` hacia Render.
- Los WebSockets de Poker y Retrospectiva se conectan directamente a Render por `wss`.
- Render ejecuta FastAPI en un solo proceso para conservar el estado WebSocket actual.
- Supabase aloja PostgreSQL. Render debe usar el Shared Pooler en modo session.

## 1. Crear Supabase

1. Crear un proyecto Supabase en una region cercana a Virginia.
2. En **Connect**, copiar la URL de **Session pooler**, puerto `5432`.
3. Convertir el esquema de la URL para SQLAlchemy si es necesario:
   `postgresql+psycopg2://usuario:password@host:5432/postgres`.
4. Agregar `?sslmode=require` o mantener `DATABASE_SSL_REQUIRE=true` en Render.
5. No exponer esta URL en GitHub ni Vercel.

### Restaurar la ultima base de PRD

El dump validado esta fuera de Git:

`backups/prd_20260901_071720/scrumia_prd_20260901_071720.dump`

Ejecutar desde `scrum_calendar`:

```bash
export SUPABASE_DATABASE_URL='postgresql://...'
./scripts/restore_supabase_backup.sh backups/prd_20260901_071720/scrumia_prd_20260901_071720.dump
```

La restauracion usa PostgreSQL 15 mediante Docker y limita los cambios al esquema `public`.

## 2. Crear Render

1. Conectar Render con `RCastroPy/Scrum_Calendar` en GitHub.
2. Crear un Blueprint usando `/render.yaml`.
3. Cuando Render lo solicite, configurar `DATABASE_URL` con la URL Session Pooler de Supabase.
4. Confirmar que el servicio se llame `scrumia-api-rcastropy`.
5. Esperar que `/health` responda `{"status":"ok","database":"ok"}`.

El plan Free se suspende cuando no tiene trafico. La primera solicitud posterior puede tardar y
las conexiones WebSocket se interrumpen durante suspensión o despliegue. Para uso continuo se
debe cambiar a un plan Render de pago.

El comando de inicio ejecuta `scripts/prepare_database.py` porque Render no ofrece pre-deploy
commands en servicios web gratuitos. El proceso crea el baseline faltante y aplica Alembic de
forma idempotente antes de iniciar Uvicorn.

## 3. Crear Vercel

1. Importar el mismo repositorio desde GitHub.
2. Configurar **Root Directory** como `scrum_calendar`.
3. Mantener el framework como **Other**; `vercel.json` controla build y rutas.
4. Agregar `RENDER_API_URL=https://scrumia-api-rcastropy.onrender.com`.
5. Asignar al proyecto el nombre `scrumia-rcastropy` o actualizar estas referencias si cambia:
   - `vercel.json`, destino de rewrites.
   - `/render.yaml`, variable `CORS_ORIGINS_RAW`.
6. Desplegar y abrir `/ui/login.html`.

Las solicitudes HTTP mantienen cookies de sesion en el dominio Vercel porque pasan por el proxy.
No se debe configurar el navegador para consumir directamente el dominio Render salvo que se
migre la autenticacion a tokens o cookies cross-site.

## 4. Validacion

```bash
python scripts/check_frontend_sync.py
python scripts/build_vercel_frontend.py
python -m pytest -q
```

Smoke tests obligatorios:

1. Login y logout con cookies Secure.
2. Crear y editar una tarea sin recargar la pagina.
3. Crear subtarea y verificar jerarquia.
4. Abrir Poker y Retrospectiva en dos navegadores y validar WebSockets.
5. Crear un release y revisar Gantt.
6. Reiniciar Render y confirmar persistencia en Supabase.

## Limitacion de escalado

Los administradores WebSocket mantienen presencia y conexiones en memoria. Render debe ejecutar
una sola instancia. Antes de escalar horizontalmente, mover presencia y pub/sub a Redis o a otro
almacen compartido.
