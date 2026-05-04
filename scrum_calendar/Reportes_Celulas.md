# Reportes Celulas

## Objetivo

Crear una nueva seccion de Reportes para SCRUM MASTER que permita analizar el desempeno operativo de celulas, usuarios, sprints, tareas, releases, quarters y calidad de datos. La seccion debe entregar informacion accionable para Scrum Master, lideres y equipo, evitando construir una pagina monolitica dificil de mantener.

El modulo de Reportes debe funcionar como una pagina principal que incrusta submodulos independientes. Cada submodulo debe tener su propia logica, render, estilos y manejo de errores. Si un reporte falla, no debe romper la pagina completa.

## Opinion tecnica sobre la estructura

La estructura modular es la decision correcta para este proyecto.

Actualmente el sistema concentra mucha logica en archivos grandes, especialmente en `app.js`. Eso hace que cada cambio tenga alto riesgo de romper otra seccion, como ya ocurrio varias veces con Daily, Tareas y Releases. Para Reportes no conviene repetir ese patron.

La nueva seccion debe ser construida con una arquitectura modular:

- Una pagina principal liviana.
- Un orquestador de reportes.
- Submodulos independientes por dominio.
- Servicios de datos reutilizables.
- Componentes visuales compartidos.
- Manejo de errores por modulo.
- Carga diferida de modulos cuando sean necesarios.

La meta es que cada nuevo reporte sea pequeno, reemplazable y testeable. Si un modulo de Quarter falla, no debe afectar los reportes de Celulas. Si un grafico falla, la tabla del mismo modulo debe poder seguir mostrando informacion.

## Principios de diseno

1. Modularidad

Cada reporte debe vivir en su propio archivo o carpeta. No se debe agregar toda la logica al archivo principal.

2. Bajo acoplamiento

Los modulos no deben depender directamente entre si. Deben recibir datos procesados o consultar servicios comunes.

3. Alta cohesion

Cada modulo debe tener una responsabilidad clara. Por ejemplo, el modulo de velocidad por celula solo debe encargarse de ese analisis.

4. Falla aislada

Si un modulo tiene error, debe mostrar un mensaje dentro de su propio card, sin afectar el resto de la pagina.

5. Datos reutilizables

Los datos base deben cargarse una vez y reutilizarse. No se debe llamar muchas veces al backend para la misma informacion.

6. Filtros globales

Los filtros principales deben aplicar a todos los modulos compatibles:

- Celula
- Sprint
- Quarter
- Ano
- Usuario
- Estado
- Prioridad
- Segmento
- Rango de fechas

7. Exportacion

Cada modulo importante debe permitir exportar su tabla o dataset procesado.

8. Rendimiento

Los reportes deben calcularse en memoria con datos ya cargados, evitando recargar la pagina completa.

9. Escalabilidad

Agregar un nuevo reporte no debe requerir modificar muchas partes del sistema.

10. UX ejecutiva

Primero deben verse KPIs y conclusiones. Luego graficos. Luego tablas de detalle.

## Estructura funcional propuesta

La seccion Reportes debe organizarse en modulos y submodulos.

### 1. Resumen Ejecutivo

Objetivo: dar una vision rapida del estado general.

KPIs sugeridos:

- Total de tareas.
- Tareas finalizadas.
- Story Points completados.
- Cumplimiento porcentual.
- Tareas vencidas.
- Tareas sin fecha.
- Tareas sin responsable.
- Releases activos.
- Releases finalizados.
- Compromisos vencidos.
- Promedio de lead time.
- Promedio de cycle time.

Graficos sugeridos:

- Evolucion de Story Points por sprint.
- Evolucion de cantidad de tareas por sprint.
- Distribucion de tareas por estado.
- Distribucion por prioridad.
- Comparativo sprint actual vs sprint anterior.

Tabla sugerida:

- Alertas operativas: vencidas, sin responsable, sin due date, sin story points, releases atrasados, compromisos vencidos.

### 2. Reportes por Celula

Objetivo: analizar el desempeno y salud operativa de cada celula.

KPIs:

- Story Points promedio por sprint.
- Tareas promedio por sprint.
- Velocidad por celula.
- Cumplimiento por celula.
- Tareas vencidas por celula.
- Releases por celula.
- Aging promedio de tareas abiertas.
- Lead time promedio.
- Cycle time promedio.

Graficos:

- Linea de velocidad por sprint.
- Barras comparativas entre celulas.
- Heatmap celula vs sprint.
- Donut por estado.
- Donut por prioridad.
- Evolucion de tareas vencidas.

