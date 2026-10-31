// Local-only UI regression: save responses are mocked; release records are not changed.
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const token = randomBytes(32).toString('hex');
function database(code) {
  execFileSync('docker', ['exec', 'scrumia-replica-20261030-api-1', 'python', '-c', code, token]);
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
        const context = await browser.newContext();
        await context.addCookies([{name: 'scrum_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax'}]);
        const page = await context.newPage();
        const errors = [];
        let dialogCount = 0, postCount = 0, putCount = 0;
        let createFailure = true, updateFailure = true;
        const rows = [{id: 9001, celula_id: 1, issue_key: 'TST-1', issue_type: 'Release', summary: 'Existing popup fixture', release_tipo: 'comprometido', quarter: 'Q4 2026', status: 'Backlog'}];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', () => { dialogCount += 1; });
        await page.route('**/celulas', route => route.fulfill({json: [{id: 1, nombre: 'Test cell', jira_codigo: 'TST', activa: true}]}));
        await page.route('**/release-items/*/comments', route => route.fulfill({json: []}));
        await page.route('**/release-items', async route => {
          if (route.request().method() === 'GET') return route.fulfill({json: rows});
          assert.equal(route.request().method(), 'POST');
          assert.equal(route.request().postDataJSON().issue_type, 'Release');
          postCount += 1;
          if (createFailure) return route.fulfill({status: 409, json: {detail: 'Ya existe un release con ese ISSUE'}});
          const row = {id: 9002, ...route.request().postDataJSON()};
          rows.push(row);
          return route.fulfill({status: 201, json: row});
        });
        await page.route('**/release-items/9001', async route => {
          assert.equal(route.request().method(), 'PUT');
          assert.equal(route.request().postDataJSON().issue_type, 'Release');
          putCount += 1;
          if (updateFailure) return route.fulfill({status: 503, json: {detail: 'Error de prueba al guardar.'}});
          Object.assign(rows[0], route.request().postDataJSON());
          return route.fulfill({json: rows[0]});
        });
        await page.goto('http://localhost:8013/ui/releases-table.html');
        await page.locator('#release-create-btn').click();
        const form = page.locator('#release-edit-form');
        assert.equal(await form.locator('[name="issue_type"]').count(), 0);
        async function submit(expected) {
          const pending = page.waitForEvent('dialog');
          const click = form.locator('button[type="submit"]').click();
          const dialog = await pending;
          const message = dialog.message();
          assert.equal(dialog.type(), 'alert');
          await dialog.accept();
          await click;
          assert.equal(message, expected);
        }
        await submit('Celula, Issue y Resumen son obligatorios.');
        assert.equal(postCount, 0);
        await form.locator('[name="celula_id"]').selectOption('1');
        await form.locator('[name="issue_key"]').fill('TST-999');
        await form.locator('[name="summary"]').fill('Popup creation test');
        await form.locator('[name="quarter"]').selectOption('Q4 2026');
        await form.locator('[name="due_date"]').fill('2026-10-31');
        await submit('No se ha podido crear porque ya existe un release con el ISSUE.');
        assert.equal(await form.locator('[name="summary"]').inputValue(), 'Popup creation test');
        assert.equal(await form.locator('[name="due_date"]').inputValue(), '2026-10-31');
        createFailure = false;
        await submit('Release creado con éxito.');
        const issueCursor = await form.locator('[name="issue_key"]').evaluate(input => ({
          focused: document.activeElement === input, value: input.value,
          start: input.selectionStart, end: input.selectionEnd,
        }));
        assert.equal(issueCursor.focused, true);
        assert.equal(issueCursor.value, 'TST-');
        assert.equal(issueCursor.start, issueCursor.value.length);
        assert.equal(issueCursor.end, issueCursor.value.length);
        assert.equal(await form.locator('[name="summary"]').inputValue(), '');
        assert.equal(await form.locator('[name="due_date"]').inputValue(), '');
        assert.equal(await form.locator('[name="celula_id"]').inputValue(), '1');
        assert.equal(await form.locator('[name="quarter"]').inputValue(), 'Q4 2026');
        await page.locator('.admin-modal-close').click();
        await page.locator('#release-table tbody tr').filter({hasText: 'TST-1'}).getByRole('button', {name: 'Editar', exact: true}).click();
        await form.locator('[name="summary"]').fill('Popup update test');
        await submit('Error de prueba al guardar.');
        assert.equal(await form.locator('[name="summary"]').inputValue(), 'Popup update test');
        updateFailure = false;
        await submit('Release actualizado con éxito.');
        assert.equal(dialogCount, 5);
        assert.equal(postCount, 2);
        assert.equal(putCount, 2);
        assert.deepEqual(errors, []);
        console.log(`${name}: five result popups passed; failed saves retained input and successful creation reset fields`);
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
