# Roadmap y alcance inicial

## MVP acotado (incluido)
- Base operativa: celulas, personas, sprints, eventos, feriados.
- Daily operativo: import CSV/XLSX, carga manual, edicion, filtros, KPIs basicos.
- Dashboard operativo: calendario, capacidad, eventos por tipo/persona, salud del sprint.
- 1:1 operativo: registro de sesiones, acuerdos, estado, historico.
- Autenticacion simple: Admin (SM) + Miembro, control de acceso por seccion.

## Fuera del MVP (diferido)
- IA propia (NLP, prediccion, recomendaciones).
- Integraciones automaticas con Jira/Azure/Slack/Git (solo import manual).
- App movil.
- Microlearning y coaching avanzado.

## Roadmap sugerido
1) Fase actual: cierre operativo.
   - Estabilidad, filtros, calculos, importacion confiable, roles basicos.
2) Fase 2: metricas operativas.
   - KPI comparativos entre sprints, seguimiento de equipo mas robusto, exportacion.
3) Fase 3: integraciones.
   - Conector Jira/Azure (lectura), sincronizacion incremental.
4) Fase 4: IA V1 asistida.
   - Reglas heuristicas + clasificacion simple (sin entrenamiento pesado).
5) Fase 5: IA propia + mobile.
   - Modelos entrenados, recomendaciones personalizadas, app Flutter.

## Arquitectura evolutiva
- Backend modular (FastAPI): separar core, analytics, import, auth, oneonone.
- Base de datos: mantener tablas actuales + preparar raw_imports y events_analytics.
- Integraciones como servicios externos (modulos aislados).
- IA como microservicio independiente cuando se habilite.
