import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { LOCALES } from './i18n.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Picks the text for a language. Plain strings are returned as they are.
export function pick(value, lang, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value[lang] || value.en || Object.values(value).find(Boolean) || fallback;
  }
  return String(value);
}

// Markdown from the editor, converted to HTML and cleaned so no script can get through.
export function markdown(src) {
  const html = marked.parse(String(src || ''), { gfm: true, async: false });
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
      'h2', 'h3', 'h4', 'blockquote', 'hr', 'img'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags: {
      h1: 'h2',
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          rel: 'noopener',
          ...(attribs.href && /^https?:/.test(attribs.href) ? { target: '_blank' } : {}),
        },
      }),
    },
  });
}

// "2026-12-25" -> "December 25, 2026" (no time-zone shift, the date stays as written)
export function fmtDate(iso, lang = 'en', opts = { month: 'long', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return new Intl.DateTimeFormat(LOCALES[lang] || 'en-US', { ...opts, timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

// Today's date as "YYYY-MM-DD" in the parish time zone.
export function todayIn(timeZone = 'America/New_York') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}
