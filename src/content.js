// Reads and writes the content files (plain JSON in CONTENT_DIR).
// Writes go to a temp file first and are then renamed, so a crash never leaves a half-written file.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collections, settingsFields, LANGS, RESERVED_SLUGS } from './schema.js';
import { fillTranslations } from './translate.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = path.join(ROOT, 'seed');
export const DATA_DIR = path.resolve(process.env.CONTENT_DIR || path.join(ROOT, 'content'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const MAX_UPLOAD = 15 * 1024 * 1024;

const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  locks.set(key, run.catch(() => {}));
  return run;
}

const file = (name) => path.join(DATA_DIR, `${name}.json`);

// Shared with the sessions module, which keeps its own file.
export { readJson, writeJson, withLock };

async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(file(name), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(name, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file(name)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file(name));
}

// On first start, copy the starter content into CONTENT_DIR. Existing files are never overwritten.
export async function ensureSeeded() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  for (const f of await fs.readdir(SEED_DIR)) {
    const target = path.join(DATA_DIR, f);
    try {
      await fs.access(target);
    } catch {
      await fs.copyFile(path.join(SEED_DIR, f), target);
    }
  }
}

// ---- validation -----------------------------------------------------------

const SLUG_CLEAN = /[^a-z0-9]+/g;
const trim = (v) => (v == null ? '' : String(v).trim());

function normalizeField(field, raw, errors) {
  const { label, type } = field;
  let value;
  if (field.i18n) {
    const out = {};
    if (typeof raw === 'string') {
      if (trim(raw)) out.en = trim(raw);
    } else if (raw && typeof raw === 'object') {
      for (const l of LANGS) {
        const v = trim(raw[l]);
        if (v) out[l] = v;
      }
    }
    value = Object.keys(out).length ? out : undefined;
  } else if (type === 'boolean') {
    value = raw === true || raw === 'true' || raw === 'on';
  } else if (type === 'number') {
    if (trim(raw) === '') {
      value = undefined;
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) value = n;
      else errors.push(`${label} must be a number`);
    }
  } else if (type === 'slug') {
    value = trim(raw).toLowerCase().replace(SLUG_CLEAN, '-').replace(/^-+|-+$/g, '') || undefined;
  } else {
    value = trim(raw) || undefined;
    if (value && type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${label} must be an email address`);
    }
    if (value && type === 'url' && !/^(https?:\/\/|mailto:|tel:|\/)/.test(value)) {
      errors.push(`${label} must start with https://`);
    }
    if (value && type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`${label} must be a date`);
    }
  }
  if (field.required && (value === undefined || value === '')) {
    errors.push(`${label} is required`);
  }
  return value;
}

function normalize(fields, input = {}, errors = []) {
  const record = {};
  for (const f of fields) {
    const v = normalizeField(f, input[f.key], errors);
    if (v !== undefined) record[f.key] = v;
  }
  return { record, errors };
}

// ---- public API -----------------------------------------------------------

export function assertCollection(name) {
  const c = collections[name];
  if (!c) throw new HttpError(404, 'Unknown collection');
  return c;
}

export async function listRecords(name) {
  assertCollection(name);
  const data = await readJson(name, []);
  return Array.isArray(data) ? data : [];
}

export async function getRecord(name, id) {
  return (await listRecords(name)).find((r) => r.id === id) ?? null;
}

const newId = () => `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

export async function saveRecord(name, input = {}) {
  const c = assertCollection(name);
  const { record, errors } = normalize(c.fields, input);
  let id;
  if (c.idField === 'slug') {
    id = record.slug;
    if (!id) errors.push('Web address is required');
    else if (RESERVED_SLUGS.includes(id)) errors.push(`"${id}" is reserved. Choose another web address`);
  } else {
    id = input.id ? String(input.id) : newId();
    if (!/^[a-z0-9-]+$/i.test(id)) errors.push('Invalid record id');
  }
  if (errors.length) throw new HttpError(400, errors.join('. '));
  record.id = id;
  record.updatedAt = new Date().toISOString();

  return withLock(name, async () => {
    const list = await listRecords(name);
    const idx = list.findIndex((r) => r.id === id);
    const warnings = await fillTranslations(c.fields, record, idx >= 0 ? list[idx] : null);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    await writeJson(name, list);
    return { record, warnings };
  });
}

export async function deleteRecord(name, id) {
  assertCollection(name);
  return withLock(name, async () => {
    const list = await listRecords(name);
    const next = list.filter((r) => r.id !== id);
    if (next.length === list.length) throw new HttpError(404, 'Not found');
    await writeJson(name, next);
    return true;
  });
}

export async function getSettings() {
  return readJson('settings', {});
}

export async function saveSettings(input = {}) {
  const errors = [];
  const { record } = normalize(settingsFields, input, errors);
  if (errors.length) throw new HttpError(400, errors.join('. '));
  return withLock('settings', async () => {
    const warnings = await fillTranslations(settingsFields, record, await getSettings());
    await writeJson('settings', record);
    return { record, warnings };
  });
}

// ---- uploads --------------------------------------------------------------

const KINDS = [
  { ext: 'jpg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'gif', mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
  { ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46], check: (b) => b.slice(8, 12).toString('ascii') === 'WEBP' },
  { ext: 'pdf', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
];

export async function saveUpload(file) {
  const buf = file.buffer;
  const kind = KINDS.find((k) => k.magic.every((byte, i) => buf[i] === byte) && (!k.check || k.check(buf)));
  if (!kind) throw new HttpError(415, 'Only JPG, PNG, WebP, GIF or PDF files can be uploaded');
  const base = path.parse(file.originalname || 'file').name
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
  const name = `${base}-${crypto.randomBytes(4).toString('hex')}.${kind.ext}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
