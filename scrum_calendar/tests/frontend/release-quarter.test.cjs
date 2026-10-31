const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../frontend/app.js'), 'utf8');
const code = source.slice(source.indexOf('  function normalizeReleaseQuarter('), source.indexOf('  function classifyReleaseStatus('));
const ctx = vm.createContext({
  parseDateOnly: value => value ? new Date(`${value}T12:00:00`) : null,
  getSprintRank: value => value === 'Sprint 202640-SM' ? 202640 : null,
});
vm.runInContext(code, ctx);

test('Quarter filtering uses the stored Quarter field in any supported format', () => {
  for (const value of ['2026 Q4', 'Q4 2026', 'Q4-2026', ' q4/2026 ', 'Q4/26', 'Q 4 2026']) {
    assert.equal(ctx.getReleaseQuarterFilterValue({ quarter: value }), 'Q4 2026');
  }
  assert.equal(ctx.getReleaseQuarterFilterValue({ start_date: '2026-10-01' }), '__none__');
  assert.equal(ctx.getReleaseQuarterFilterValue({ due_date: '2026-12-31' }), '__none__');
  assert.equal(ctx.getReleaseQuarterFilterValue({ sprint_nombre: 'Sprint 202640-SM' }), '__none__');
  assert.equal(ctx.getReleaseQuarterFilterValue({}), '__none__');
});

test('Shared options combine catalog and stored quarters with one label per Quarter', () => {
  const options = ctx.buildReleaseQuarterOptions([
    { quarter: 'Q4-2026' }, { quarter: 'Q4 2026' }, { quarter: '2025 Q1' },
    { start_date: '2024-10-01' },
  ], ['2026 Q4', 'Q1 2027']);
  assert.deepEqual(Array.from(options), ['Q1 2025', 'Q1 2027', 'Q4 2026']);
});

test('Explicit quarter and Todos selections survive rerender, including empty quarters', () => {
  const options = ['', 'Q4 2026', 'Q1 2027', '__none__'];
  assert.equal(ctx.resolveReleaseQuarterSelection('Q1 2027', options, 'Q4 2026'), 'Q1 2027');
  assert.equal(ctx.resolveReleaseQuarterSelection('', options, 'Q4 2026'), '');
  assert.equal(ctx.resolveReleaseQuarterSelection('__none__', options, 'Q4 2026'), '__none__');
  assert.equal(ctx.resolveReleaseQuarterSelection(null, options, 'Q4 2026'), 'Q4 2026');
  assert.equal(ctx.resolveReleaseQuarterSelection('2026 Q4', options, ''), 'Q4 2026');
});
