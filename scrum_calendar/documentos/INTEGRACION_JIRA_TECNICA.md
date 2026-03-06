# Integracion Tecnica Jira Cloud -> ScrumIA

## 1. Objetivo
Integrar Jira Cloud de Atlassian con ScrumIA para consumir datos nativos (issues, estados, fechas, sprints, story points, assignee, reporter, etc.) y nutrir las vistas actuales de Daily/Releases sin depender de apps pagas de Marketplace.

## 2. Alcance Funcional
- Sin costo adicional de herramienta externa (solo Jira + ScrumIA).
- Sincronizacion inicial (backfill) y sincronizacion incremental.
- Soporte para:
  - Releases (`release_items` / `release_import_items`)
  - Tareas de Sprint (`release_items` / `release_import_items` con `release_tipo="tarea"`)
- Opcional fase 2: webhooks para casi tiempo real.

## 3. Estado Actual del Sistema (base existente)
- Ya existen tablas aptas para integrar:
  - `celulas.jira_codigo`
  - `personas.jira_usuario`
  - `release_items` y `release_import_items` (incluyen `start_date`, `end_date`, `due_date`, `status`, `story_points`, `raw_data`)
- Ya existe pipeline de importacion por archivo en:
  - `POST /imports/sprint-items`
  - `POST /imports/release-items`
- Propuesta: reutilizar la misma logica de normalizacion/upsert para evitar regresiones de UI.

## 4. Arquitectura Propuesta

### 4.1 Componentes
- `JiraClient` (httpx): wrapper REST Jira Cloud.
- `JiraFieldResolver`: descubre IDs de campos custom por proyecto/board.
- `JiraMapper`: transforma JSON Jira -> modelo interno ScrumIA.
- `JiraSyncService`: orquesta fetch paginado + upsert + metricas de sync.
- `JiraWebhookHandler` (fase 2): procesa eventos de issue/sprint.

### 4.2 Estrategia de sincronizacion
- Pull programado (MVP):
  - Cron cada 10-15 min para incremental.
  - Backfill manual bajo demanda.
- Push por webhook (fase 2):
  - Jira/Automation notifica cambios.
  - ScrumIA actualiza solo issue afectado.

## 5. Modelo de Datos (nuevas tablas recomendadas)

### 5.1 `jira_integrations`
Configuracion por tenant (o por celula si se requiere granularidad).
- `id`
- `base_url` (ej: `https://tu-dominio.atlassian.net`)
- `email` (usuario tecnico)
- `api_token_encrypted` (o solo por ENV para MVP)
- `enabled`
- `created_at`, `updated_at`

### 5.2 `jira_field_mappings`
Mapeo de fields Jira para evitar hardcode de `customfield_XXXXX`.
- `id`
- `celula_id` nullable (global o por celula)
- `story_points_field_id`
- `start_date_field_id`
- `end_date_field_id`
- `sprint_field_id`
- `due_date_field_id` (normalmente `duedate`)
- `last_discovered_at`

### 5.3 `jira_sync_runs`
Auditoria operativa de cada sincronizacion.
- `id`
- `scope` (`release`, `sprint`, `full`)
- `celula_id` nullable
- `started_at`, `finished_at`
- `status` (`running`, `ok`, `error`, `partial`)
- `fetched_count`, `created_count`, `updated_count`, `skipped_count`, `error_count`
- `error_detail`
- `cursor_snapshot` (json/text)

### 5.4 `jira_issue_snapshots` (opcional recomendado)
Ultimo hash por issue para idempotencia y diff rapido.
- `issue_key` unique
- `celula_id`
- `payload_hash`
- `updated_at`

## 6. Configuracion (ENV)
Agregar en `config/settings.py`:
- `jira_enabled: bool = False`
- `jira_base_url: str = ""`
- `jira_email: str = ""`
- `jira_api_token: str = ""`
- `jira_verify_tls: bool = True`
- `jira_timeout_seconds: int = 30`
- `jira_page_size: int = 100`
- `jira_webhook_secret: str = ""` (fase 2)

## 7. Endpoints Nuevos (backend)

### 7.1 Administracion
- `GET /jira/config` (admin): estado de configuracion (sin exponer token).
- `PUT /jira/config` (admin): actualizar config.
- `POST /jira/discover-fields` (admin): resolver campos custom y guardar mapping.
- `GET /jira/field-mappings` (admin)
- `PUT /jira/field-mappings` (admin)

### 7.2 Sincronizacion
- `POST /jira/sync/releases` (admin)
  - Params: `celula_id?`, `quarter?`, `full=false`
- `POST /jira/sync/sprint-items` (admin)
  - Params: `celula_id?`, `sprint_id?`, `full=false`
- `POST /jira/sync/full` (admin)
- `GET /jira/sync/runs` (admin): historico de corridas.

### 7.3 Webhook (fase 2)
- `POST /jira/webhook/{secret}`
  - Procesa eventos y hace upsert puntual.

## 8. Mapeo Jira -> ScrumIA

