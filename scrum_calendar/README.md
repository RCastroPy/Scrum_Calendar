# Scrum Calendar - Guia rapida

## Inicio rapido
- Levantar stack: `docker compose up -d --build`
- UI (login): `http://localhost:8000/ui/login.html`
- Primera vez: boton **Crear admin inicial**.

## URLs principales
- Dashboard: `/ui/index.html`
- Carga de datos: `/ui/data-entry.html`
- Daily: `/ui/daily.html`
- 1:1: `/ui/one-to-one.html`
- Admin: `/ui/admin.html`
- Connect: `/ui/connect.html`

## Flujo 1:1 (resumen)
1) Seleccionar celula y persona.
2) Completar formulario 1:1 (acuerdos, estado de animo, feedback, crecimiento).
3) Presionar **Registrar 1:1**.
4) Revisar historico en tabla (estado pendiente/finalizado/vencido).

## Tests
- Ejecutar: `docker compose exec api python -m pytest /app/tests`

## Desarrollo frontend
- El frontend se sirve desde `:8000` (contenedor).
- Para cambios HTML/CSS/JS:
  - Ejecutar `./refresh-ui.sh` y recargar el navegador (Cmd+Shift+R).
- Para cambios backend o dependencias:
  - Ejecutar `docker compose up -d --build`.
