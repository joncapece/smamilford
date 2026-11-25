// HTML for every public page. Everything from the editor goes through esc() or markdown().

import { LANG_OPTIONS, LANGS } from './schema.js';
import { WEEKDAYS } from './masses.js';
import { esc, pick, markdown, fmtDate } from './util.js';

const DEFAULT_NAME = 'Saint Mary of the Assumption';
const LANG_LABEL = Object.fromEntries(LANG_OPTIONS.map((o) => [o.value, o.label]));
const LANG_SHORT = { en: 'EN', es: 'ES', pt: 'PT' };

const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const txt = (ctx, v) => esc(pick(v, ctx.lang));
const img = (src, alt, cls) => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : '');

function site(ctx) {
  const { lang, settings } = ctx;
  return {
    name: pick(settings.parish_name, lang, DEFAULT_NAME),
    subtitle: pick(settings.parish_subtitle, lang, ''),
    tagline: pick(settings.tagline, lang, ''),
    welcome: markdown(pick(settings.welcome, lang, '')),
    giving: settings.giving_url || '',
    givingText: pick(settings.giving_text, lang, ''),
  };
}

const NAV = [
  ['/mass-times', 'massTimes'],
  ['/events', 'events'],
  ['/ministries', 'ministries'],
  ['/bulletins', 'bulletins'],
  ['/staff', 'staff'],
  ['/announcements', 'announcements'],
];

