# Evaluacion de Modularizacion y Arquitectura Hexagonal

## Objetivo

Evaluar el estado actual de SCRUM MASTER y definir una estrategia para separar modulos, reducir riesgo de regresiones y migrar progresivamente hacia una arquitectura hexagonal.

La prioridad no es reescribir todo el sistema. La prioridad es ordenar el crecimiento, aislar funcionalidades nuevas y migrar por partes sin romper Produccion.

## Diagnostico Actual

### Hallazgos principales

El proyecto funciona, pero la estructura actual concentra demasiada responsabilidad en pocos archivos.

Archivos con mayor concentracion:

```text
api/routes.py              5.866 lineas
ScrumV2/dist/app.js       18.801 lineas
frontend/app.js           18.141 lineas
data/models.py               654 lineas
main.py                      317 lineas
```

Esto genera los siguientes problemas:

- Cambios pequenos pueden afectar secciones no relacionadas.
- Es dificil validar si un cambio quedo aplicado en local, GitHub y PRD.
- El deploy es fragil porque PRD puede quedar con hotfixes directos.
- La logica de negocio esta mezclada con rutas HTTP, SQLAlchemy, DOM y renderizado.
- El frontend tiene mucho comportamiento dentro de un solo archivo global.
- La duplicidad entre `ScrumV2/dist` y `frontend` aumenta el riesgo de desalineacion.
- El testing existe, pero cubre solo una parte del comportamiento total.

### Estado por capa

#### Backend

Actualmente `api/routes.py` contiene:

- Autenticacion.
- Usuarios.
- Dashboard.
- Daily.
- Tareas.
- Releases.
- Compras.
- Retrospectiva.
- Poker Planning.
- 1:1.
- Carga de datos.
- WebSockets.
- Normalizadores.
- Reglas de negocio.
- Acceso directo a base de datos.

Problema:

```text
HTTP + reglas + persistencia + serializacion estan mezclados.
```

#### Frontend

Actualmente `ScrumV2/dist/app.js` contiene:

- Cliente API.
- Auth.
- Dashboard.
- Daily.
- Tareas.
- Releases.
- Retrospectiva.
- Poker.
- 1:1.
- Carga de datos.
- Tablas.
- Gantt.
- Graficos.
- Estado global.
- Helpers de fechas.
- Renderizado DOM.

Problema:

```text
UI + estado + llamadas API + reglas visuales + reglas de negocio estan mezcladas.
```

#### Base de datos

Actualmente `data/models.py` centraliza todos los modelos SQLAlchemy.

Problema:

```text
Los modelos de persistencia se usan como si fueran entidades de dominio.
```

Eso dificulta cambiar reglas sin arriesgar la persistencia.

## Que Es Arquitectura Hexagonal

La arquitectura hexagonal separa el sistema en tres zonas:

```text
Dominio
Aplicacion
Adaptadores
```

### Dominio

Contiene las reglas puras del negocio.

Ejemplos:

- Una tarea pasa a `In Progress`, entonces debe completar `start_date`.
- Una tarea pasa a `Done`, entonces debe completar `start_date` y `end_date`.
- Una subtarea nunca debe perder su padre.
- Un evento parcial AM/PM cuenta `0.5`.
- El sprint actual depende de fecha y horario AM/PM.
- Un item Daily con Issue Key duplicado no debe crearse.

El dominio no debe saber nada de:

- FastAPI.
- SQLAlchemy.
- PostgreSQL.
- HTML.
- Docker.
- Cookies.

### Aplicacion

Orquesta casos de uso.

Ejemplos:

- Crear tarea.
- Cambiar estado de tarea.
- Eliminar tarea con descendientes.
- Actualizar item Daily.
- Importar CSV Daily.
- Crear release.
- Calcular dashboard.
- Obtener reporte de Story Points.

La aplicacion usa puertos, no implementaciones concretas.

### Adaptadores

Conectan el sistema con el mundo externo.

Ejemplos:

- Rutas FastAPI.
- Repositorios SQLAlchemy.
- WebSockets.
- Archivos CSV.
- Frontend.
- Integracion futura con Jira.

## Estructura Backend Propuesta

Estructura objetivo:

```text
scrum_calendar/
  app/
    modules/
      tasks/
        domain/
          entities.py
          rules.py
          value_objects.py
        application/
          services.py
          use_cases.py
          ports.py
        infrastructure/
          sqlalchemy_repository.py
          mappers.py
        interface/
          routes.py
          schemas.py
      daily/
        domain/
        application/
        infrastructure/
        interface/
      releases/
        domain/
        application/
        infrastructure/
        interface/
      dashboard/
        domain/
        application/
        infrastructure/
        interface/
      compras/
        domain/
        application/
        infrastructure/
        interface/
      retrospective/
        domain/
        application/
        infrastructure/
        interface/
      poker/
        domain/
        application/
        infrastructure/
        interface/
      one_on_one/
        domain/
        application/
        infrastructure/
        interface/
      data_entry/
        domain/
        application/
        infrastructure/
        interface/
    shared/
      domain/
        dates.py
        errors.py
        pagination.py
      infrastructure/
        db.py
        transactions.py
      interface/
        auth.py
        dependencies.py
```