Analisis:

- Celulas con mayor carga.
- Celulas con mayor cumplimiento.
- Celulas con mayor aging.
- Celulas con riesgo por tareas vencidas.
- Comparativo entre celulas por quarter.

### 3. Reportes por Usuario

Objetivo: dar visibilidad operativa por persona sin convertirlo en una herramienta de evaluacion individual punitiva.

KPIs:

- Story Points por usuario.
- Cantidad de tareas por usuario.
- Tareas finalizadas por usuario.
- Tareas vencidas por usuario.
- Tareas en progreso por usuario.
- Aging promedio por usuario.
- Cycle time promedio por usuario.

Graficos:

- Lineas por usuario en los ultimos 6, 12 o 24 sprints.
- Barras de Story Points por usuario.
- Barras de cantidad de tareas por usuario.
- Heatmap usuario vs sprint.
- Distribucion por estado por usuario.

Analisis:

- Usuarios con sobrecarga.
- Usuarios con tareas vencidas.
- Usuarios con muchas tareas en progreso.
- Usuarios sin asignaciones.
- Evolucion de carga por usuario.

### 4. Reportes por Sprint

Objetivo: analizar el comportamiento por sprint.

KPIs:

- Total de items del sprint.
- Story Points planificados.
- Story Points finalizados.
- Tareas finalizadas.
- Tareas no finalizadas.
- Tareas agregadas durante el sprint.
- Tareas vencidas.
- Cumplimiento del sprint.

Graficos:

- Burndown simple.
- Burnup simple.
- Distribucion por estado.
- Distribucion por usuario.
- Distribucion por prioridad.
- Evolucion de puntos por sprint.

Analisis:

- Sprint actual vs sprint anterior.
- Sprint actual vs promedio de ultimos 6 sprints.
- Desviacion entre planificado y ejecutado.
- Items sin story points.
- Items sin responsable.

### 5. Reportes de Quarter

Objetivo: analizar releases, tareas y cumplimiento por quarter.

KPIs:

- Releases comprometidos.
- Releases finalizados.
- Releases en progreso.
- Releases pendientes.
- Cumplimiento del quarter.
- Comprometido vs ejecutado.
- Tareas asociadas al quarter.
- Story Points asociados al quarter.

Graficos:

- Comparativo Q actual vs Q anterior.
- Comparativo Q actual vs mismo quarter del ano anterior.
- Barras por estado de release.
- Gantt resumido de releases.
- Evolucion mensual dentro del quarter.

Analisis:

- Releases sin quarter.
- Releases sin start date.
- Releases sin end date.
- Releases atrasados.
- Releases con aging alto.
- Releases por tipo.
- Releases por Comp/New.

### 6. Reportes de Releases

Objetivo: consolidar analisis de releases.

KPIs:

- Total de releases.
- Finalizados.
- En progreso.
- Pendientes.
- Releases sin fechas.
- Duracion promedio.
- Aging de releases abiertos.
- Cumplimiento por tipo.

Graficos:

- Gantt de releases.
- Distribucion por estado.
- Distribucion por quarter.
- Distribucion por tipo release.
- Heatmap de dias por release.

Analisis:

- Releases con mayor demora.
- Releases sin datos criticos.
- Releases sin quarter.
- Releases con due date vencido.
- Comparativo por celula.

### 7. Reportes de Tareas y Flujo

Objetivo: analizar flujo de trabajo desde backlog hasta done.

KPIs:

- Total de tareas.
- Tareas por estado.
- Tareas por prioridad.
- Tareas vencidas.
- Tareas sin fecha.
- Tareas sin responsable.
- Tareas archivadas.
- Tareas finalizadas.
- Lead time promedio.
- Cycle time promedio.

Graficos:

- Flujo acumulado por estado.
- Distribucion por prioridad.
- Aging por estado.
- Tareas vencidas por semana.
- Tareas finalizadas por sprint.

Analisis:

- Cuellos de botella.
- Tareas con demasiado tiempo en In Progress.
- Tareas vencidas no finalizadas.
- Tareas urgentes abiertas.
- Tareas sin segmentacion.
- Tareas sin subtareas pero con alto esfuerzo.

### 8. Reportes de Calidad de Datos

Objetivo: detectar datos incompletos o inconsistentes que afectan reportes.

KPIs:

