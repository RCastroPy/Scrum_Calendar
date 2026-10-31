const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../frontend/app.js'), 'utf8');
function section(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
const ctx = vm.createContext({ parseDateOnly: value => value ? new Date(`${value}T00:00:00`) : null, getGanttDateRange: () => null });
vm.runInContext(section('    const getGanttTotalDays =', '    const getGanttDateRange =') + '\nthis.totalDays = getGanttTotalDays;', ctx);
vm.runInContext(section('      const buildGanttRows =', '      let ganttSprint =') + '\nthis.rows = buildGanttRows;', ctx);

test('Daily Gantt sorts by actual start ascending and places missing starts last', () => {
  const input = [
    {id: 1, start_date: null, due_date: '2026-01-01'},
    {id: 2, start_date: '2026-10-26'},
    {id: 3, start_date: '2026-10-23'},
    {id: 4, start_date: '2026-10-23'},
  ];
  assert.deepEqual(Array.from(ctx.rows(input), row => row.item.id), [3, 4, 2, 1]);
  assert.deepEqual(input.map(row => row.id), [1, 2, 3, 4]);
});

test('Daily Gantt duration uses calendar difference, end date first, then due date', () => {
  assert.equal(ctx.totalDays({start_date: '2026-10-23', end_date: '2026-10-26'}), 3);
  assert.equal(ctx.totalDays({start_date: '2026-10-23', end_date: '2026-10-26', due_date: '2026-11-01'}), 3);
  assert.equal(ctx.totalDays({start_date: '2026-10-23', due_date: '2026-10-26'}), 3);
  assert.equal(ctx.totalDays({start_date: '2026-10-23', end_date: '2026-10-23'}), 0);
  assert.equal(ctx.totalDays({start_date: '2024-02-28', end_date: '2024-03-01'}), 2);
  assert.equal(ctx.totalDays({end_date: '2026-10-26'}), null);
  assert.equal(ctx.totalDays({start_date: '2026-10-23'}), null);
  assert.equal(ctx.totalDays({start_date: '2026-10-26', end_date: '2026-10-23'}), null);
});
