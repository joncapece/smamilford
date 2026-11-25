import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const PASSWORD = 'test-password-long-enough';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stmary-test-'));
process.env.CONTENT_DIR = dir;

const { ensureSeeded } = await import('../src/content.js');
const { liveMass } = await import('../src/masses.js');
const { createApp } = await import('../src/app.js');
await ensureSeeded();

const app = createApp({ adminPassword: PASSWORD });
let server;
let base;
const auth = `Basic ${Buffer.from(`admin:${PASSWORD}`).toString('base64')}`;
const admin = (p, opts = {}) => fetch(base + p, {
  ...opts,
  headers: { Authorization: auth, ...(opts.json ? { 'Content-Type': 'application/json' } : {}) },
  body: opts.json ? JSON.stringify(opts.json) : opts.body,
});

before(() => new Promise((resolve) => {
  server = app.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dir, { recursive: true, force: true });
});

test('home page shows the parish name in English', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<html lang="en"/);
  assert.match(html, /Saint Mary of the Assumption/);
  assert.match(html, /\/img\/logo\.webp/);
});

test('?lang=es switches the site to Spanish and remembers it', async () => {
  const r = await fetch(`${base}/?lang=es`);
  const html = await r.text();
  assert.match(html, /<html lang="es"/);
  assert.match(html, /Santa María de la Asunción/);
  assert.match(r.headers.get('set-cookie') || '', /lang=es/);
});

test('editor requires a password', async () => {
  const r = await fetch(`${base}/admin/api/schema`);
  assert.equal(r.status, 401);
  const r2 = await fetch(`${base}/admin/`);
  assert.equal(r2.status, 401);
});

test('editor is reachable with the password', async () => {
  const r = await admin('/admin/api/schema');
  assert.equal(r.status, 200);
  const schema = await r.json();
  assert.ok(schema.collections.some((c) => c.key === 'events'));
});

test('an event added in the editor appears on the events page, and HTML is cleaned', async () => {
  const r = await admin('/admin/api/events', {
    method: 'POST',
    json: {
      title: { en: 'Parish Picnic' },
      date: '2099-06-01',
      location: 'Parish Hall',
      description: { en: 'A **Bring a dish** potluck.<script>alert(1)</script>' },
    },
  });
  assert.equal(r.status, 200);
  const page = await (await fetch(`${base}/events`)).text();
  assert.match(page, /Parish Picnic/);
  assert.match(page, /<strong>Bring a dish<\/strong>/);
  assert.doesNotMatch(page, /<script>alert/);
});

test('Mass times are split into Lord\'s Day and Weekday Liturgies', async () => {
  const add = (body) => admin('/admin/api/mass_times', { method: 'POST', json: body });
  assert.equal((await add({ section: 'weekday', weekday: 'tuesday', time: '7:00 AM', language: 'en' })).status, 200);
  assert.equal((await add({ section: 'lords_day', weekday: 'sunday', time: '9:00 AM', language: 'en' })).status, 200);
  const page = await (await fetch(`${base}/mass-times`)).text();
  const lords = page.indexOf('Lord');
  const weekday = page.indexOf('Weekday Liturgies');
  assert.ok(lords > 0 && weekday > lords, 'Lord\'s Day heading comes before Weekday Liturgies');
  assert.ok(page.indexOf('Sunday') < weekday, 'Sunday Mass is in the Lord\'s Day group');
  assert.ok(page.indexOf('Tuesday') > weekday, 'Tuesday Mass is in the Weekday group');
});

test('past events are not listed as upcoming', async () => {
  await admin('/admin/api/events', {
    method: 'POST',
    json: { title: { en: 'Old Event' }, date: '2001-01-01' },
  });
  const page = await (await fetch(`${base}/events`)).text();
  assert.doesNotMatch(page, /Old Event/);
});

test('a page created in the editor is served at its web address', async () => {
  const r = await admin('/admin/api/pages', {
    method: 'POST',
    json: { slug: 'Sacraments Overview', title: { en: 'Sacraments' }, body: { en: 'Baptism, Eucharist, and more.' }, nav: true, order: 2 },
  });
  assert.equal(r.status, 200);
  const res = await fetch(`${base}/sacraments-overview`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Baptism, Eucharist/);
  assert.match(html, /href="\/sacraments-overview"/);
});

