# PROJECT_CONTEXT

## Proposito

Este archivo resume el contexto operativo y tecnico de SCRUM MASTER para evitar releer conversaciones largas o explorar todo el repositorio en cada cambio.

Debe ser el primer archivo a revisar antes de hacer cambios.

## Reglas Principales Del Proyecto

- Todo cambio se trabaja primero en local.
- Solo se sube a GitHub y PRD cuando el usuario lo indique explicitamente.
- Antes de PRD, el codigo debe estar en GitHub, salvo instruccion explicita de deploy directo.
- La base de datos de PRD no debe ser reemplazada durante deploys.
- No tocar `.env` de PRD.
- No subir backups, dumps ni datos sensibles a GitHub.
- No usar `git reset --hard` ni comandos destructivos sin aprobacion explicita.
- Evitar leer archivos completos grandes. Usar `rg` y rangos pequenos con `sed -n`.
- Cuando se agregue funcionalidad nueva, preferir modulos independientes antes que seguir creciendo `ScrumV2/dist/app.js`.

## Ubicacion Local

Proyecto:

```text
/Users/rafaelcastro/Library/CloudStorage/OneDrive-Personal/Desarrollos/SCRUM IA/scrum_calendar
```

Repositorio Git raiz:

```text
/Users/rafaelcastro/Library/CloudStorage/OneDrive-Personal/Desarrollos/SCRUM IA
```

Rama principal:

```text
main
```

Remoto:

```text
https://github.com/RCastroPy/Scrum_Calendar.git
```

## Produccion

EC2 actual:

```text
IP: 107.23.137.161
Usuario SSH: ec2-user
Key: ~/.ssh/RCastroPY-3.pem
Ruta PRD: /home/ec2-user/SCRUM_IA/scrum_calendar
URL: http://107.23.137.161:8000
```

Servicios Docker:

```text
api: FastAPI / Uvicorn en puerto 8000
db: PostgreSQL 15 en volumen Docker db_data
```

Regla critica:

```text
No eliminar el volumen db_data.
No ejecutar docker compose down -v.
No copiar la base local sobre PRD salvo pedido explicito.
```

## Stack

- Backend: FastAPI.
- DB: PostgreSQL.
- ORM: SQLAlchemy.
- Frontend: HTML/CSS/JS vanilla con AdminLTE.
- Runtime: Docker Compose.
- Puerto local y PRD: `8000`.

## Comandos Locales

Levantar:

```bash
docker compose up -d --build
```

Ver estado:

```bash
docker compose ps
```

Logs API:

```bash
docker compose logs --tail=80 api
```

Tests:

```bash
docker compose exec api python -m pytest /app/tests
```

Validacion JS puntual:

```bash
node --check ScrumV2/dist/app.js
node --check ScrumV2/dist/js/compras.js
node --check frontend/app.js
node --check frontend/js/compras.js
```

## URLs Principales

Local:

```text
Login: http://localhost:8000/ui/login.html
Dashboard: http://localhost:8000/ui/index.html
Daily: http://localhost:8000/ui/daily.html
Tareas: http://localhost:8000/ui/tasks.html
Releases tabla: http://localhost:8000/ui/releases-table.html
Compras: http://localhost:8000/ui/compras.html
Carga de datos: http://localhost:8000/ui/data-entry.html
Retrospectiva: http://localhost:8000/ui/retrospective.html
Poker Planning: http://localhost:8000/ui/poker-planning.html
1:1: http://localhost:8000/ui/one-to-one.html
```

PRD:

```text
Login: http://107.23.137.161:8000/ui/login.html
Daily: http://107.23.137.161:8000/ui/daily.html
Tareas: http://107.23.137.161:8000/ui/tasks.html
```

## Credenciales De Uso

Usuario funcional habitual:

```text
admin
1234
```

No escribir secretos reales en este archivo.

## Archivos Criticos

Backend:

```text
main.py
api/routes.py
api/schemas.py
data/models.py
data/db.py
core/security.py
core/audit.py
config/settings.py
```

Frontend runtime principal:

```text
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
ScrumV2/dist/*.html
ScrumV2/dist/js/compras.js
```

Frontend espejo:

```text
frontend/app.js
frontend/styles.css
frontend/*.html
frontend/js/compras.js
```

Nota:

El sistema sirve principalmente desde `ScrumV2/dist` y `frontend`, montados por Docker:

```yaml
./frontend:/app/frontend
./ScrumV2/dist:/app/ScrumV2/dist
```

## Estado Tecnico Actual

El archivo `ScrumV2/dist/app.js` concentra demasiada logica:

- Dashboard.
- Daily.
- Tareas.
- Releases.
- Retrospectiva.
- Poker Planning.
- 1:1.
- Carga de datos.

Esto aumenta:

- Consumo de tokens.
- Riesgo de regresiones.
- Tiempo de analisis.
- Dificultad para pruebas.

Prioridad tecnica:

```text
Modularizar gradualmente nuevas funcionalidades y evitar seguir creciendo app.js.
```

## Convencion Para Nuevos Modulos

Nueva estructura sugerida:

```text
ScrumV2/dist/js/modules/<modulo>/
  index.js
  api.js
  state.js
  render.js
  events.js
  calculations.js
```

Para Reportes:

```text
ScrumV2/dist/js/reports/
  reports-main.js
  services/
  components/
  modules/
```

## Politica De Cache Frontend

Cada cambio en JS/CSS que deba verse en navegador debe actualizar query string:

```html
<link rel="stylesheet" href="./styles.css?v=YYYYMMDDdescripcion" />
<script src="./app.js?v=YYYYMMDDdescripcion"></script>
```

Safari/iPad suele requerir recarga fuerte.

## Como Ahorrar Tokens

Antes de editar:

1. Leer este archivo.
2. Leer `MODULE_MAP.md`.
3. Si hay deploy, leer `RUNBOOK_DEPLOY.md`.
4. Usar `rg` para buscar IDs concretos.
5. Leer maximo rangos pequenos con `sed -n 'inicio,finp'`.
6. Evitar `git diff` completo si hay muchos binarios/assets.
7. No abrir archivos generados o mapas `.map` salvo necesidad real.

## Formato Recomendado Para Nuevos Pedidos

```text
Seccion:
Problema:
Resultado esperado:
Ambiente: local / PRD
Deploy: si / no
```

## Documentos Relacionados

```text
MODULE_MAP.md
RUNBOOK_DEPLOY.md
Reportes_Celulas.md
README.md
TESTPLAN_RETRO_REALTIME.md
documentos/
```
