import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const PASSWORD = 'test-password-long-enough';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stmary-test-'));
process.env.CONTENT_DIR = dir;

const { ensureSeeded } = await import('../src/content.js');
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
