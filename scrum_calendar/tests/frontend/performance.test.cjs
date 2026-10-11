const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../frontend/app.js'), 'utf8');
function section(start, end) {
  assert.ok(source.includes(start) && source.includes(end));
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
function context(extra = {}) {
  return vm.createContext({
    state: { user: { rol: 'admin' } }, URLSearchParams,
    qs: () => null, console,
    RELEASE_ITEMS_CACHE_KEY: 'releases', RELEASE_IMPORT_ITEMS_CACHE_KEY: 'imports',
    saveCachedRows: () => {}, loadCachedRows: () => [], normalizeReleaseRowsForUi: rows => rows,
    ...extra,
  });
}
const baseCode = section('  async function loadBase(', '  function buildDashboard(');
test('Dashboard loads only its seven catalogs, concurrently', async () => {
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ctx = context({ qs: selector => selector === '#dashboard', fetchJson: async url => { calls.push(url); await gate; return []; } });
  vm.runInContext(baseCode, ctx);
  const promise = ctx.loadBase();
  assert.deepEqual(calls.sort(), ['/celulas', '/eventos', '/eventos-tipo', '/feriados', '/personas', '/sprints', '/time'].sort());
  release();
  const result = await promise;
  assert.equal(result.releaseItems.length, 0);
});
test('General catalogs and both release sources start without serial waits', async () => {
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ctx = context({ fetchJson: async url => { calls.push(url); await gate; return []; } });
  vm.runInContext(baseCode, ctx);
  const pending = ctx.loadBase();
  assert.equal(calls.length, 13);
  assert.ok(calls.includes('/release-items') && calls.includes('/import-release-items') && calls.includes('/sprints'));
  release();
  await pending;
});
test('Dashboard reuses selected capacity and requests each sprint once', async () => {
  const calls = [];
  const sprints = [1, 2].map(id => ({ id, fecha_inicio: '2026-10-12', fecha_fin: '2026-10-25' }));
  const ctx = context({
    filterActivePersonas: people => people, getActiveSprint: rows => rows[0],
    getToday: () => new Date('2026-10-10T12:00:00'), parseDateOnly: value => new Date(value),
    eventBelongsToSprint: () => false, buildDashboard: data => data,
    fetchJson: async url => { calls.push(url); return sprints.map(s => ({ sprint_id: s.id, porcentaje: 100 })); },
  });
  vm.runInContext(section('  async function loadDashboardData(', '  function renderCalendar('), ctx);
  const result = await ctx.loadDashboardData({ sprints, personas: [], eventos: [], feriados: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], '/sprints/capacidades?sprint_ids=1&sprint_ids=2');
  assert.equal(result.capacidad.sprint_id, 1);
  assert.equal(result.capacidadSeries.length, 2);
});
function bulkContext(postJson) {
  const saved = [], selected = new Set(['1', '2']);
  const ctx = context({
    state: { tasksCache: [{ id: 1 }, { id: 2 }] }, selectedTaskIds: selected,
    postJson, setTasksStatus: () => {}, normalizeTaskForClient: task => task,
    upsertTaskInCache: task => saved.push(task), clearTaskSelection: () => selected.clear(),
    refreshTasksUi: () => {},
  });
  vm.runInContext(section('    let updatingSelectedDates = false;', '    const updateOverdueInProgressToToday =') + '\nthis.update = updateSelectedTasksDueDate;', ctx);
  return { ctx, saved, selected };
}
test('Bulk date sends one request, updates cache and clears selection after success', async () => {
  const calls = [];
  const { ctx, saved, selected } = bulkContext(async (url, payload) => {
    calls.push({ url, payload });
    return payload.task_ids.map(id => ({ id, fecha_vencimiento: payload.fecha_vencimiento }));
  });
  await ctx.update('2026-10-20');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/tasks/bulk-due-date');
  assert.equal(saved.length, 2);
  assert.equal(selected.size, 0);
});
test('Failed bulk date retains selection and cache for retry', async () => {
  const { ctx, saved, selected } = bulkContext(async () => { throw new Error('denied'); });
  await ctx.update('2026-10-20');
  assert.equal(selected.size, 2);
  assert.equal(saved.length, 0);
});

test('Task table no longer configures points, hours or importance as columns', () => {
  const columns = section('    const DEFAULT_COLUMNS = [', '    const COLUMN_LABEL =');
  for (const key of ['"puntos"', '"horas_estimadas"', '"importante"']) {
    assert.equal(columns.includes(key), false, `${key} must not appear in the task-column configuration`);
  }
});

test('Parent modal shows active children despite search, date, priority, assignee and segment filters', () => {
  const ctx = context({ state: {
    tasksSearch: 'Parent title', tasksSegmentFilter: 'Parent segment',
    tasksFilters: { statuses: ['backlog', 'todo', 'doing'], priorities: ['urgente'],
      assignees: ['9'], dueFrom: '2026-10-11', dueTo: '2026-10-11', hideSubtasks: true },
  }, normalizeTaskStatusKey: value => String(value || '').trim().toLowerCase() });
  vm.runInContext(section('    const filterModalSubtasksByStatus =', '    const syncOpenTaskModalSubtasks =') + '\nthis.filterChildren = filterModalSubtasksByStatus;', ctx);
  const children = [
    { id: 1, titulo: 'Different child', estado: 'todo', prioridad: 'baja', segmento: 'Other', assignee_persona_id: 2, fecha_vencimiento: '2026-10-01' },
    { id: 2, estado: 'done' }, { id: 3, estado: 'archived' },
  ];
  assert.deepEqual(Array.from(ctx.filterChildren(children), row => row.id), [1]);
  ctx.state.tasksFilters.statuses.push('done');
  assert.deepEqual(Array.from(ctx.filterChildren(children), row => row.id), [1, 2]);
  ctx.state.tasksStatusFilter = 'archived';
  assert.deepEqual(Array.from(ctx.filterChildren(children), row => row.id), [3]);
});
