import express from 'express';
import path from 'node:path';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { UI } from './i18n.js';
import { LANGS, collections, settingsFields, RESERVED_SLUGS } from './schema.js';
import { homeSchedule, liveMass } from './masses.js';
import * as store from './content.js';
import * as views from './views.js';
import { translationEnabled } from './translate.js';
import { createAuth, SESSION_COOKIE } from './auth.js';
import { entraConfig, loginUrl, finishLogin } from './entra.js';
import { markdown, pick, todayIn } from './util.js';

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

// Text in the editor is shown as HTML, so the rich text editor can display it.
// Older records hold Markdown, which is converted here. Saving stores HTML.
function toEditable(fields, record) {
  const out = { ...record };
  for (const f of fields) {
    if (f.type !== 'markdown' || out[f.key] == null) continue;
    out[f.key] = f.i18n
      ? Object.fromEntries(Object.entries(out[f.key]).map(([l, v]) => [l, markdown(v)]))
      : markdown(out[f.key]);
  }
  return out;
}

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
    res.set('Vary', 'Cookie, Accept-Language, Authorization');
    next();
  });

  app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), { maxAge: '1d' }));
  app.use('/img', express.static(path.join(PUBLIC_DIR, 'img'), { maxAge: '7d' }));
  app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), { maxAge: '1d' }));
  app.use('/js/vendor', express.static(path.join(ROOT, 'node_modules', 'hls.js', 'dist'), { maxAge: '7d' }));
  app.use('/uploads', express.static(store.UPLOAD_DIR, { maxAge: '1d', index: false, dotfiles: 'ignore' }));
  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ---- admin (password protected) ----
  const accounts = createAuth({ adminUser, adminPassword });
  // Only send people back to a path on this site after signing in.
  const safeNext = (v) => (typeof v === 'string' && /^\/(?![\/\\])/.test(v) ? v : '/');
  const sessionCookie = (req, value, maxAge) =>
    `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`;
  const entraFor = (req) => entraConfig(process.env, `${req.protocol}://${req.get('host')}`);

  // Editor API: a signed-in person, else a JSON error.
  const apiAuth = wrap(async (req, res, next) => {
    const user = await accounts.currentUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to edit the website.' });
    req.user = user;
    return next();
  });
  // Editor pages: a signed-in person, else the sign-in page.
  const pageAuth = wrap(async (req, res, next) => {
    const user = await accounts.currentUser(req);
    if (!user) return res.redirect(`/sign-in?next=${encodeURIComponent(req.originalUrl)}`);
    req.user = user;
    return next();
  });

  const adminApi = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: store.MAX_UPLOAD } });
  adminApi.use(apiAuth);
  adminApi.get('/me', (req, res) => res.json({ name: req.user.name, role: req.user.role }));
  adminApi.get('/schema', wrap(async (req, res) => {
    const pages = sortRecords(await store.listRecords('pages'), 'order');
    const pageOptions = [
      { value: '', label: 'None (main page)' },
      ...pages.map((p) => ({ value: p.id, label: `${pick(p.title, 'en') || p.id} (${p.id})` })),
    ];
    res.json({
      collections: Object.entries(collections).map(([key, c]) => ({
        key,
        ...c,
        fields: c.fields.map((f) => (f.optionsFrom === 'pages' ? { ...f, options: pageOptions } : f)),
      })),
      settings: settingsFields,
      translation: translationEnabled(),
    });
  }));
  adminApi.get('/settings', wrap(async (req, res) => res.json(toEditable(settingsFields, await store.getSettings()))));
  adminApi.put('/settings', express.json({ limit: '1mb' }), wrap(async (req, res) =>
    res.json(await store.saveSettings(req.body))));
  adminApi.post('/upload', upload.single('file'), wrap(async (req, res) => {
    if (!req.file) throw new store.HttpError(400, 'Choose a file to upload');
    res.json({ url: await store.saveUpload(req.file) });
  }));
  adminApi.get('/:collection', wrap(async (req, res) => {
    const c = store.assertCollection(req.params.collection);
    res.json((await store.listRecords(req.params.collection)).map((r) => toEditable(c.fields, r)));
  }));
  adminApi.post('/:collection', express.json({ limit: '2mb' }), wrap(async (req, res) =>
    res.json(await store.saveRecord(req.params.collection, req.body))));
  adminApi.delete('/:collection/:id', wrap(async (req, res) => {
    await store.deleteRecord(req.params.collection, req.params.id);
    res.json({ ok: true });
  }));

  app.use('/admin/api', adminApi);
  app.use('/admin/vendor', pageAuth, express.static(path.join(ROOT, 'node_modules', 'quill', 'dist'), { maxAge: '7d' }));
  app.use('/admin/vendor', pageAuth, express.static(path.join(ROOT, 'node_modules', 'quill-better-table', 'dist'), { maxAge: '7d' }));
  app.use('/admin', pageAuth, express.static(ADMIN_DIR, { index: 'index.html' }));

  // ---- public site ----
  const loadCtx = async (req, res) => {
    const lang = resolveLang(req, res);
    const [settings, pages, user] = await Promise.all([
      store.getSettings(), store.listRecords('pages'), accounts.currentUser(req),
    ]);
    return {
      lang,
      t: { ...UI.en, ...UI[lang] },
      settings,
      pages: sortRecords(pages, 'order'),
      today: todayIn(settings.timezone),
      user, // signed-in staff see editing tools on the public pages
      editor: Boolean(user),
    };
  };
  // Pages differ for signed-in staff, so they must never be shared from a cache.
  const send = (res, html) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  };

  app.get('/', wrap(async (req, res) => {
    const ctx = await loadCtx(req, res);
    const [mass, events, anns, ministries, bulletins, slides] = await Promise.all(
      ['mass_times', 'events', 'announcements', 'ministries', 'bulletins', 'slides'].map((n) => store.listRecords(n)),
    );
    send(res, views.home(ctx, {
      slides: sortRecords(slides.filter((x) => x.image && !x.hidden), 'order'),
      massTimes: homeSchedule(mass, ctx.settings.timezone),
      live: liveMass(mass, ctx.settings.timezone),
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

  listRoute('/mass-times', 'mass_times', (ctx, items) => views.massTimesPage(ctx, items));
  app.get('/live-streaming', wrap(async (req, res) => send(res, views.liveStreamingPage(await loadCtx(req, res)))));
  app.get('/contact', wrap(async (req, res) => send(res, views.contactPage(await loadCtx(req, res)))));
  listRoute('/events', 'events', (ctx, items) => views.eventsPage(ctx, upcomingEvents(items, ctx.today)));
  listRoute('/announcements', 'announcements', (ctx, items) =>
    views.announcementsPage(ctx, activeAnnouncements(items, ctx.today)));
  listRoute('/ministries', 'ministries', (ctx, items) => views.ministriesPage(ctx, sortRecords(items, 'order')));
  listRoute('/bulletins', 'bulletins', (ctx, items) => views.bulletinsPage(ctx, sortRecords(items, 'date-desc')));
  listRoute('/staff', 'staff', (ctx, items) => views.staffPage(ctx, sortRecords(items, 'order')));

  // ---- staff sign-in ----
  const signInView = async (req, res, extra = {}) => send(res, views.signInPage(await loadCtx(req, res), {
    next: safeNext(req.query.next ?? req.body?.next), entraReady: Boolean(entraFor(req)), ...extra,
  }));
  app.get('/sign-in', wrap(async (req, res) => signInView(req, res)));
  app.get('/auth/entra', wrap(async (req, res) => {
    const cfg = entraFor(req);
    if (!cfg) return res.redirect('/sign-in');
    return res.redirect(loginUrl(cfg, safeNext(req.query.next)));
  }));
  app.get('/auth/callback', wrap(async (req, res) => {
    if (req.query.error) return signInView(req, res, { error: 'Microsoft sign-in was cancelled. Try again when you are ready.' });
    const cfg = entraFor(req);
    if (!cfg) return res.redirect('/sign-in');
    let person;
    try {
      person = await finishLogin(cfg, { code: req.query.code, state: req.query.state });
    } catch (err) {
      return signInView(req, res, { error: err.message });
    }
    const token = await accounts.startSession(person);
    res.set('Set-Cookie', sessionCookie(req, token, 12 * 3600));
    return res.redirect(person.next);
  }));
  app.post('/sign-in/owner', express.urlencoded({ extended: false }), wrap(async (req, res) => {
    const result = accounts.ownerLogin(req.body.username, req.body.password, req.ip);
    if (result.error) return signInView(req, res, { error: result.error });
    const token = await accounts.startSession(result.person);
    res.set('Set-Cookie', sessionCookie(req, token, 12 * 3600));
    return res.redirect(safeNext(req.body.next));
  }));
  app.post('/sign-out', wrap(async (req, res) => {
    await accounts.endSession(req);
    res.set('Set-Cookie', sessionCookie(req, '', 0));
    return res.redirect('/');
  }));

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
      ctx = { lang: 'en', t: UI.en, settings: {}, pages: [], today: todayIn(), user: null, editor: false };
    }
    const html = status === 404 ? views.notFound(ctx) : views.errorPage(ctx);
    res.set('Cache-Control', 'no-cache');
    return res.status(status).type('html').send(html);
  });

  return app;
}
