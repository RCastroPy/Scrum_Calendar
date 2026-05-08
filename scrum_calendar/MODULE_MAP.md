# MODULE_MAP

## Objetivo

Mapa de modulos, archivos y responsabilidades para reducir exploracion futura y facilitar modularizacion progresiva.

Antes de modificar una seccion, buscar aqui los archivos probables y reglas especificas.

## Regla General

No agregar nuevas funcionalidades grandes directamente en:

```text
ScrumV2/dist/app.js
```

Si el cambio es nuevo o grande, crear modulo independiente.

## Runtime Frontend

El frontend se sirve principalmente desde:

```text
ScrumV2/dist/
frontend/
```

Docker monta:

```yaml
./frontend:/app/frontend
./ScrumV2/dist:/app/ScrumV2/dist
```

Por eso, cuando una pantalla existe en ambas rutas, revisar si hay que mantener ambas sincronizadas.

## Backend

### API

Archivos:

```text
main.py
api/routes.py
api/schemas.py
```

Responsabilidad:

- Rutas REST.
- WebSockets.
- Autenticacion.
- CRUD de entidades.
- Operaciones de Daily, Tareas, Releases, Compras, Retrospectiva y Poker.

Busqueda recomendada:

```bash
rg -n "nombre_endpoint|router|@app|websocket|sprint-items|tasks|releases" main.py api
```

### Modelos

Archivos:

```text
data/models.py
data/db.py
```

Responsabilidad:

- Tablas SQLAlchemy.
- Relaciones.
- Campos nuevos.

Precaucion:

Si se toca `data/models.py`, evaluar si hace falta migracion o script de actualizacion.

### Seguridad

Archivos:

```text
core/security.py
core/audit.py
config/settings.py
```

Responsabilidad:

- Sesiones.
- Password hashing.
- Cookies.
- Rate limit.
- Auditoria.
- Configuracion por entorno.

## Frontend Base

### JS Principal Legacy

Archivo:

```text
ScrumV2/dist/app.js
```

Responsabilidad actual:

- Demasiadas secciones concentradas.
- Se mantiene por compatibilidad.
- Evitar seguir creciendo salvo ajustes puntuales.

Busqueda recomendada:

```bash
rg -n "function renderDaily|function renderTasks|function renderRelease|daily-|tasks-|release-" ScrumV2/dist/app.js
```

### Estilos Globales

Archivo:

```text
ScrumV2/dist/styles.css
```

Responsabilidad:

- Tema dark/light.
- AdminLTE overrides.
- Estilos de tablas.
- Estilos de Daily, Tareas, Compras, Releases y Gantt.

Regla:

Prefijar clases por modulo:

```text
daily-*
tasks-*
release-*
compras-*
reports-*
```

## Modulo Dashboard

Archivos probables:

```text
ScrumV2/dist/index.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
frontend/index.html
frontend/app.js
```

Responsabilidades:

- Calendario.
- Eventos por persona.
- KPIs.
- Compromisos visibles.
- Disponibilidad por sprint.

Busquedas utiles:

```bash
rg -n "calendar|evento|eventos|dashboard|commitment|compromiso" ScrumV2/dist/app.js
```

Riesgos conocidos:

- Eventos parciales deben contar `0.5`.
- Cambios en modal deben actualizar dashboard sin recargar.
- Selects de personas deben ordenarse A-Z.

## Modulo Daily

Archivos:

```text
ScrumV2/dist/daily.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
frontend/daily.html
frontend/app.js
```

Responsabilidades:

- Seguimiento Dev Team.
- Items cargados.
- Carga manual.
- Importacion CSV.
- Story Points por usuario.
- Grafico por tareas/puntos.
- Gantt de tareas.
- Estados de items.

Busquedas utiles:

```bash
rg -n "renderDaily|daily-items-table|daily-points-user|daily-gantt|sprint-items|story_points" ScrumV2/dist/app.js ScrumV2/dist/daily.html ScrumV2/dist/styles.css
```

Reglas funcionales:

