import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { UI } from './i18n.js';
import { LANGS, collections, settingsFields, RESERVED_SLUGS } from './schema.js';
import * as store from './content.js';
import * as views from './views.js';
import { translationEnabled } from './translate.js';
import { pick, todayIn } from './util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ADMIN_DIR = path.join(ROOT, 'admin');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- language -------------------------------------------------------------

function resolveLang(req, res) {
  const q = typeof req.query.lang === 'string' ? req.query.lang : '';
  if (LANGS.includes(q)) {
    res.setHeader('Set-Cookie', `lang=${q}; Path=/; Max-Age=31536000; SameSite=Lax`);
    return q;
  }
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)lang=(en|es|pt)(?:;|$)/);
  if (cookie) return cookie[1];
  for (const part of String(req.headers['accept-language'] || '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return 'en';
}

// ---- ordering and filtering ----------------------------------------------

const label = (r) => pick(r.title ?? r.name ?? r.day ?? '', 'en');
const SORTERS = {
  order: (a, b) => (a.order ?? 9999) - (b.order ?? 9999) || label(a).localeCompare(label(b)),
  'date-asc': (a, b) => (a.date || '').localeCompare(b.date || ''),
  'date-desc': (a, b) => (b.date || '').localeCompare(a.date || ''),
};
const sortRecords = (list, sortBy = 'order') => [...list].sort(SORTERS[sortBy] ?? SORTERS.order);
const upcomingEvents = (list, today) => sortRecords(list.filter((e) => e.date && e.date >= today), 'date-asc');
const activeAnnouncements = (list, today) =>
  list
    .filter((a) => !(a.expires && a.expires < today))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.date || '').localeCompare(a.date || ''));

// ---- app ------------------------------------------------------------------

export function createApp(options = {}) {
  const adminUser = options.adminUser ?? process.env.ADMIN_USER ?? 'admin';
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? '';
  if (adminPassword.length < 12) {
    throw new Error('Set ADMIN_PASSWORD in the environment (at least 12 characters) before starting the site.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // the Caddy reverse proxy sits in front of us

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Vary', 'Cookie, Accept-Language');
    next();
  });

  app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), { maxAge: '1d' }));
  app.use('/img', express.static(path.join(PUBLIC_DIR, 'img'), { maxAge: '7d' }));
  app.use('/uploads', express.static(store.UPLOAD_DIR, { maxAge: '1d', index: false, dotfiles: 'ignore' }));
  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ---- admin (password protected) ----
  const safeEq = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  };
  const requireAdmin = (req, res, next) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Basic ')) {
      const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
      if (safeEq(user ?? '', adminUser) && safeEq(rest.join(':'), adminPassword)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="St. Mary content editor", charset="UTF-8"');
    return res.status(401).type('text').send('Sign-in required');
  };

  const adminApi = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: store.MAX_UPLOAD } });
  adminApi.use(requireAdmin);
  adminApi.get('/schema', (req, res) => res.json({
    collections: Object.entries(collections).map(([key, c]) => ({ key, ...c })),
    settings: settingsFields,
    translation: translationEnabled(),
  }));
  adminApi.get('/settings', wrap(async (req, res) => res.json(await store.getSettings())));
  adminApi.put('/settings', express.json({ limit: '1mb' }), wrap(async (req, res) =>
    res.json(await store.saveSettings(req.body))));
  adminApi.post('/upload', upload.single('file'), wrap(async (req, res) => {
    if (!req.file) throw new store.HttpError(400, 'Choose a file to upload');
    res.json({ url: await store.saveUpload(req.file) });
  }));
  adminApi.get('/:collection', wrap(async (req, res) =>
    res.json(await store.listRecords(req.params.collection))));
  adminApi.post('/:collection', express.json({ limit: '2mb' }), wrap(async (req, res) =>
    res.json(await store.saveRecord(req.params.collection, req.body))));
  adminApi.delete('/:collection/:id', wrap(async (req, res) => {
    await store.deleteRecord(req.params.collection, req.params.id);
    res.json({ ok: true });
  }));

  app.use('/admin/api', adminApi);
  app.use('/admin', requireAdmin, express.static(ADMIN_DIR, { index: 'index.html' }));

  // ---- public site ----
  const loadCtx = async (req, res) => {
    const lang = resolveLang(req, res);
    const [settings, pages] = await Promise.all([store.getSettings(), store.listRecords('pages')]);
    return {
      lang,
      t: { ...UI.en, ...UI[lang] },
      settings,
      pages: sortRecords(pages, 'order'),
      today: todayIn(settings.timezone),
    };
  };
  const send = (res, html) => res.type('html').send(html);

  app.get('/', wrap(async (req, res) => {
    const ctx = await loadCtx(req, res);
    const [mass, events, anns, ministries, bulletins, slides] = await Promise.all(
      ['mass_times', 'events', 'announcements', 'ministries', 'bulletins', 'slides'].map((n) => store.listRecords(n)),
    );
    send(res, views.home(ctx, {
      slides: sortRecords(slides.filter((x) => x.image && !x.hidden), 'order'),
      massTimes: sortRecords(mass, 'order'),
      events: upcomingEvents(events, ctx.today).slice(0, 3),
      announcements: activeAnnouncements(anns, ctx.today).slice(0, 3),
      ministries: sortRecords(ministries, 'order').slice(0, 3),
      bulletin: sortRecords(bulletins, 'date-desc')[0] ?? null,
    }));
  }));

  const listRoute = (urlPath, collection, build) => app.get(urlPath, wrap(async (req, res) => {
    const ctx = await loadCtx(req, res);
    send(res, build(ctx, await store.listRecords(collection), ctx));
  }));

  listRoute('/mass-times', 'mass_times', (ctx, items) => views.massTimesPage(ctx, sortRecords(items, 'order')));
  listRoute('/events', 'events', (ctx, items) => views.eventsPage(ctx, upcomingEvents(items, ctx.today)));
  listRoute('/announcements', 'announcements', (ctx, items) =>
    views.announcementsPage(ctx, activeAnnouncements(items, ctx.today)));
  listRoute('/ministries', 'ministries', (ctx, items) => views.ministriesPage(ctx, sortRecords(items, 'order')));
  listRoute('/bulletins', 'bulletins', (ctx, items) => views.bulletinsPage(ctx, sortRecords(items, 'date-desc')));
  listRoute('/staff', 'staff', (ctx, items) => views.staffPage(ctx, sortRecords(items, 'order')));

  // Any other address is a page made in the editor, e.g. /about
  app.get('/:slug', wrap(async (req, res, next) => {
    if (RESERVED_SLUGS.includes(req.params.slug)) return next();
    const page = await store.getRecord('pages', req.params.slug);
    if (!page) return next();
    send(res, views.pageView(await loadCtx(req, res), page));
  }));

  // ---- errors ----
  app.use((req, res, next) => next(Object.assign(new Error('Not found'), { status: 404 })));

  app.use(async (err, req, res, next) => { // eslint-disable-line no-unused-vars
    let status = err.status || err.statusCode || 500;
    let message = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = 'That file is too large (the limit is 15 MB)';
    }
    if (status >= 500) console.error(err);
    if (req.path.startsWith('/admin')) {
      return res.status(status).json({ error: status >= 500 ? 'Server error' : message });
    }
    let ctx;
    try {
      ctx = await loadCtx(req, res);
    } catch {
      ctx = { lang: 'en', t: UI.en, settings: {}, pages: [], today: todayIn() };
    }
    const html = status === 404 ? views.notFound(ctx) : views.errorPage(ctx);
    return res.status(status).type('html').send(html);
  });

  return app;
}