- Items sin Story Points.
- Items sin Sprint.
- Items sin Responsable.
- Tareas sin Due Date.
- Tareas sin Start Date estando In Progress.
- Tareas Done sin End Date.
- Releases sin Quarter.
- Releases sin fecha de inicio.
- Releases sin fecha fin.
- Personas sin celula.

Tablas:

- Lista de registros incompletos.
- Registros duplicados por Issue Key.
- Releases sin datos criticos.
- Tareas con fechas inconsistentes.

Analisis:

- Porcentaje de calidad de datos por celula.
- Top errores de datos.
- Evolucion de calidad de datos por sprint.

### 9. Reportes de Compromisos

Objetivo: dar seguimiento a compromisos de retrospectiva y 1:1.

KPIs:

- Compromisos abiertos.
- Compromisos vencidos.
- Compromisos cumplidos.
- Compromisos por celula.
- Compromisos por responsable.

Graficos:

- Distribucion por estado.
- Compromisos vencidos por celula.
- Aging de compromisos abiertos.

Analisis:

- Compromisos sin responsable.
- Compromisos sin fecha.
- Compromisos vencidos criticos.

### 10. Reportes de Disponibilidad

Objetivo: cruzar eventos del calendario con capacidad real.

KPIs:

- Dias de ausencia por persona.
- Dias de ausencia por celula.
- Capacidad ajustada por sprint.
- Capacidad real vs Story Points completados.

Graficos:

- Calendario de disponibilidad.
- Ausencias por sprint.
- Ausencias por celula.
- Comparativo capacidad vs ejecucion.

Analisis:

- Impacto de vacaciones, permisos y flex.
- Sprints con menor capacidad.
- Personas con indisponibilidad parcial.

## Arquitectura tecnica propuesta

### Pagina principal

Archivo sugerido:

- `ScrumV2/dist/reports.html`

Responsabilidad:

- Layout general.
- Menu de reportes.
- Filtros globales.
- Contenedores de modulos.
- Carga de scripts modulares.
- Manejo global de estado.

La pagina principal no debe contener logica pesada de calculos.

### Orquestador

Archivo sugerido:

- `ScrumV2/dist/js/reports/reports-main.js`

Responsabilidad:

- Inicializar Reportes.
- Cargar datos base.
- Mantener filtros globales.
- Notificar a modulos cuando cambian filtros.
- Montar y desmontar modulos.
- Manejar errores por modulo.

### Servicios de datos

Archivos sugeridos:

- `ScrumV2/dist/js/reports/services/reports-api.js`
- `ScrumV2/dist/js/reports/services/reports-store.js`
- `ScrumV2/dist/js/reports/services/reports-filters.js`
- `ScrumV2/dist/js/reports/services/reports-calculations.js`

Responsabilidades:

- `reports-api.js`: comunicacion con API.
- `reports-store.js`: cache local en memoria.
- `reports-filters.js`: aplicar filtros globales.
- `reports-calculations.js`: funciones reutilizables para KPIs.

### Componentes compartidos

Archivos sugeridos:

- `ScrumV2/dist/js/reports/components/kpi-card.js`
- `ScrumV2/dist/js/reports/components/chart-line.js`
- `ScrumV2/dist/js/reports/components/chart-bar.js`
- `ScrumV2/dist/js/reports/components/chart-donut.js`
- `ScrumV2/dist/js/reports/components/heatmap-table.js`
- `ScrumV2/dist/js/reports/components/data-table.js`
- `ScrumV2/dist/js/reports/components/error-card.js`
- `ScrumV2/dist/js/reports/components/empty-state.js`

Objetivo:

Evitar duplicar codigo visual y mantener consistencia con AdminLTE.

### Modulos

Carpetas sugeridas:

- `ScrumV2/dist/js/reports/modules/executive-summary/`
- `ScrumV2/dist/js/reports/modules/cells/`
- `ScrumV2/dist/js/reports/modules/users/`
- `ScrumV2/dist/js/reports/modules/sprints/`
- `ScrumV2/dist/js/reports/modules/quarters/`
- `ScrumV2/dist/js/reports/modules/releases/`
- `ScrumV2/dist/js/reports/modules/tasks-flow/`
- `ScrumV2/dist/js/reports/modules/data-quality/`
- `ScrumV2/dist/js/reports/modules/commitments/`
- `ScrumV2/dist/js/reports/modules/availability/`

Cada modulo debe tener como minimo:

- `index.js`
- `template.js`
- `calculations.js`
- `styles.css` si aplica
- `README.md` opcional

Ejemplo:

```text
ScrumV2/dist/js/reports/modules/cells/
  index.js
  template.js
  calculations.js
  cells.types.js
```