export function layout(ctx, { title, description = '', body, path = '/', image = '' }) {
  const { lang, t, settings, pages } = ctx;
  const s = site(ctx);
  const pageTitle = title ? `${title} · ${s.name}` : s.name;
  const desc = description || s.tagline || s.name;
  const current = (href) => (href === path ? ' aria-current="page"' : '');

  const navLinks = [
    ...NAV.map(([href, key]) => `<a href="${href}"${current(href)}>${esc(t[key])}</a>`),
    ...pages
      .filter((p) => p.nav)
      .map((p) => `<a href="/${esc(p.id)}"${current(`/${p.id}`)}>${esc(pick(p.title, lang))}</a>`),
  ].join('');

  const langLinks = LANGS.map((l) =>
    `<a href="${esc(path)}?lang=${l}" lang="${l}" hreflang="${l}"${l === lang ? ' aria-current="true"' : ''}>${LANG_SHORT[l]}</a>`,
  ).join('');

  const social = [['facebook_url', 'Facebook'], ['youtube_url', 'YouTube'], ['instagram_url', 'Instagram']]
    .filter(([k]) => settings[k])
    .map(([k, n]) => `<a href="${esc(settings[k])}" rel="noopener">${n}</a>`)
    .join('');

  const phoneDigits = String(settings.phone || '').replace(/[^+\d]/g, '');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${esc(image || '/img/emblem.webp')}">
<link rel="icon" href="/img/emblem.png" type="image/png">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<a class="skip-link" href="#main">${esc(t.skip)}</a>
<header class="site-header">
  <div class="utility">
    <div class="wrap">
      <nav class="lang-nav" aria-label="${esc(t.language)}">${langLinks}</nav>
    </div>
  </div>
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${esc(s.name)}: ${esc(t.home)}"><img src="/img/logo.webp" alt="${esc(s.name)}" width="300" height="100"></a>
    <input type="checkbox" id="nav-toggle" class="nav-toggle sr-only" aria-label="${esc(t.menu)}">
    <label for="nav-toggle" class="menu-btn" aria-hidden="true">${esc(t.menu)}</label>
    <nav class="main-nav" aria-label="Main">${navLinks}</nav>
  </div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <img src="/img/emblem.webp" alt="" width="96" height="96">
      <p class="footer-name">${esc(s.name)}</p>
      ${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}
      ${settings.other_names ? `<p class="muted">${esc(settings.other_names)}</p>` : ''}
    </div>
    <div>
      <h2>${esc(t.contact)}</h2>
      ${settings.address ? `<p>${nl2br(settings.address)}</p>` : ''}
      ${settings.phone ? `<p>${esc(t.phone)}: <a href="tel:${esc(phoneDigits)}">${esc(settings.phone)}</a></p>` : ''}
      ${settings.email ? `<p>${esc(t.email)}: <a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></p>` : ''}
    </div>
    ${settings.office_hours ? `<div><h2>${esc(t.officeHours)}</h2>${markdown(pick(settings.office_hours, lang, ''))}</div>` : ''}
    ${social ? `<div><h2>${esc(t.connect)}</h2><nav class="social" aria-label="Social">${social}</nav></div>` : ''}
  </div>
  <p class="wrap footer-legal">© ${new Date().getFullYear()} ${esc(s.name)}. ${esc(pick(settings.footer_note, lang, ''))} ${esc(t.rights)}</p>
</footer>
</body>
</html>`;
}

// ---- small pieces ---------------------------------------------------------

// What to call a Mass time: its date for one-time Masses, otherwise its weekday.
// Older entries that only have a free-text day keep showing that text.
function massLabel(ctx, m) {
  if (m.date) return fmtDate(m.date, ctx.lang, { weekday: 'long', month: 'long', day: 'numeric' });
  const i = WEEKDAYS.indexOf(m.weekday);
  if (i >= 0) return ctx.t.weekdays[i];
  return txt(ctx, m.day);
}

function massHome(ctx, sched) {
  const { t } = ctx;
  const timesCell = (masses) => `<ul class="sched-times">${masses.map((m) => `<li>` +
    `<span class="time">${esc(m.time || '')}</span>` +
    (m.language ? `<span class="tag">${esc(LANG_LABEL[m.language] || '')}</span>` : '') +
    (m.location ? `<span class="muted">${esc(m.location)}</span>` : '') +
    (m.note ? `<span class="muted">${txt(ctx, m.note)}</span>` : '') +
    '</li>').join('')}</ul>`;
  const rows = [
    ...sched.weekly.map((d) => `<tr><th scope="row">${esc(t.weekdays[WEEKDAYS.indexOf(d.weekday)])}</th><td>${timesCell(d.masses)}</td></tr>`),
    ...sched.special.map((m) => `<tr><th scope="row">${esc(massLabel(ctx, m))}</th><td>${timesCell([m])}</td></tr>`),
  ];
  return `<div class="section-head mass-head"><h2>${esc(t.massTimes)}</h2><a href="/mass-times">${esc(t.massSchedule)} →</a></div>
    ${rows.length
      ? `<div class="table-wrap"><table class="schedule">
  <thead><tr><th scope="col">${esc(t.day)}</th><th scope="col">${esc(t.time)}</th></tr></thead>
  <tbody>${rows.join('')}</tbody>
</table></div>`
      : empty(t.noMass)}`;
}

function eventItem(ctx, e, { full = false } = {}) {
  const { lang } = ctx;
  const when = [e.time, e.location].filter(Boolean).map(esc).join(' · ');
  const title = txt(ctx, e.title);
  return `<li class="event">
  <time datetime="${esc(e.date)}"><span class="mon">${esc(fmtDate(e.date, lang, { month: 'short' }))}</span><span class="day">${esc(fmtDate(e.date, lang, { day: 'numeric' }))}</span></time>
  <div>
    <h3>${e.link ? `<a href="${esc(e.link)}" rel="noopener">${title}</a>` : title}</h3>
    ${when ? `<p class="meta">${when}</p>` : ''}
    ${full && e.description ? `<div class="prose-sm">${markdown(pick(e.description, lang))}</div>` : ''}
    ${full ? img(e.image, pick(e.title, lang), 'event-img') : ''}
  </div>
</li>`;
}

function annItem(ctx, a) {
  return `<article class="note${a.pinned ? ' pinned' : ''}">
  <h3>${txt(ctx, a.title)}</h3>
  <time datetime="${esc(a.date)}">${esc(fmtDate(a.date, ctx.lang))}</time>
  ${a.body ? `<div class="prose-sm">${markdown(pick(a.body, ctx.lang))}</div>` : ''}
</article>`;
}

function ministryCard(ctx, m) {
  const { t } = ctx;
  return `<article class="card">
  ${img(m.image, pick(m.name, ctx.lang), 'card-img')}
  <h3>${txt(ctx, m.name)}</h3>
  ${m.meets ? `<p class="meta"><strong>${esc(t.meets)}:</strong> ${txt(ctx, m.meets)}</p>` : ''}
  ${m.description ? `<p>${nl2br(pick(m.description, ctx.lang))}</p>` : ''}
  ${m.contact_name || m.contact_email ? `<p class="meta"><strong>${esc(t.contactPerson)}:</strong> ${esc(m.contact_name || '')}${m.contact_email ? ` · <a href="mailto:${esc(m.contact_email)}">${esc(m.contact_email)}</a>` : ''}</p>` : ''}
</article>`;
}

function staffCard(ctx, p) {
  return `<article class="card person">
  ${p.image ? img(p.image, p.name, 'person-photo') : ''}
  <h3>${esc(p.name)}</h3>
  ${p.role ? `<p class="role">${txt(ctx, p.role)}</p>` : ''}
  ${p.email ? `<p><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></p>` : ''}
  ${p.phone ? `<p>${esc(p.phone)}</p>` : ''}
</article>`;
}

function bulletinRow(ctx, b) {
  return `<li>
  <div><h3>${txt(ctx, b.title)}</h3><time datetime="${esc(b.date)}" class="muted">${esc(fmtDate(b.date, ctx.lang))}</time></div>
  ${b.file ? `<a class="btn btn-navy btn-small" href="${esc(b.file)}" target="_blank" rel="noopener">${esc(ctx.t.download)}</a>` : ''}
</li>`;
}

const pageHead = (title, intro = '') =>
  `<section class="page-head"><div class="wrap"><h1>${esc(title)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}</div></section>`;
const section = (inner, cls = '') => `<section class="section ${cls}"><div class="wrap">${inner}</div></section>`;
const empty = (text) => `<p class="empty">${esc(text)}</p>`;

// ---- pages ----------------------------------------------------------------


// Home page photos: each one fades in and out in turn. Pure CSS, so it works without JavaScript.
// With reduced motion on, only the first photo is shown.
const SLIDE_SECONDS = 6;
function heroSlides(ctx, slides) {
  const n = slides.length;
  const total = n * SLIDE_SECONDS;
  const w = 100 / n;
  const f = Math.min(4, w / 4);
  const keyframes = `@keyframes rot-${n}{0%{opacity:0}${f}%{opacity:1}${w - f}%{opacity:1}${w}%{opacity:0}100%{opacity:0}}`;
  const items = slides.map((sl, i) => {
    const alt = pick(sl.title, ctx.lang) || pick(ctx.settings.parish_name, ctx.lang, '');
    const img = `<img src="${esc(sl.image)}" alt="${esc(alt)}" loading="${i === 0 ? 'eager' : 'lazy'}">`;
    const inner = sl.link ? `<a href="${esc(sl.link)}"${/^https?:/.test(sl.link) ? ' rel="noopener"' : ''}>${img}</a>` : img;
    const heading = pick(sl.caption_heading, ctx.lang);
    const body = pick(sl.caption_body, ctx.lang);
    const caption = heading || body
      ? `<div class="slide-caption">${heading ? `<h2>${esc(heading)}</h2>` : ''}${body ? `<p>${nl2br(body)}</p>` : ''}</div>`
      : '';
    const anim = n > 1 ? ` style="animation:rot-${n} ${total}s linear ${i * SLIDE_SECONDS}s infinite"` : ' style="opacity:1"';
    return `<div class="slide"${anim}>${inner}${caption}</div>`;
  }).join('');
  return `<style>${keyframes}</style><div class="slides" aria-live="off">${items}</div>`;
}

// Photos fill the whole hero block behind the text; the emblem shows when there are none.
function heroBackground(ctx, slides) {
  if (!slides.length) return '';
  return `<div class="hero-bg">${heroSlides(ctx, slides)}</div>`;
}

function heroVisual(ctx, slides) {
  if (!slides.length) {
    return '<div class="hero-emblem"><img src="/img/emblem.webp" alt="" width="520" height="520"></div>';
  }
  return '';
}

export function home(ctx, d) {
  const { t, lang, settings } = ctx;
  const s = site(ctx);
  const body = `
<section class="hero" aria-labelledby="hero-title">
  ${heroBackground(ctx, d.slides || [])}
  <div class="wrap hero-inner">
    <div class="hero-text">
      ${s.tagline ? `<p class="eyebrow">${esc(s.tagline)}</p>` : ''}
      <h1 id="hero-title">${esc(s.name)}</h1>
      ${s.subtitle ? `<p class="subtitle">${esc(s.subtitle)}</p>` : ''}
      ${settings.other_names ? `<p class="other-names">${esc(settings.other_names)}</p>` : ''}
      <div class="lead">${s.welcome}</div>
      <div class="cta-row">
        <a class="btn btn-gold" href="/mass-times">${esc(t.massTimes)}</a>
        ${s.giving ? `<a class="btn btn-outline" href="${esc(s.giving)}" rel="noopener">${esc(t.giveOnline)}</a>` : ''}
        <a class="btn btn-outline" href="/events">${esc(t.events)}</a>
      </div>
    </div>
    ${heroVisual(ctx, d.slides || [])}
  </div>
</section>
<div class="fleur" aria-hidden="true"><span></span><i></i><span></span></div>

${section(massHome(ctx, d.massTimes))}

${section(`<div class="grid-2">
  <div class="card">
    <h2>${esc(t.upcomingEvents)}</h2>
    ${d.events.length ? `<ul class="event-list">${d.events.map((e) => eventItem(ctx, e)).join('')}</ul>` : empty(t.noEvents)}
    <p><a href="/events">${esc(t.viewAll)} →</a></p>
  </div>
  <div class="card">
    <h2>${esc(t.latestAnnouncements)}</h2>
    ${d.announcements.length ? d.announcements.map((a) => annItem(ctx, a)).join('') : empty(t.noAnnouncements)}
    <p><a href="/announcements">${esc(t.viewAll)} →</a></p>
  </div>
</div>`)}

${d.bulletin ? section(`<div class="card latest">
  <div>
    <p class="eyebrow dark">${esc(t.latestBulletin)}</p>
    <h2>${txt(ctx, d.bulletin.title)}</h2>
    <p class="muted">${esc(fmtDate(d.bulletin.date, lang))}</p>
  </div>
  ${d.bulletin.file ? `<a class="btn btn-navy" href="${esc(d.bulletin.file)}" target="_blank" rel="noopener">${esc(t.download)}</a>` : ''}
</div>`) : ''}

${d.ministries.length ? section(`<div class="section-head"><h2>${esc(t.ministriesTitle)}</h2><a href="/ministries">${esc(t.viewAll)} →</a></div>
  <div class="grid-3">${d.ministries.map((m) => ministryCard(ctx, m)).join('')}</div>`, 'alt') : ''}

${s.giving ? `<section class="band"><div class="wrap">
  <h2>${esc(t.giveTitle)}</h2>
  ${s.givingText ? `<p>${nl2br(s.givingText)}</p>` : ''}
  <a class="btn btn-gold" href="${esc(s.giving)}" rel="noopener">${esc(t.giveOnline)}</a>
</div></section>` : ''}`;
  return layout(ctx, { body, path: '/', description: s.tagline || s.name });
}

export function massTimesPage(ctx, items) {
  const { t } = ctx;
  const groups = [
    { title: t.lordsDay, items: items.filter((m) => m.section !== 'weekday') },
    { title: t.weekdayLiturgies, items: items.filter((m) => m.section === 'weekday') },
  ].filter((g) => g.items.length);
  const tables = groups.map((g) => `<h2 class="mass-group">${esc(g.title)}</h2>
<div class="table-wrap"><table>
  <thead><tr>
    <th scope="col">${esc(t.day)}</th><th scope="col">${esc(t.time)}</th><th scope="col">${esc(t.language)}</th><th scope="col">${esc(t.place)}</th><th scope="col">${esc(t.note)}</th>
  </tr></thead>
  <tbody>${g.items.map((m) => `<tr>
    <td>${esc(massLabel(ctx, m))}</td><td>${esc(m.time || '')}</td><td>${esc(LANG_LABEL[m.language] || '')}</td><td>${esc(m.location || '')}</td><td>${txt(ctx, m.note)}</td>
  </tr>`).join('')}</tbody>
</table></div>`).join('');
  return layout(ctx, { title: t.massTimes, path: '/mass-times', body: pageHead(t.massTimes) + section(tables || empty(t.noMass)) });
}

export function eventsPage(ctx, items) {
  const body = items.length
    ? `<ul class="event-list event-list-full">${items.map((e) => eventItem(ctx, e, { full: true })).join('')}</ul>`
    : empty(ctx.t.noEvents);
  return layout(ctx, { title: ctx.t.events, path: '/events', body: pageHead(ctx.t.events) + section(body) });
}

export function announcementsPage(ctx, items) {
  const body = items.length ? items.map((a) => annItem(ctx, a)).join('') : empty(ctx.t.noAnnouncements);
  return layout(ctx, { title: ctx.t.announcements, path: '/announcements', body: pageHead(ctx.t.announcements) + section(body) });
}

export function ministriesPage(ctx, items) {
  const body = items.length
    ? `<div class="grid-3">${items.map((m) => ministryCard(ctx, m)).join('')}</div>`
    : empty(ctx.t.noMinistries);
  return layout(ctx, { title: ctx.t.ministries, path: '/ministries', body: pageHead(ctx.t.ministries) + section(body) });
}

export function bulletinsPage(ctx, items) {
  // Embed code from settings replaces the uploaded bulletin list when it is filled in.
  const embed = ctx.settings?.bulletin_embed;
  const body = embed
    ? `<div class="bulletin-embed">${embed}</div>`
    : items.length
      ? `<ul class="bulletins">${items.map((b) => bulletinRow(ctx, b)).join('')}</ul>`
      : empty(ctx.t.noBulletins);
  return layout(ctx, { title: ctx.t.bulletins, path: '/bulletins', body: pageHead(ctx.t.bulletins) + section(body) });
}

export function staffPage(ctx, items) {
  const body = items.length
    ? `<div class="grid-3">${items.map((p) => staffCard(ctx, p)).join('')}</div>`
    : empty(ctx.t.noStaff);
  return layout(ctx, { title: ctx.t.staff, path: '/staff', body: pageHead(ctx.t.staff) + section(body) });
}

export function pageView(ctx, page) {
  const title = pick(page.title, ctx.lang);
  const banner = page.image ? `<img class="banner" src="${esc(page.image)}" alt="${esc(title)}" loading="eager">` : '';
  const content = `${banner}<div class="prose">${markdown(pick(page.body, ctx.lang))}</div>`;
  return layout(ctx, { title, path: `/${page.id}`, image: page.image, body: pageHead(title) + section(content) });
}

export function notFound(ctx) {
  return layout(ctx, {
    title: ctx.t.notFoundTitle,
    body: pageHead(ctx.t.notFoundTitle, ctx.t.notFoundText) +
      section(`<p><a class="btn btn-navy" href="/">${esc(ctx.t.backHome)}</a></p>`),
  });
}

export function errorPage(ctx) {
  return layout(ctx, {
    title: ctx.t.errorTitle,
    body: pageHead(ctx.t.errorTitle, ctx.t.errorText),
  });
}