test('reserved web addresses are refused', async () => {
  const r = await admin('/admin/api/pages', { method: 'POST', json: { slug: 'events', title: { en: 'Nope' } } });
  assert.equal(r.status, 400);
});

test('settings can be changed and show on the site', async () => {
  const r = await admin('/admin/api/settings', {
    method: 'PUT',
    json: { parish_name: { en: 'St. Mary Test' }, phone: '508-555-0100', timezone: 'America/New_York' },
  });
  assert.equal(r.status, 200);
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /St\. Mary Test/);
  assert.match(html, /508-555-0100/);
});

test('unknown pages return a 404 page', async () => {
  const r = await fetch(`${base}/no-such-page`);
  assert.equal(r.status, 404);
});

test('uploads must be real images or PDFs', async () => {
  const form = new FormData();
  form.append('file', new Blob(['<html><script>x</script></html>'], { type: 'image/png' }), 'evil.png');
  const r = await admin('/admin/api/upload', { method: 'POST', body: form, headers: {} });
  assert.equal(r.status, 415);
});

test('English text is translated automatically, and a person\'s own translation is kept', async () => {
  const { setTranslator } = await import('../src/translate.js');
  setTranslator(async (texts, lang) => texts.map((t) => `[${lang}] ${t}`));
  try {
    const created = await (await admin('/admin/api/ministries', {
      method: 'POST', json: { name: { en: 'Choir' }, description: { en: 'We sing.' } },
    })).json();
    assert.equal(created.record.name.es, '[es] Choir');
    assert.equal(created.record.name.pt, '[pt] Choir');
    assert.ok(created.record._auto, 'machine translations are marked');

    // A person types their own Spanish: it must not be overwritten when the English changes
    const id = created.record.id;
    await admin('/admin/api/ministries', { method: 'POST', json: { id, name: { en: 'Choir', es: 'Coro parroquial' }, description: { en: 'We sing.' } } });
    const after = (await (await admin('/admin/api/ministries')).json()).find((m) => m.id === id);
    assert.equal(after.name.es, 'Coro parroquial');
    assert.equal(after.name.pt, '[pt] Choir', 'untouched machine translation is kept');

    // English changes: the untouched machine translation is redone
    const r = await (await admin('/admin/api/ministries', { method: 'POST', json: { id, name: { en: 'Parish Choir', es: 'Coro parroquial' }, description: { en: 'We sing.' } } })).json();
    assert.equal(r.record.name.pt, '[pt] Parish Choir');
    assert.equal(r.record.name.es, 'Coro parroquial');
  } finally {
    setTranslator(null);
  }
});

test('a failed translation is reported but the save still succeeds', async () => {
  const { setTranslator } = await import('../src/translate.js');
  setTranslator(async () => { throw new Error('service down'); });
  try {
    const r = await admin('/admin/api/staff', { method: 'POST', json: { name: 'Sam Test', role: { en: 'Organist' } } });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.match(body.warnings.join(' '), /service down/);
    assert.equal(body.record.role.en, 'Organist');
  } finally {
    setTranslator(null);
  }
});

test('home page photos rotate, hidden photos are left out, and the emblem is the fallback', async () => {
  const before = await (await fetch(`${base}/`)).text();
  assert.match(before, /hero-emblem/);
  await admin('/admin/api/slides', { method: 'POST', json: { image: '/uploads/a.jpg', title: { en: 'Choir at Christmas' }, order: 1 } });
  await admin('/admin/api/slides', { method: 'POST', json: { image: '/uploads/b.jpg', order: 2 } });
  await admin('/admin/api/slides', { method: 'POST', json: { image: '/uploads/secret.jpg', hidden: true, order: 3 } });
  const html = await (await fetch(`${base}/?lang=en`)).text();
  assert.equal((html.match(/class="slide"/g) || []).length, 2);
  assert.match(html, /src="\/uploads\/a\.jpg"/);
  assert.match(html, /alt="Choir at Christmas"/);
  assert.doesNotMatch(html, /secret\.jpg/);
  assert.match(html, /@keyframes rot-2/);
});