### Contrato de modulo

Cada modulo debe implementar una interfaz simple:

```js
export const moduleDefinition = {
  id: "cells",
  title: "Celulas",
  mount(container, context) {},
  update(context) {},
  destroy() {},
};
```

Donde `context` incluye:

- `baseData`
- `filters`
- `services`
- `components`
- `state`

### Manejo de errores

Cada modulo debe ejecutarse dentro de un wrapper seguro:

```js
try {
  module.update(context);
} catch (error) {
  renderModuleError(container, error);
}
```

Con esto, si falla `Reportes de Quarter`, el resto de la pagina sigue funcionando.

### Carga diferida

No todos los modulos deben cargarse al mismo tiempo.

Estrategia:

- Cargar primero `Resumen Ejecutivo`.
- Cargar modulos visibles.
- Cargar modulos secundarios al seleccionar una pestana.
- Evitar cargar graficos pesados si no estan visibles.

### Estado

Estado global minimo:

```js
const reportState = {
  filters: {
    celulaId: "",
    sprintId: "",
    quarter: "",
    year: "",
    userId: "",
    status: [],
    priority: [],
    dateRange: null,
  },
  activeModule: "executive-summary",
  baseData: null,
};
```

### Estilos

Archivo sugerido:

- `ScrumV2/dist/css/reports.css`

Regla:

Los estilos globales deben ser pocos. Cada modulo debe tener clases prefijadas.

Ejemplo:

- `.reports-page`
- `.reports-filter-bar`
- `.reports-module-card`
- `.reports-cells-*`
- `.reports-quarter-*`

## Modulos iniciales para MVP

### MVP 1: Resumen Ejecutivo

Debe incluir:

- KPIs generales.
- Grafico de Story Points por sprint.
- Grafico de tareas por sprint.
- Tabla de alertas criticas.

### MVP 2: Celulas

Debe incluir:

- Promedio de Story Points por celula.
- Promedio de tareas por celula.
- Cumplimiento por celula.
- Tareas vencidas por celula.
- Heatmap celula vs sprint.

### MVP 3: Usuarios

Debe incluir:

- Story Points por usuario.
- Cantidad de tareas por usuario.
- Tareas vencidas por usuario.
- Tendencia por sprint.

### MVP 4: Quarter y Releases

Debe incluir:

- Releases por quarter.
- Cumplimiento por quarter.
- Comprometido vs ejecutado.
- Gantt resumido.

### MVP 5: Calidad de Datos

Debe incluir:

- Items sin Story Points.
- Tareas sin fecha.
- Releases sin quarter.
- Registros duplicados.
- Datos inconsistentes.

## Fases de implementacion

### Fase 0: Diseno tecnico

Objetivo:

Definir estructura final antes de programar.

Entregables:

- Documento de arquitectura.
- Estructura de carpetas.
- Contrato de modulos.
- Definicion de filtros globales.
- Definicion de datos base.

Criterio de cierre:

- La pagina de Reportes puede cargar un modulo dummy sin afectar el sistema.

### Fase 1: Base modular

Objetivo:

Crear la pagina principal y el esqueleto modular.

Entregables:

- `reports.html`
- `reports-main.js`
- `reports.css`
- Menu lateral con Reportes.
- Filtros globales.
- Contenedor de modulos.
- Manejo de error por modulo.

Criterio de cierre:

- Se puede entrar a Reportes.
- Se puede cambiar de modulo.
- Un error en un modulo no rompe la pagina.

### Fase 2: Servicios y datos

Objetivo:

Centralizar la carga de datos.

Entregables:

- Servicio API.
- Store en memoria.
- Filtros globales.
- Funciones de calculo base.
- Normalizacion de datos.

Criterio de cierre:

- Los modulos pueden consultar datos filtrados sin llamar directamente al backend.

### Fase 3: Resumen Ejecutivo

Objetivo:

Construir la primera vista de valor.

Entregables:

- KPIs generales.
- Grafico de Story Points por sprint.
- Grafico de tareas por sprint.
- Distribucion por estado.
- Tabla de alertas.

Criterio de cierre:

- El usuario puede entender rapidamente el estado general del proyecto.

### Fase 4: Reportes de Celulas

Objetivo:

Analizar rendimiento y carga por celula.

Entregables:

- KPIs por celula.
- Velocidad por celula.
- Promedio de esfuerzo por celula.
- Tareas vencidas por celula.
- Heatmap celula vs sprint.
- Tabla exportable.

