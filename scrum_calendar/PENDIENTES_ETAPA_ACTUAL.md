# Pendientes etapa actual

Ver: [ROADMAP_MVP.md](ROADMAP_MVP.md)

## Funcionalidades agregadas recientemente

- Poker Planning (admin + dev team) con QR/link, presencia en tiempo real y resultados con efecto de giro.
- Retrospectiva con control de dinamica, lista de conectados, aportes por sprint y tabla de compromisos.
- Daily reconstruido con selector de sprint, cards clave, tabla de items y carga manual.
- Mejoras UX: filtros y estados en tablas, indicadores visuales y layouts refinados.

## Checklist de pendientes

- [ ] Estabilidad API/UI sin rebuild (API responde `http://localhost:8000/` sin caídas).
- [ ] Login + roles (Admin/Miembro con acceso correcto y redirección a login).
- [ ] Personas inactivas ocultas en selects/tablas (excepto cumpleaños según rol).
- [ ] Importación CSV/XLSX: actualizar solo campos cambiados, sin duplicar issue key.
- [ ] Importación: sprint activo correcto + resumen con sprint cargado.
- [ ] Importación: botón “limpiar datos” funcional.
- [ ] Daily: filtros por sprint/persona correctos (no alteran otros totales).
- [ ] Daily: manual + importado conviven sin reemplazar datos manuales.
- [ ] Daily: edición inline + fechas sin placeholder.
- [ ] Daily: cálculos Días Totales y Días Comp con colores.
- [ ] Daily: filtro de estados multi‑select con checkboxes.
- [ ] Seguimiento Dev Team: heatmap + flechas sprint -1/-2 + totales/promedios (solo Dev Team).
- [ ] Dashboard: cards sin overflow (texto y % dentro del card).
- [ ] Calendarios: excluir fines de semana/feriados donde aplique + modal de eventos.
- [ ] Data-entry: sin errores JS, menú scroll OK, orden A‑Z/Z‑A y buscadores por columna.
- [ ] Retrospectiva: Aportes del sprint muestra textos cargados.
- [ ] Retrospectiva: Compromisos visibles siempre (con filtros) y edición OK.
- [ ] Retrospectiva: Cierre global de retros abiertas funciona y refresca estado.

| ID | Pendiente | Alcance/Notas |
| --- | --- | --- |
| 1 | Estabilidad API/UI sin rebuild | API debe responder `http://localhost:8000/` sin caídas; UI carga estable. |
| 2 | Login + roles | Admin y miembro con acceso correcto; redirección a login si no autenticado. |
| 3 | Personas inactivas | Ocultas en selects/tablas de Daily/Dashboard/1:1; cumpleaños visibles según rol. |
| 4 | Importación CSV/XLSX | Actualizar solo campos cambiados; sin duplicar issue key. |
| 5 | Importación: sprint activo | Sprint mostrado debe ser el último del CSV; resumen indica sprint cargado. |
| 6 | Importación: limpieza datos | Botón “limpiar datos” funcional. |
| 7 | Daily: filtros por sprint/persona | Sprint principal filtra Items; selección de persona filtra Items sin afectar otros totales. |
| 8 | Daily: convivencia importados + manuales | Manual no borra importados; actualiza solo cambios. |
| 9 | Daily: edición + fechas | Items con editar/eliminar; fechas sin placeholder y editables. |
| 10 | Daily: cálculos | Días Totales y Días Comp con colores (rojo/amarillo/verde). |
| 11 | Daily: filtro de estados | Multi‑select con checkboxes, respeta selección al filtrar por persona. |
| 12 | Seguimiento Dev Team | Heatmap por columna + flechas sprint -1 y -2; totales + promedios solo Dev Team; capacidad individual correcta (sin PO/SM). |
| 13 | Dashboard: layout | Cards sin overflow; textos/porcentajes dentro del card. |
| 14 | Calendarios (Dashboard y 1:1) | No contar fines de semana/feriados en eventos donde aplique; click en día muestra modal con eventos. |
| 15 | Data-entry (Carga de datos) | Selects sin errores JS; menú scroll OK; tablas con header oscuro, orden A‑Z/Z‑A y buscador por columna. |
| 16 | Retrospectiva: aportes visibles | Mostrar textos cargados por usuarios en “Aportes del sprint”. |
| 17 | Retrospectiva: compromisos visibles | Mostrar compromisos siempre (filtro pendiente/cerrado/todos). |
| 18 | Retrospectiva: cierre global | Botón cierra todas las retros abiertas y refresca estado. |