test('home page photos can show a caption heading and text', async () => {
  await admin('/admin/api/slides', { method: 'POST', json: { image: '/uploads/c.jpg', caption_heading: { en: 'Welcome Home' }, caption_body: { en: 'Sunday Mass at 9 AM' }, order: 4 } });
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<div class="slide-caption"><h2>Welcome Home<\/h2><p>Sunday Mass at 9 AM<\/p><\/div>/);
});

test('the Bulletins page can show embed code from settings instead of uploaded files', async () => {
  const code = '<iframe id="LPI.Pub.Widget.v1" src="https://parishesonline.com/publicationWidget?type=bulletin"></iframe>';
  const current = await (await admin('/admin/api/settings')).json();
  const save = (value) => admin('/admin/api/settings', { method: 'PUT', json: { ...current, bulletin_embed: value } });
  assert.equal((await save(code)).status, 200);
  const page = await (await fetch(`${base}/bulletins`)).text();
  assert.ok(page.includes(code), 'embed code is shown as pasted');
  assert.equal((await save('')).status, 200);
  const after = await (await fetch(`${base}/bulletins`)).text();
  assert.ok(!after.includes('parishesonline'), 'embed is removed when cleared');
});

test('home page lists upcoming Masses only, with a link to the full schedule', async () => {
  const add = (body) => admin('/admin/api/mass_times', { method: 'POST', json: body });
  assert.equal((await add({ section: 'lords_day', weekday: 'sunday', time: '9:00 AM', language: 'en' })).status, 200);
  assert.equal((await add({ section: 'weekday', date: '2000-01-01', time: '7:00 AM', language: 'en', note: { en: 'Old holy day' } })).status, 200);
  assert.equal((await add({ section: 'weekday', date: '2099-12-08', time: '7:00 AM', language: 'en', note: { en: 'Future holy day' } })).status, 200);
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /Future holy day/);
  assert.doesNotMatch(html, /Old holy day/);
  assert.match(html, /View full Mass schedule/);
  assert.match(html, /href="\/mass-times"/);
});

test('the live pop-up is for streamed Masses only, during the Mass', () => {
  const sunday9 = { section: 'lords_day', weekday: 'sunday', time: '9:00 AM', streamed: true };
  const today = { date: '2026-11-29', dow: 0, minutes: 9 * 60 + 30 };
  assert.equal(liveMass([sunday9], 'America/New_York', 90, today), sunday9);
  assert.equal(liveMass([sunday9], 'America/New_York', 90, { ...today, minutes: 11 * 60 }), undefined, 'after the Mass has ended');
  assert.equal(liveMass([{ ...sunday9, streamed: false }], 'America/New_York', 90, today), undefined, 'not streamed');
  assert.equal(liveMass([{ ...sunday9, weekday: 'monday' }], 'America/New_York', 90, today), undefined, 'a different day');
  const oneTime = { section: 'weekday', date: '2026-11-29', time: '7:00 PM', streamed: true };
  assert.equal(liveMass([oneTime], 'America/New_York', 90, { date: '2026-11-29', dow: 0, minutes: 19 * 60 + 15 }), oneTime);
});

test('Mass times always show earliest to latest, whatever order they were entered in', async () => {
  const add = (time) => admin('/admin/api/mass_times', { method: 'POST', json: { section: 'lords_day', weekday: 'sunday', time, language: 'en' } });
  await add('3:20 PM');
  await add('6:15 AM');
  await add('11:45 AM');
  const page = await (await fetch(`${base}/mass-times`)).text();
  const a = page.indexOf('6:15 AM');
  const b = page.indexOf('11:45 AM');
  const c = page.indexOf('3:20 PM');
  assert.ok(a > 0 && b > a && c > b, 'times are in order from earliest to latest');
});

test('a photo placed in page text keeps its description and shows on the site', async () => {
  const saved = await admin('/admin/api/pages', {
    method: 'POST',
    json: { slug: 'photo-check', title: { en: 'Photos' }, body: { en: '<p>Our choir</p><img src="/uploads/choir-test.jpg" alt="The choir at Christmas">' } },
  });
  assert.equal(saved.status, 200);
  const html = await (await fetch(`${base}/photo-check`)).text();
  assert.match(html, /<img src="\/uploads\/choir-test\.jpg" alt="The choir at Christmas"/);
});
