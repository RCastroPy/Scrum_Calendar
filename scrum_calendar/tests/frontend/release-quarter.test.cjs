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

test('Equivalent quarter formats match explicit and date-derived releases', () => {
  for (const value of ['2026 Q4', 'Q4 2026', 'Q4-2026', ' q4/2026 ']) {
    assert.equal(ctx.getReleaseQuarterFilterValue({ quarter: value }), 'Q4 2026');
  }
  assert.equal(ctx.getReleaseQuarterFilterValue({ start_date: '2026-10-01' }), 'Q4 2026');
  assert.equal(ctx.getReleaseQuarterFilterValue({ due_date: '2026-12-31' }), 'Q4 2026');
  assert.equal(ctx.getReleaseQuarterFilterValue({ sprint_nombre: 'Sprint 202640-SM' }), 'Q4 2026');
  assert.equal(ctx.getReleaseQuarterFilterValue({}), '__none__');
});

test('Explicit quarter and Todos selections survive rerender, including empty quarters', () => {
  const options = ['', 'Q4 2026', 'Q1 2027', '__none__'];
  assert.equal(ctx.resolveReleaseQuarterSelection('Q1 2027', options, 'Q4 2026'), 'Q1 2027');
  assert.equal(ctx.resolveReleaseQuarterSelection('', options, 'Q4 2026'), '');
  assert.equal(ctx.resolveReleaseQuarterSelection('__none__', options, 'Q4 2026'), '__none__');
  assert.equal(ctx.resolveReleaseQuarterSelection(null, options, 'Q4 2026'), 'Q4 2026');
  assert.equal(ctx.resolveReleaseQuarterSelection('2026 Q4', options, ''), 'Q4 2026');
});