### Capa `domain`

Contiene objetos y reglas independientes.

Ejemplo para tareas:

```text
app/modules/tasks/domain/rules.py
```

Responsabilidades:

- Calcular transicion de estado.
- Mantener jerarquia padre/hijo/nieto.
- Calcular fechas automaticas.
- Calcular prioridad.
- Determinar si una tarea queda visible por filtro.

### Capa `application`

Contiene casos de uso.

Ejemplo:

```text
app/modules/tasks/application/use_cases.py
```

Casos:

- `CreateTaskUseCase`
- `UpdateTaskUseCase`
- `DeleteTaskCascadeUseCase`
- `ChangeTaskStatusUseCase`
- `ListTasksUseCase`
- `CreateTaskCommentUseCase`

### Capa `infrastructure`

Implementa persistencia.

Ejemplo:

```text
app/modules/tasks/infrastructure/sqlalchemy_repository.py
```

Responsabilidades:

- Consultar PostgreSQL.
- Convertir SQLAlchemy Model a entidad de dominio.
- Guardar cambios.
- Manejar relaciones.

### Capa `interface`

Expone HTTP.

Ejemplo:

```text
app/modules/tasks/interface/routes.py
```

Responsabilidades:

- Recibir request.
- Validar schema.
- Invocar caso de uso.
- Devolver response.

No debe contener reglas de negocio.

## Estructura Frontend Propuesta

Actualmente `app.js` debe dejar de crecer.

Estructura objetivo:

```text
ScrumV2/dist/js/
  shared/
    api-client.js
    auth.js
    dom.js
    dates.js
    tables.js
    charts.js
    modals.js
    state.js
  modules/
    dashboard/
      index.js
      calendar.js
      commitments.js
      availability.js
      dashboard.css
    daily/
      index.js
      daily-api.js
      daily-state.js
      items-table.js
      manual-form.js
      edit-modal.js
      comments.js
      story-points-chart.js
      gantt.js
      daily.css
    tasks/
      index.js
      tasks-api.js
      backlog-table.js
      kanban.js
      task-modal.js
      comments.js
      subtasks.js
      filters.js
      kpis.js
      tasks.css
    releases/
      index.js
      release-api.js
      release-table.js
      release-gantt.js
      release-modal.js
      comments.js
      kpis.js
      releases.css
    compras/
      index.js
      compras-api.js
      nueva-compra.js
      historicos.js
      reportes.js
      compras.css
    reports/
      reports-main.js
      services/
      components/
      modules/
```

Regla:

```text
Cada pagina debe tener un entrypoint pequeno.
Cada modulo debe poder fallar sin romper todo el sitio.
```

## Modulos Candidatos Para Separar

### 1. Tareas

Prioridad alta.

Motivo:

- Es el modulo con mayor complejidad funcional.
- Tiene jerarquias padre/hijo/nieto.
- Tiene filtros, ordenamiento, comentarios, subtareas, fechas automaticas, estados, prioridades y kanban.
- Ha tenido regresiones repetidas.

Separacion recomendada:

Backend:

```text
app/modules/tasks/
```

Frontend:

```text
ScrumV2/dist/js/modules/tasks/
```

Primeras reglas a extraer:

- Transiciones de estado.
- Cascada de fechas a padres.
- Eliminacion cascada de descendientes.
- Reglas de visibilidad por filtro.
- Ordenamiento padre/subtareas.

### 2. Daily

Prioridad alta.

Motivo:

- Tiene carga manual, CSV, tablas, graficos, Gantt y sincronizacion.
- El caso de editar item como modal esta incompleto.
- Comparte datos con tareas, releases, personas y sprints.

Separacion recomendada:

Backend:

```text
app/modules/daily/
```

Frontend:

```text
ScrumV2/dist/js/modules/daily/
```

Primeras reglas a extraer:

- Seleccion automatica de sprint.
- Issue Key uppercase.
- Validacion de duplicados.
- Calculo de story points por usuario.
- Gantt con start/end/due date.
- Comentarios de items.

### 3. Releases

Prioridad alta.

Motivo:

- Mezcla tabla, filtros, KPIs, Gantt y comentarios.
- La pagina se rompio al intentar mover funcionalidades de Gantt a tabla.

Separacion recomendada:

Backend:

```text
app/modules/releases/
```

Frontend:

```text
ScrumV2/dist/js/modules/releases/
```

Primeras reglas a extraer:

- Filtros por quarter.
- Filtros por estado.
- Calculo de dias.
- Heatmap de dias.
- Gantt integrado sin reemplazar tabla.

### 4. Dashboard

Prioridad media-alta.

Motivo:

- Tiene reglas de calendario, eventos parciales, compromisos y disponibilidad.

Primeras reglas a extraer:

- Calculo de eventos AM/PM.
- Disponibilidad por persona.
- Compromisos vencidos/proximos.
- Actualizacion sin recargar.

### 5. Compras

Prioridad media.

Motivo:

- Ya esta parcialmente separado en `js/compras.js`.
- Tiene dominio propio: productos, supermercados, compras, historial, validaciones de ticket.

Recomendacion:

- Mantenerlo fuera de `app.js`.
- Separar en submodulos internos.
- Agregar capa backend formal si seguira creciendo.

### 6. Retrospectiva y Poker

Prioridad media.

Motivo:

- Usan WebSockets y tiempo real.
- Requieren estabilidad de sesiones.

Recomendacion:

- Separar presencia, sesiones, respuestas y cierre.
- Mantener adaptadores WebSocket aislados.

### 7. Reportes

Prioridad nueva.

Motivo:

- Ya comenzo con estructura modular.
- Debe usarse como modelo para nuevas secciones.

Recomendacion:

- No agregarlo a `app.js`.
- Mantener `reports-main.js`, `services`, `components`, `modules`.

## Arquitectura Objetivo Por Flujo

Ejemplo: cambiar estado de tarea.

```text
Frontend
  -> tasks-api.updateTaskStatus()
    -> FastAPI route PUT /tasks/{id}
      -> ChangeTaskStatusUseCase
        -> TaskRules.applyStatusTransition()
        -> TaskRepository.save()
      -> Response DTO
  -> backlog-table.updateRow()
```

La regla de fechas no debe estar ni en el DOM ni en la ruta HTTP.

Debe estar aqui:

```text
app/modules/tasks/domain/rules.py
```

## Plan De Migracion Recomendado

### Fase 0: Congelar reglas de trabajo

Objetivo:

- Detener el crecimiento de `app.js` y `api/routes.py`.

Reglas:

- No agregar funcionalidades grandes nuevas en `app.js`.
- No agregar endpoints nuevos grandes directamente en `api/routes.py`.
- Todo modulo nuevo debe ir en estructura separada.
- Toda correccion importante debe tener prueba minima.

Resultado esperado:

- Menos regresiones.
- Menor consumo de tokens.
- Mejor trazabilidad.

### Fase 1: Crear estructura base hexagonal

Crear carpetas:

```text
app/modules/
app/shared/
```

Crear primer modulo piloto:

```text
app/modules/tasks/
```

No mover todo todavia.

Solo crear:

```text
domain/rules.py
application/use_cases.py
infrastructure/repository.py
interface/routes.py
```

Resultado esperado:

- Base de arquitectura lista.
- Sin impacto funcional.

### Fase 2: Migrar reglas puras de Tareas

Mover desde `api/routes.py`:

- Logica de transicion de estados.
- Logica de cascada de padres.
- Logica de eliminar descendientes.
- Logica de evitar ciclos padre/hijo.

Agregar tests:

```text
tests/tasks/test_task_status_rules.py
tests/tasks/test_task_hierarchy_rules.py
```

Resultado esperado:

- Las reglas mas delicadas quedan probadas y aisladas.

### Fase 3: Extraer frontend de Tareas

Crear:

```text
ScrumV2/dist/js/modules/tasks/
```

Mover primero:

- Cliente API.
- Estado de tabla.
- Render de backlog.
- Modal de tarea.
- Comentarios.
- Subtareas.

Resultado esperado:

- `app.js` deja de ser el lugar principal para cambios de Tareas.

### Fase 4: Migrar Daily

Backend:

```text
app/modules/daily/
```

Frontend:

```text
ScrumV2/dist/js/modules/daily/
```

Primer objetivo funcional:

- Editar item de Daily en modal usando carga manual.
- Comentarios dentro del modal.
- Sin recargar pagina.

Resultado esperado:

- Resolver el problema actual y dejar el modulo preparado.

### Fase 5: Migrar Releases

Objetivo:

- Recuperar estabilidad de Tabla de Releases.
- Integrar Gantt debajo de tabla sin reemplazar tabla.
- Aislar filtros, KPIs y comentarios.

Resultado esperado:

- Releases deja de romperse cuando se toca Gantt.

### Fase 6: Separar Dashboard

Objetivo:

- Aislar reglas de eventos parciales.
- Aislar compromisos y disponibilidad.

Resultado esperado:

- Menos riesgo al tocar calendario.

### Fase 7: Formalizar Reportes

Objetivo:

- Construir reportes como modulos independientes.
- Consumir servicios backend agregados.

Resultado esperado:

- Reportes robusto, extensible y sin afectar Daily/Tareas/Releases.

## Propuesta De Estructura Inicial Sin Riesgo

Primer commit recomendado:

```text
app/
  __init__.py
  modules/
    __init__.py
    tasks/
      __init__.py
      domain/
        __init__.py
        rules.py
      application/
        __init__.py
        use_cases.py
      infrastructure/
        __init__.py
        repository.py
      interface/
        __init__.py
        routes.py
  shared/
    __init__.py
    domain/
      __init__.py
      dates.py
      errors.py
```

Este primer commit no debe cambiar comportamiento. Solo prepara la arquitectura.

## Reglas Para Evitar Otro PRD Desalineado

### Regla 1: PRD debe ser copia limpia de GitHub

No hacer hotfix manual en PRD salvo emergencia.

Si se hace hotfix:

1. Documentarlo.
2. Replicarlo local.
3. Commit.
4. Push.
5. Deploy limpio.

### Regla 2: Deploy siempre con commit identificado

Antes de deploy:

```bash
git status --short
git log --oneline -1
```

En PRD:

```bash
git log --oneline -1
git status --short
```

Ambos deben coincidir.

### Regla 3: DB no se toca en deploy

Deploy de codigo no debe reemplazar base de datos.

Migraciones deben ser scripts versionados.

### Regla 4: Pruebas por modulo

Cada modulo debe tener checklist propio.

Ejemplo Daily:

- Carga manual crea item.
- Issue Key duplicado muestra error.
- Editar abre modal.
- Guardar actualiza fila sin recargar.
- Comentarios agregan/editan/eliminan.
- Gantt se actualiza.

## Riesgos De La Migracion

### Riesgo 1: Duplicidad `ScrumV2/dist` y `frontend`

Debe definirse una unica fuente runtime.

Recomendacion:

```text
ScrumV2/dist debe ser runtime principal.
frontend debe quedar como legado o espejo controlado.
```

### Riesgo 2: Migrar demasiado rapido

No conviene mover todo en una sola fase.

Recomendacion:

```text
Migrar modulo por modulo, empezando por reglas puras.
```

### Riesgo 3: Falta de migraciones DB

Hoy algunos cambios de modelo pueden romper PRD si no existe columna.

Recomendacion:

```text
Crear carpeta migrations/ con SQL versionado.
```

### Riesgo 4: Tests insuficientes

Hay tests, pero no cubren todos los flujos criticos.

Recomendacion:

```text
Cada regla extraida debe tener test antes de mover UI.
```

## Decision Recomendada

La mejor estrategia es:

1. No reescribir todo.
2. Crear arquitectura hexagonal base.
3. Migrar primero reglas de dominio puras.
4. Usar Tareas como modulo piloto.
5. Luego Daily.
6. Luego Releases.
7. Mantener Reportes como modulo nuevo separado desde el inicio.

## Primer Backlog Tecnico Recomendado

### Tarea 1: Crear estructura `app/modules`

Sin cambiar comportamiento.

### Tarea 2: Extraer reglas de estado de Tareas

Mover reglas a:

```text
app/modules/tasks/domain/rules.py
```

### Tarea 3: Agregar tests de reglas de Tareas

Cubrir:

- Backlog/To Do -> no fechas.
- In Progress -> start date.
- Done -> start/end date.
- Done -> In Progress limpia end date.
- Done/In Progress -> Backlog/To Do limpia start/end date.
- Backlog/To Do -> Done completa start/end date.

### Tarea 4: Extraer reglas de jerarquia de Tareas

Cubrir:

- Hijo no pierde padre al editar.
- Nieto no se convierte en padre.
- Eliminar padre elimina descendientes.
- Filtros muestran rama completa si un descendiente coincide.

### Tarea 5: Crear modulo frontend Daily

Primer caso:

- Editar item abre modal de Carga Manual.

### Tarea 6: Crear migraciones SQL versionadas

Carpeta:

```text
migrations/
```

### Tarea 7: Crear checklist de deploy tecnico

Debe validar:

- commit local = commit GitHub = commit PRD.
- contenedor reconstruido.
- endpoint health.
- pagina principal de modulo.

## Conclusiones

SCRUM MASTER ya tiene muchas funcionalidades, pero la arquitectura actual llego a un punto donde seguir agregando cambios dentro de archivos monoliticos aumenta el costo, consume mas tokens y genera regresiones.

La arquitectura hexagonal es viable para este proyecto si se aplica de forma progresiva.

El primer foco debe ser Tareas y Daily porque son los modulos con mayor cantidad de reglas y mayor cantidad de ajustes recientes.

La meta tecnica debe ser:

```text
Menos app.js.
Menos api/routes.py.
Mas modulos.
Mas reglas probadas.
Deploy limpio desde GitHub.
PRD sin hotfixes ocultos.
```