## 8.1 Campos comunes de issue
- `issue.key` -> `issue_key`
- `issue.id` -> `issue_id`
- `fields.summary` -> `summary`
- `fields.issuetype.name` -> `issue_type`
- `fields.status.name` -> `status`
- `fields.assignee.displayName` -> `assignee_nombre`
- `fields.assignee.accountId` -> `assignee_id`
- `fields.reporter.displayName` -> `reporter`
- `fields.reporter.accountId` -> `reporter_id`
- `fields[story_points_field_id]` -> `story_points`
- `fields[due_date_field_id]` (o `fields.duedate`) -> `due_date`
- `fields[start_date_field_id]` -> `start_date` (si existe)
- `fields[end_date_field_id]` -> `end_date` (si existe)
- `raw_data` -> payload reducido/normalizado para trazabilidad

## 8.2 Sprint y Quarter
- Sprint:
  - Preferir `fields[sprint_field_id]` (Agile custom field).
  - Si no existe, resolver por board/sprint endpoint (`/rest/agile/1.0`).
- Quarter:
  - Prioridad 1: campo quarter en Jira si existe.
  - Prioridad 2: derivar de `due_date`.
  - Prioridad 3: derivar de `sprint.endDate`.

## 8.3 Resolucion de persona/celula
- Celula:
  - `issue_key` prefijo vs `celulas.jira_codigo` (logica ya usada hoy).
- Persona:
  - `assignee.accountId` o `displayName` vs `personas.jira_usuario` y nombre completo normalizado.

## 8.4 Fechas faltantes (reglas de inferencia)
Cuando Jira no trae start/end directos:
- `start_date` inferida desde primer cambio a estado tipo `In Progress` en changelog.
- `end_date` inferida desde `resolutiondate` o primer cambio a estado `Done`.
- Estas inferencias deben marcarse en `raw_data.meta` para auditoria.

## 9. Motor de Upsert (sin romper UX actual)
- Reusar la semantica actual de import:
  - Si no existe `issue_key + celula_id`: crear.
  - Si existe: actualizar solo campos cambiados.
- Mantener `release_import_items` como staging/auditoria.
- Mantener `release_items` como fuente UI.
- Importante: idempotencia por `issue_key + celula_id` + hash del payload.

## 10. Seguridad
- Token Jira nunca en frontend.
- Credenciales via `.env` o tabla cifrada (preferido).
- Endpoint webhook protegido por secreto de alta entropia en path y/o header.
- Rate limiting para endpoints `/jira/*`.
- Logging de seguridad sin exponer secretos.

## 11. Performance y resiliencia
- Paginacion Jira (`startAt`, `maxResults`).
- Retries con backoff ante 429/5xx.
- Timeouts estrictos por request.
- Corridas chunked por celula para evitar locks largos.
- Guardar `updated` cursor para incremental.

## 12. Fases de Implementacion

### Fase 1 (MVP operativo)
1. Config Jira por ENV.
2. Cliente Jira + busqueda por JQL.
3. Endpoint `POST /jira/sync/releases`.
4. Endpoint `POST /jira/sync/sprint-items`.
5. Upsert en `release_import_items` y `release_items`.
6. Log de corrida en `jira_sync_runs`.

### Fase 2 (tiempo casi real)
1. Endpoint webhook protegido.
2. Procesamiento por evento issue/sprint.
3. Reconciliacion nocturna para consistencia.

### Fase 3 (observabilidad y gobierno)
1. Dashboard de estado de sync en UI.
2. Alertas de errores recurrentes.
3. Reporte de cobertura de mapeo (personas/celulas no vinculadas).

## 13. Criterios de Aceptacion
- Se sincronizan issues de Jira sin CSV manual.
- Se actualizan estados y fechas (`start_date`, `end_date`, `due_date`) correctamente.
- No hay duplicados por `issue_key + celula_id`.
- Daily/Releases reflejan cambios sin romper funcionalidades actuales.
- Existe trazabilidad por corrida (`jira_sync_runs`).

## 14. Riesgos y mitigaciones
- **Riesgo:** cambios de custom fields en Jira.
  - **Mitigacion:** `discover-fields` + mapeo editable.
- **Riesgo:** limites API/429.
  - **Mitigacion:** backoff + incremental.
- **Riesgo:** mapeo de personas incompleto.
  - **Mitigacion:** tabla de excepciones/manual mapping en UI admin.

## 15. Plan de pruebas recomendado
- Caso 1: backfill inicial de una celula (100+ issues).
- Caso 2: update de estado en Jira y sync incremental.
- Caso 3: issue pasa a Done y se valida `end_date`.
- Caso 4: assignee desconocido -> debe quedar warning, no fallar sync.
- Caso 5: retry en error 429.

## 16. Siguiente paso sugerido (ejecutable ya)
Implementar Fase 1 en local con este orden:
1. `settings.py` + `.env.example` con claves Jira.
2. Servicio `jira_client.py` + `jira_sync_service.py`.
3. Endpoints `/jira/sync/releases` y `/jira/sync/sprint-items`.
4. Prueba con una celula piloto.
