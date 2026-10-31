// Local-only UI regression: uses a temporary session and mocked release data.
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const token = randomBytes(32).toString('hex');
const container = 'scrumia-replica-20261030-api-1';
function database(code) {
  execFileSync('docker', ['exec', container, 'python', '-c', code, token]);
}
const rows = ['2026 Q4', 'Q4-2026', 'Q1 2026', null, null].map((quarter, i) => ({
  id: 9001 + i, celula_id: 1, issue_key: `FILTER-${i + 1}`, issue_type: 'Release',
  summary: `Filter regression ${i + 1}`, release_tipo: 'Comprometido', status: 'Backlog',
  quarter, start_date: i === 4 ? null : '2026-10-01', due_date: null, end_date: null,
}));
(async () => {
  database(`from data.db import SessionLocal
from data.models import Usuario,Sesion,now_py
from datetime import timedelta
import sys
with SessionLocal() as db:
 user=db.query(Usuario).filter(Usuario.rol=='admin',Usuario.activo.is_(True)).first()
 assert user
 db.add(Sesion(usuario_id=user.id,token=sys.argv[1],expira_en=now_py()+timedelta(minutes=5)))
 db.commit()`);
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await engine.launch({ headless: true });
      try {
        const context = await browser.newContext();
        await context.addCookies([{name: 'scrum_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax'}]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/release-items', route => route.fulfill({ json: rows }));
        await page.route('**/quarters', route => route.fulfill({ json: [{id: 1, label: '2026 Q4'}, {id: 2, label: '2027 Q1'}] }));
        await page.goto('http://localhost:8013/ui/releases-table.html');
        const select = page.locator('#release-quarter-filter');
        await select.waitFor();
        for (const [quarter, expected] of [['Q4 2026', 2], ['Q1 2027', 0], ['', 5], ['__none__', 2], ['Q1 2026', 1], ['Q4 2026', 2]]) {
          await select.selectOption(quarter);
          assert.equal(await select.inputValue(), quarter);
          assert.equal(Number(await page.locator('#release-kpi-total').textContent()), expected);
          assert.equal(Number(await page.locator('#release-gantt-kpi-quarter-total').textContent()), expected);
          const tableText = await page.locator('#release-table').innerText();
          const visibleIssues = [...tableText.matchAll(/FILTER-\d/g)].map(match => match[0]);
          assert.equal(new Set(visibleIssues).size, expected);
          console.log(`${name}: ${quarter || 'Todos'} -> ${expected} releases, table and Gantt agree`);
        }
        const optionPairs = nodes => nodes.filter(node => node.value && node.value !== '__none__').map(node => [node.value, node.textContent]);
        const filterOptions = await select.locator('option').evaluateAll(optionPairs);
        await page.locator('#release-create-btn').click();
        assert.deepEqual(await page.locator('#release-edit-quarter option').evaluateAll(optionPairs), filterOptions);
        await page.locator('.admin-modal-close').click();
        const legacyRow = page.locator('#release-table tbody tr').filter({ hasText: 'FILTER-2' });
        assert.equal(await legacyRow.locator('select').first().inputValue(), 'Q4 2026');
        await legacyRow.getByRole('button', { name: 'Editar', exact: true }).click();
        assert.deepEqual(await page.locator('#release-edit-quarter option').evaluateAll(optionPairs), filterOptions);
        assert.equal(await page.locator('#release-edit-quarter').inputValue(), 'Q4 2026');
        console.log(`${name}: filter, create form, edit form and legacy row share canonical Quarter options`);
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    }
  } finally {
    database(`from data.db import SessionLocal
from data.models import Sesion
import sys
with SessionLocal() as db:
 db.query(Sesion).filter(Sesion.token==sys.argv[1]).delete()
 db.commit()`);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
