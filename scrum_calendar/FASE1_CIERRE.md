# Scrum Calendar - Cierre Fase 1 (MVP)

Fecha: 2025-04-03

## Alcance entregado
- CRUD de celulas, personas, sprints, feriados y eventos.
- Dashboard de capacidad con calendario, indicadores y tablas.
- Daily con carga manual e importacion masiva.
- Modulo 1:1 con calendario, formulario y registro historico.
- Autenticacion basica (Admin/Miembro) y gestion de usuarios.
- API base con FastAPI + PostgreSQL + Docker.

## Decisiones acordadas (Fase 1)
- Roles: solo Admin y Miembro (SM actua como Admin).
- Solapamientos: sin restricciones, decide el Admin/SM.
- Reglas automaticas por horas (ventana/permiso): manual por Admin/SM.

## Tests
- Tests basicos OK (10 tests).

## Pendientes para Fase 2/3
- Alertas avanzadas y metricas ampliadas.
- Integracion Jira (import/export avanzado).
- IA y predicciones.

## URLs de uso
- Login: http://localhost:8000/ui/login.html
- Dashboard: http://localhost:8000/ui/index.html
- Carga de datos: http://localhost:8000/ui/data-entry.html
- Daily: http://localhost:8000/ui/daily.html
- 1:1: http://localhost:8000/ui/one-to-one.html
- Admin: http://localhost:8000/ui/admin.html
