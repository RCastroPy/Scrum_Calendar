# Optimizacion local de ScrumIA

Fecha: 2026-10-10. Base: ce5f3b37. Rama: codex/local-performance.
Alcance: solo local; sin push, despliegue ni cambios de configuracion en PRD.

## Causas corregidas

- El Dashboard cargaba catalogos de Daily, Releases y usuarios que no utiliza.
- La capacidad de cada sprint se solicitaba secuencialmente y el sprint seleccionado se consultaba otra vez.
- La serializacion de personas consultaba las celulas una vez por persona.
- El middleware asincrono consultaba sesiones con SQL sin liberar el event loop.
- Las fechas seleccionadas se guardaban con una solicitud y transaccion por tarea.
- El reinicio diario hacia una lectura adicional por tarea despues del commit.

## Cambios

- Dashboard: siete catalogos en paralelo y capacidades por lote, reutilizando el resultado del sprint seleccionado. Lotes de hasta 200 sprints.
- Otras pantallas: los dos catalogos de Releases arrancan en paralelo con el resto, conservando el fallback existente.
- Personas: precarga de celulas mediante selectinload.
- Autenticacion: consulta de sesion en threadpool, sin cachear permisos ni omitir validaciones.
- Fechas seleccionadas: un POST a /tasks/bulk-due-date; valida existencia y permisos de todo el lote antes de modificarlo, una transaccion, una actualizacion de UI. Solo limpia selecciones si termina correctamente.
- Reinicio diario: serializa resultados antes del commit para evitar refrescos por fila.
- No cambian las reglas de estados, inicio, jerarquias ni calculo de capacidad. No se requieren migraciones.

## Verificacion

Comparacion de codigo anterior y nuevo, con sesiones SQL independientes de solo lectura sobre la misma base PostgreSQL local:

| Operacion | Antes | Despues | Resultado |
| --- | --- | --- | --- |
| Capacidad de 86 sprints | 344 SELECT, 0.421 s | 4 SELECT, 0.082 s | Respuestas identicas |
| Lista de 30 personas | 31 SELECT, 0.084 s | 2 SELECT, 0.009 s | Respuestas identicas |

Los tiempos son muestras locales, no estimaciones de PRD. Los recuentos de SQL no incluyen autenticacion HTTP.

- Backend: 74 passed, una advertencia de deprecacion de Starlette/AnyIO. Se excluyo test_poker_playwright.py, prueba opcional de Poker no relacionada.
- Frontend: 5 pruebas Node para carga concurrente, catalogos del Dashboard, reutilizacion de capacidades y guardado por lote con exito/error.
- Sintaxis JavaScript y sincronizacion frontend/app.js con ScrumV2/dist/app.js correctas.
- Smoke en Chromium, con sesion temporal local eliminada al terminar: Tareas y Dashboard cargan, sin errores JavaScript ni respuestas API fallidas.
- Dashboard: 38 solicitudes propias antes frente a 9 despues, con 23 sprints futuros. Dos respuestas pendientes de Tareas durante la navegacion se excluyen de este recuento.
- Muestras de carga visible en navegador: Tareas 2.693 s antes / 1.246 s despues; Dashboard 1.983 s antes / 1.650 s despues. Una muestra por pantalla, sin simulacion de latencia: no son un benchmark estadistico ni una garantia de tiempos en PRD.
- Se observo un 404 de imagen AdminLTELogo.png en la vista local; no impidio cargar datos y queda fuera de estos cambios de rendimiento.

## Validacion del usuario

- Dashboard: http://localhost:8013/ui/index.html
- Tareas: http://localhost:8013/ui/tasks.html
- Contenedor: scrumia-performance-preview, conectado exclusivamente a scrumia-local-db-1.
- Se conservan los servicios anteriores de los puertos 8011 y 8012. Usar 8013 para probar estos cambios.

Antes de PRD, validar interacciones con datos locales. El backend nuevo debe desplegarse antes del frontend porque este utiliza los nuevos endpoints por lote. Los endpoints individuales siguen disponibles para el frontend anterior.

La latencia de red, las regiones de alojamiento y los arranques en frio no se midieron de nuevo en PRD durante este trabajo. Estas optimizaciones reducen trabajo de la aplicacion; no eliminan esperas propias de la infraestructura.