Criterio de cierre:

- Se puede comparar celulas de forma clara.

### Fase 5: Reportes de Usuarios

Objetivo:

Analizar carga y evolucion por usuario.

Entregables:

- Story Points por usuario.
- Cantidad de tareas por usuario.
- Tareas vencidas.
- Tendencia por sprint.
- Heatmap usuario vs sprint.

Criterio de cierre:

- Se puede identificar carga, tendencia y riesgos por usuario.

### Fase 6: Reportes de Sprint

Objetivo:

Medir desempeno por sprint.

Entregables:

- Cumplimiento del sprint.
- Story Points planificados vs cerrados.
- Tareas finalizadas vs abiertas.
- Distribucion por estado.
- Alertas del sprint.

Criterio de cierre:

- Se puede comparar sprint actual con anteriores.

### Fase 7: Reportes de Quarter y Releases

Objetivo:

Analizar cumplimiento trimestral y releases.

Entregables:

- Releases por quarter.
- Cumplimiento por quarter.
- Releases atrasados.
- Gantt resumido.
- Comparativo Q actual vs Q anterior.

Criterio de cierre:

- Se puede entender el avance del quarter y sus riesgos.

### Fase 8: Calidad de Datos

Objetivo:

Detectar problemas que afectan los reportes.

Entregables:

- Tabla de datos incompletos.
- Duplicados.
- Fechas inconsistentes.
- Releases sin quarter.
- Tareas sin responsable.

Criterio de cierre:

- El sistema muestra una lista clara de datos que deben corregirse.

### Fase 9: Exportacion

Objetivo:

Permitir descargar informacion.

Entregables:

- Exportar CSV por modulo.
- Exportar resumen ejecutivo.
- Preparar base para PDF futuro.

Criterio de cierre:

- Cada modulo critico puede exportar su tabla.

### Fase 10: Optimizacion y pruebas

Objetivo:

Asegurar rendimiento, estabilidad y mantenibilidad.

Entregables:

- Pruebas unitarias de calculos.
- Pruebas de carga basicas.
- Validacion en desktop, tablet y mobile.
- Manejo de modulos con error.
- Revision de performance.

Criterio de cierre:

- La pagina de Reportes funciona sin afectar Daily, Tareas, Releases ni Dashboard.

## Riesgos y controles

### Riesgo 1: volver a crear un archivo gigante

Control:

No se debe agregar logica de reportes a `app.js` salvo integracion minima. Todo debe vivir en carpetas de reportes.

### Riesgo 2: calculos duplicados

Control:

Crear funciones compartidas en `reports-calculations.js`.

### Riesgo 3: reportes lentos

Control:

Cachear datos base, usar filtros en memoria y cargar modulos bajo demanda.

### Riesgo 4: un modulo rompe toda la pagina

Control:

Cada modulo debe tener error boundary propio.

### Riesgo 5: datos incompletos generan conclusiones malas

Control:

Agregar modulo de Calidad de Datos desde el MVP.

## Reglas de desarrollo

1. No escribir toda la funcionalidad en un solo archivo.
2. No mezclar calculos con render HTML.
3. No llamar al backend desde cada componente visual.
4. No romper modulos existentes.
5. Todo modulo debe tener estado vacio.
6. Todo modulo debe manejar errores.
7. Todo modulo debe aceptar filtros globales.
8. Todo reporte debe tener tabla base exportable si aplica.
9. Los nombres de clases deben estar prefijados por modulo.
10. Antes de PRD, todo debe pasar por local y GitHub.

## Prioridad recomendada

Orden recomendado para construir:

1. Base modular de Reportes.
2. Resumen Ejecutivo.
3. Reportes por Celula.
4. Reportes por Usuario.
5. Reportes de Quarter y Releases.
6. Calidad de Datos.
7. Sprint y Flujo.
8. Compromisos y Disponibilidad.
9. Exportaciones avanzadas.
10. Forecast y analisis predictivo.

## Resultado esperado

Al finalizar esta seccion, SCRUM MASTER debe contar con una central de analisis donde se pueda responder rapidamente:

- Como esta cada celula.
- Como evoluciona la velocidad.
- Donde hay sobrecarga.
- Que tareas estan en riesgo.
- Que releases estan atrasados.
- Que quarter esta comprometido.
- Que datos estan incompletos.
- Que compromisos estan vencidos.
- Como esta la disponibilidad real del equipo.

La seccion debe ser sostenible tecnicamente, facil de ampliar y segura ante fallas parciales.
