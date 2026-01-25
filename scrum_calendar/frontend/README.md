# Scrum Calendar - Guia de uso (Fase 1)

## Inicio rapido
- Levantar stack: `docker compose up -d --build`
- Abrir UI: `http://localhost:8000/ui/login.html`
- Primera vez: usar el boton **Crear admin inicial**.

## Acceso y roles
- Admin: acceso total (CRUD + dashboards + 1:1 + daily + carga de datos).
- Miembro: lectura limitada (dashboard).

## Pantallas principales
- Dashboard: `/ui/index.html`
  - Seleccion de celula y sprint.
  - Vista de calendario, capacidad y eventos.
- Carga de datos: `/ui/data-entry.html`
  - CRUD de celulas, personas, sprints, feriados y eventos.
- Daily: `/ui/daily.html`
  - Seguimiento del sprint con remaining days, dev team e items.
  - Carga manual de items si es necesario.
- 1:1: `/ui/one-to-one.html`
  - Seleccionar celula y persona.
  - Calendario mensual con eventos.
  - Formulario 1:1 y registro historico.
- Admin: `/ui/admin.html`
  - Gestion de usuarios y catalogos.

## Flujo 1:1 (resumen)
1) Seleccionar celula y persona.
2) Completar formulario 1:1:
   - Acuerdos
   - Estado de animo
   - Feedback positivo y negativo
   - Habilidades/competencias a mejorar
3) Presionar **Registrar 1:1**.
4) Revisar el registro en la tabla historica (Estado: pendiente/ok/vencido).

## Notas operativas
- La UI se sirve desde `:8000` para mantener autenticacion y cookies.
- Para cambios de frontend sin rebuild:
  - Ejecutar `./refresh-ui.sh` y recargar el navegador.
- Para cambios de backend o dependencias:
  - Ejecutar `docker compose up -d --build`.
