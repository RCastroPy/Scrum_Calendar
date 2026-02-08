-- Cleanup local DB test data created by load/debug runs.
-- Intended for LOCAL ONLY. Always take a pg_dump backup before running.

BEGIN;

-- 1) Identify test celulas: in this DB, the only "real" ones are 2 and 3.
CREATE TEMP TABLE tmp_test_celulas AS
SELECT id
FROM celulas
WHERE id NOT IN (2, 3);

-- 2) Identify test/invalid sprints: those from test celulas + any clearly invalid dates.
CREATE TEMP TABLE tmp_test_sprints AS
SELECT id
FROM sprints
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR fecha_inicio < DATE '2000-01-01'
   OR fecha_fin < DATE '2000-01-01';

-- 3) Identify test personas: those attached to test celulas, plus known test patterns.
CREATE TEMP TABLE tmp_test_personas AS
SELECT DISTINCT p.id
FROM personas p
LEFT JOIN persona_celulas pc ON pc.persona_id = p.id
WHERE pc.celula_id IN (SELECT id FROM tmp_test_celulas)
   OR p.apellido LIKE 'rt2026-02-07_%'
   OR p.apellido LIKE 'dbg2026-02-07_%'
   OR p.apellido LIKE 'dbg22026-02-07_%'
   OR p.apellido LIKE 'probe2026-02-07_%'
   OR p.apellido LIKE 'wait2026-02-07_%'
   OR p.apellido LIKE 'dbprobe2026-02-07_%'
   OR p.apellido LIKE 'iprobe2026-02-07_%'
   OR p.apellido LIKE 'hang2026-02-07_%'
   OR (p.nombre = 'Uno' AND p.apellido = 'Test');

-- 4) Identify tasks to delete: any linked to test celulas/sprints/personas + orphan tasks (celula_id is NULL),
-- and include all descendants.
CREATE TEMP TABLE tmp_test_tasks AS
WITH RECURSIVE seed AS (
  SELECT id
  FROM tasks
  WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
     OR sprint_id IN (SELECT id FROM tmp_test_sprints)
     OR assignee_persona_id IN (SELECT id FROM tmp_test_personas)
     OR celula_id IS NULL
),
rec AS (
  SELECT id FROM seed
  UNION
  SELECT t.id
  FROM tasks t
  JOIN rec r ON t.parent_id = r.id
)
SELECT DISTINCT id FROM rec;

-- Visibility (psql will print these counts).
SELECT 'tmp_test_celulas' AS what, COUNT(*) AS n FROM tmp_test_celulas;
SELECT 'tmp_test_sprints' AS what, COUNT(*) AS n FROM tmp_test_sprints;
SELECT 'tmp_test_personas' AS what, COUNT(*) AS n FROM tmp_test_personas;
SELECT 'tmp_test_tasks' AS what, COUNT(*) AS n FROM tmp_test_tasks;

-- Poker planning
DELETE FROM poker_votes
WHERE sesion_id IN (SELECT id FROM poker_sessions WHERE celula_id IN (SELECT id FROM tmp_test_celulas))
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM poker_claims
WHERE sesion_id IN (SELECT id FROM poker_sessions WHERE celula_id IN (SELECT id FROM tmp_test_celulas))
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM poker_sessions
WHERE celula_id IN (SELECT id FROM tmp_test_celulas);

-- Retrospectiva
DELETE FROM retro_items
WHERE retro_id IN (
        SELECT id FROM retrospectives
        WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
           OR sprint_id IN (SELECT id FROM tmp_test_sprints)
      )
   OR persona_id IN (SELECT id FROM tmp_test_personas)
   OR asignado_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM retro_claims
WHERE retro_id IN (
        SELECT id FROM retrospectives
        WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
           OR sprint_id IN (SELECT id FROM tmp_test_sprints)
      )
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM retrospectives
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR sprint_id IN (SELECT id FROM tmp_test_sprints);

-- 1:1
DELETE FROM oneonone_entries
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM oneonone_notes
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM oneonone_sessions
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

-- Eventos (vacaciones, etc.)
DELETE FROM eventos
WHERE persona_id IN (SELECT id FROM tmp_test_personas)
   OR sprint_id IN (SELECT id FROM tmp_test_sprints);

-- Jira imports / sprint & release items
DELETE FROM sprint_items
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR sprint_id IN (SELECT id FROM tmp_test_sprints)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM sprint_import_items
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR sprint_id IN (SELECT id FROM tmp_test_sprints)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM release_items
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR sprint_id IN (SELECT id FROM tmp_test_sprints)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM release_import_items
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR sprint_id IN (SELECT id FROM tmp_test_sprints)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

-- Tasks
DELETE FROM task_comments
WHERE task_id IN (SELECT id FROM tmp_test_tasks);

DELETE FROM tasks
WHERE id IN (SELECT id FROM tmp_test_tasks);

-- Feriados
DELETE FROM feriados
WHERE celula_id IN (SELECT id FROM tmp_test_celulas);

-- Persona <-> Celula mapping, then personas
DELETE FROM persona_celulas
WHERE celula_id IN (SELECT id FROM tmp_test_celulas)
   OR persona_id IN (SELECT id FROM tmp_test_personas);

DELETE FROM personas
WHERE id IN (SELECT id FROM tmp_test_personas);

-- Sprints, then celulas
DELETE FROM sprints
WHERE id IN (SELECT id FROM tmp_test_sprints);

DELETE FROM celulas
WHERE id IN (SELECT id FROM tmp_test_celulas);

COMMIT;