- Sprint debe autoseleccionarse segun fecha.
- En cambio de sprint AM/PM se considera cierre/inicio.
- Issue Key debe transformarse a mayuscula.
- Despues de carga manual, foco vuelve a Issue Key y conserva prefijo.
- Si Issue Key ya existe, carga manual no debe pisar, debe avisar.
- Items cargados deben actualizar en tiempo real sin recargar pagina.
- Tabla de Items cargados ordena por Issue A-Z.
- Columna `#` es contador, no ID.
- Gantt debe mostrar:
  - Start + End.
  - Start + Due sin End con barra difuminada al final.
  - Feriados en rojo.
  - Meses, semanas y dias.
- Story Points por usuario:
  - Ultimos 6 sprints de acuerdo al sprint seleccionado.
  - Opcion de alternar entre Story Points y cantidad de tareas.
  - Tabla con mapa de calor.

## Modulo Tareas

Archivos:

```text
ScrumV2/dist/tasks.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
frontend/tasks.html
frontend/app.js
```

Responsabilidades:

- Backlog estilo Notion/AdminLTE.
- Kanban.
- Reportes de tareas.
- Subtareas jerarquicas.
- Comentarios.
- Segmentos.
- Filtros.
- KPIs por prioridad.

Busquedas utiles:

```bash
rg -n "tasks-|renderTasks|tasks-backlog-list|subtask|comentario|segmento|priority|fecha_vencimiento" ScrumV2/dist/app.js ScrumV2/dist/styles.css ScrumV2/dist/tasks.html
```

Reglas funcionales:

- Por defecto mostrar Backlog.
- Tabla con scroll horizontal.
- Columna Tarea tuvo problemas en tablet; mantener controlada.
- Subtareas siempre deben quedar debajo de su padre.
- Si un nieto coincide con filtro, se debe mostrar la jerarquia completa.
- Eliminar padre elimina todas las generaciones debajo.
- Contraer padre contrae hijos y nietos.
- Cambios inline no deben recargar pagina.
- Cambio de estado:
  - Backlog -> To Do: no cambia fechas.
  - In Progress: completa Start Date con hoy.
  - Done: completa End Date con hoy.
  - Backlog/To Do: limpia Start Date y End Date.
  - Backlog/To Do -> Done: completa Start Date y End Date con hoy.
- Filtros por estado deben ocultar filas que dejen de coincidir.

## Modulo Releases

Archivos:

```text
ScrumV2/dist/releases-table.html
ScrumV2/dist/releases-gantt.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
```

Responsabilidades:

- Tabla de releases.
- KPIs por quarter.
- Filtros por quarter, estado, tipo release, Comp/New.
- Gantt de releases.
- Comentarios por release.
- Editar/eliminar release.

Busquedas utiles:

```bash
rg -n "release-|releases-table|release-table|quarter|gantt|comp|tipo release|comentario" ScrumV2/dist/app.js ScrumV2/dist/styles.css ScrumV2/dist/releases-table.html
```

Reglas funcionales:

- Quarter por defecto segun fecha actual.
- Filtro `Sin quarter` solo muestra registros sin quarter.
- Si Q no tiene datos, tabla vacia, no mostrar todo.
- Tabla debe conservar filtros y orden al editar.
- Dias debe tener mapa de calor.
- Gantt integrado en Tabla de Releases.

## Modulo Compras

Archivos:

```text
ScrumV2/dist/compras.html
ScrumV2/dist/js/compras.js
ScrumV2/dist/styles.css
frontend/compras.html
frontend/js/compras.js
```

Responsabilidades:

- Nueva compra.
- Historicos.
- Reportes de compras.
- Productos.
- Supermercados.
- Validacion de ticket.
- Diferencias gondola vs ticket.

Busquedas utiles:

```bash
rg -n "compras|historicos|producto|supermercado|ticket|diferencia|validado" ScrumV2/dist/js/compras.js ScrumV2/dist/compras.html ScrumV2/dist/styles.css
```

Reglas funcionales:

- Datos deben persistir en DB, no solo localStorage.
- Al repetir producto, cargar ultimo precio por supermercado.
- Campo precio con separador de miles.
- Cantidad permite decimales.
- Historicos permite validar OK o Diferencia.
- Diferencia actualiza precio de referencia para siguiente compra.
- En detalle, productos ordenados alfabeticamente.
- Botones de acciones en iconos.

## Modulo Retrospectiva

Archivos:

