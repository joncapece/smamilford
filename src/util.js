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

// Table cell attributes written by the editor (rows, spans and shading).
const TABLE_CELL_ATTRS = ['colspan', 'rowspan', 'style', 'data-row', 'data-cell', 'data-rowspan', 'data-colspan', 'data-cell-bg'];

// Markdown from the editor, converted to HTML and cleaned so no script can get through.
export function markdown(src) {
  const html = marked.parse(String(src || ''), { gfm: true, async: false });
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
      'h2', 'h3', 'h4', 'blockquote', 'hr', 'img',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col'],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      table: ['style'],
      col: ['style', 'width'],
      colgroup: ['style'],
      td: TABLE_CELL_ATTRS,
      th: TABLE_CELL_ATTRS,
      tr: ['data-row'],
    },
    allowedStyles: {
      '*': {
        'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^[a-z]+$/],
        width: [/^\d+(\.\d+)?(px|%|em|rem)$/],
      },
    },
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
