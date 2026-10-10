// Run against the local preview with Playwright installed (NODE_PATH if needed).
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const token = randomBytes(32).toString('hex');
const url = 'http://localhost:8013/ui/tasks.html';
const container = 'scrumia-performance-preview';
function database(code) {
  return execFileSync('docker', ['exec', container, 'python', '-c', code, token]);
}
async function geometry(page, label) {
  const result = await page.evaluate(() => {
    const table = document.querySelector('#tasks-backlog-table');
    const head = document.querySelector('.dataTables_scrollHead table') || table;
    const headers = [...head.querySelectorAll('thead th')];
    const rows = [...table.querySelectorAll('tbody tr')].filter(row => row.getBoundingClientRect().height > 0);
    const gaps = rows.flatMap(row => [...row.children].map((cell, i) => {
      const a = headers[i].getBoundingClientRect(), b = cell.getBoundingClientRect();
      return Math.max(Math.abs(a.left - b.left), Math.abs(a.width - b.width));
    }));
    return { rows: rows.length, maxGap: Math.max(...gaps), headerCount: headers.length };
  });
  console.log(label, result);
  assert.ok(result.rows > 0, 'Expected loaded tasks');
  assert.ok(result.maxGap <= 1, `Header/body mismatch: ${result.maxGap}px`);
}
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
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.addCookies([{name: 'scrum_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax'}]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.locator('#tasks-backlog-table tbody tr[data-task-id]').first().waitFor();
        await geometry(page, `${name}: desktop`);
        for (const width of [1024, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await geometry(page, `${name}: width=${width}`);
        }
        await page.locator('.tasks-notion-scroll').evaluate(el => { el.scrollLeft = 480; });
        await geometry(page, `${name}: horizontal scroll`);
        await page.locator('#tasks-backlog-table_length select').selectOption('20');
        await geometry(page, `${name}: page length`);
        await page.locator('#tasks-backlog-table thead th[data-col-key="prioridad"]').click();
        await geometry(page, `${name}: sorted`);
        const handle = page.locator('#tasks-backlog-table th[data-col-key="prioridad"] [data-action="resize-col"]');
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2, { steps: 5 });
        await page.mouse.up();
        await geometry(page, `${name}: resized column`);
        await page.reload();
        await page.locator('#tasks-backlog-table tbody tr[data-task-id]').first().waitFor();
        await geometry(page, `${name}: persisted layout after reload`);
        await page.locator('#tasks-backlog-table').screenshot({ path: `/tmp/scrumia-backlog-aligned-${name}.png` });
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
