// Local-only browser regression: event saves are mocked and do not change application data.
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
 db.add(Sesion(usuario_id=user.id,token=sys.argv[1],expira_en=now_py()+timedelta(minutes=5)))
 db.commit()`);
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await engine.launch({headless: true});
      try {
        const context = await browser.newContext({viewport: {width: 1024, height: 768}});
        await context.addCookies([{name: 'scrum_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax'}]);
        const page = await context.newPage();
        const errors = [], saved = [];
        page.on('pageerror', error => errors.push(error.message));
        const people = ['Viviana', 'Vanesa'].map((nombre, i) => ({id: i + 1, nombre, apellido: 'Test', rol: 'DEV', activo: true, capacidad_diaria_horas: 8, celulas: [{id: 1}]}));
        const events = [{id: 1, persona_id: 1, tipo_evento_id: 1, jornada: 'completo', fecha_inicio: '2026-10-23', fecha_fin: '2026-10-23', descripcion: 'Existing event'}];
        const cap = {sprint_id: 501, capacidad_teorica: 80, capacidad_real: 80, capacidad_teorica_dias: 10, capacidad_real_dias: 10, porcentaje: 100, estado: 'healthy', detalle_por_persona: []};
        const mocks = {
          time: {today: '2026-10-30', now: '2026-10-30T12:00:00-03:00', timezone: 'America/Asuncion'},
          sprints: [{id: 501, nombre: 'Sprint 202644-Test', celula_id: 1, fecha_inicio: '2026-10-20', fecha_fin: '2026-11-03'}],
          celulas: [{id: 1, nombre: 'Test cell', jira_codigo: 'TEST', activa: true}], personas: people,
          'eventos-tipo': [{id: 1, nombre: 'Permiso', impacto_capacidad: 100, planificado: true, activo: true}], feriados: [],
        };
        for (const [path, json] of Object.entries(mocks)) await page.route('**/' + path, route => route.fulfill({json}));
        await page.route(/\/sprints\/capacidades(?:\?.*)?$/, route => route.fulfill({json: [cap]}));
        await page.route('**/sprints/501/capacidad', route => route.fulfill({json: cap}));
        await page.route('**/eventos', async route => {
          if (route.request().method() === 'GET') return route.fulfill({json: events});
          const payload = route.request().postDataJSON();
          saved.push(payload);
          const created = {id: 2, impacto_capacidad: 100, planificado: true, ...payload};
          events.push(created);
          return route.fulfill({status: 201, json: created});
        });
        await page.goto('http://localhost:8013/ui/index.html');
        const day = number => page.locator('#calendar-grid .calendar-cell').filter({has: page.locator('.calendar-day').filter({hasText: new RegExp(`^${number}$`)})});
        await day(23).click();
        await page.locator('#day-event-toggle').click();
        const form = page.locator('#day-event-form');
        await form.locator('[name="tipo"]').selectOption('1');
        const start = form.locator('[name="fecha_inicio"]'), end = form.locator('[name="fecha_fin"]');
        assert.equal(await start.inputValue(), '2026-10-23');
        assert.equal(await end.inputValue(), '2026-10-23');
        assert.equal(await form.locator('[name="persona"] option[value="1"]').count(), 0);
        await end.fill('2026-10-26');
        await end.dispatchEvent('change');
        assert.equal(await form.locator('[name="persona"] option[value="1"]').count(), 1);
        await form.locator('[name="persona"]').selectOption('1');
        await form.locator('button[type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('#day-event-form').classList.contains('is-hidden'));
        assert.equal(saved.length, 1);
        assert.equal(saved[0].fecha_inicio, '2026-10-23');
        assert.equal(saved[0].fecha_fin, '2026-10-26');
        assert.ok((await page.locator('#day-modal-list').innerText()).includes('Permiso'));
        await page.locator('#day-modal .modal-close').click();
        assert.ok((await day(26).innerText()).includes('Permiso'));
        await day(27).click();
        await page.locator('#day-event-toggle').click();
        await form.locator('[name="tipo"]').selectOption('1');
        assert.equal(await start.inputValue(), '2026-10-27');
        assert.equal(await end.inputValue(), '2026-10-27');
        await form.locator('[name="persona"]').selectOption('1');
        await start.fill('2026-10-28');
        await start.dispatchEvent('change');
        assert.equal(await end.inputValue(), '2026-10-28');
        await end.fill('2026-10-27');
        await end.dispatchEvent('change');
        assert.equal(await end.evaluate(input => input.validity.rangeUnderflow), true);
        await form.locator('button[type="submit"]').click();
        assert.equal(saved.length, 1);
        assert.deepEqual(errors, []);
        console.log(`${name}: selected-day defaults, multi-day save, calendar refresh, next-day reset and invalid-range guard passed`);
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
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