```text
ScrumV2/dist/retrospective.html
ScrumV2/dist/retro-public.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
```

Responsabilidades:

- Sesion SM.
- Vista publica usuario.
- WebSocket/realtime.
- QR.
- Aportes.
- Compromisos.

Busquedas utiles:

```bash
rg -n "retro|retrospective|qr|aporte|compromiso|websocket|cerrar retro" ScrumV2/dist/app.js ScrumV2/dist/styles.css
```

Reglas funcionales:

- QR debe mostrarse bajo boton.
- Usuarios deben ver cierre de sesion en tiempo real.
- Compromisos deben visualizarse en Dashboard/notificaciones.
- Cards de acciones deben usar iconos.

## Modulo Poker Planning

Archivos:

```text
ScrumV2/dist/poker-planning.html
ScrumV2/dist/poker-public.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
```

Responsabilidades:

- Experiencia similar a Retrospectiva.
- Conexion/desconexion usuarios.
- Cierre de sesion realtime.

Busquedas utiles:

```bash
rg -n "poker|planning|vote|carta|websocket|cerrar sesion" ScrumV2/dist/app.js
```

## Modulo 1:1

Archivos:

```text
ScrumV2/dist/one-to-one.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
```

Responsabilidades:

- Formulario 1:1.
- Historial.
- Compromisos.
- Datos personales flexibles.

Busquedas utiles:

```bash
rg -n "one-to-one|1:1|compromiso|personaPersonal|personal|historial" ScrumV2/dist/app.js ScrumV2/dist/styles.css
```

Reglas funcionales:

- Feedback y habilidades no obligatorios.
- Compromisos independientes del formulario.
- Persona personal usa pares Tipo/Dato dinamicos.
- Modal de editar debe abrir correctamente.

## Modulo Carga De Datos

Archivos:

```text
ScrumV2/dist/data-entry.html
ScrumV2/dist/app.js
ScrumV2/dist/styles.css
```

Responsabilidades:

- Celulas.
- Personas.
- Sprints.
- Tipos de eventos.
- Quarter.
- Releases/importaciones.

Busquedas utiles:

```bash
rg -n "data-entry|persona|celula|sprint|quarter|tipo evento|cumple|quarterForm" ScrumV2/dist/app.js ScrumV2/dist/data-entry.html
```

Reglas funcionales:

- Personas: columna Cumple ordena por mes/dia aunque muestre DD/MM.
- Columna `#` es contador relativo.
- Sprints no permiten nombres duplicados.
- Rango de siguiente sprint debe respetar inicio/fin acordado.
- Filtros por celulas debajo de listado.

## Modulo Reportes

Estado:

Planificado. Documento base:

```text
Reportes_Celulas.md
```

Estructura propuesta:

```text
ScrumV2/dist/reports.html
ScrumV2/dist/js/reports/reports-main.js
ScrumV2/dist/js/reports/services/
ScrumV2/dist/js/reports/components/
ScrumV2/dist/js/reports/modules/
ScrumV2/dist/css/reports.css
```

Regla:

Reportes no debe crecer dentro de `app.js`.

Modulos propuestos:

```text
executive-summary
cells
users
sprints
quarters
releases
tasks-flow
data-quality
commitments
availability
```

Contrato sugerido:

```js
export const moduleDefinition = {
  id: "cells",
  title: "Celulas",
  mount(container, context) {},
  update(context) {},
  destroy() {},
};
```

## Patron Recomendado Para Nuevos Modulos

Cada modulo debe separar:

```text
api.js          llamadas a backend
state.js        estado local
calculations.js calculos puros
render.js       HTML/DOM
events.js       eventos
index.js        integracion del modulo
```

## Error Boundary De Modulo

Cada modulo debe renderizar error local:

```js
try {
  module.update(context);
} catch (error) {
  renderModuleError(container, error);
}
```

## Checklist Antes De Editar

1. Identificar seccion.
2. Buscar aqui archivos probables.
3. Usar `rg` con IDs concretos.
4. Leer solo 50-150 lineas alrededor.
5. Editar con `apply_patch`.
6. Validar JS si aplica.
7. Actualizar cache-buster si cambia JS/CSS.
8. No deploy salvo pedido explicito.
