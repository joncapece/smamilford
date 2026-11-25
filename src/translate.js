// Automatic translation of English text into Spanish and Portuguese, using DeepL.
//
// Turned on by setting DEEPL_API_KEY in the server's environment (never in the content files).
// Without a key, nothing is translated and the English text is shown everywhere it is missing.
//
// Rules:
// - Only blank Spanish/Portuguese boxes are filled in. Text a person typed is never overwritten.
// - Machine translations are remembered in the record (`_auto`), so the editor shows them
//   as "auto-translated: check". If a person edits one, it becomes theirs and is kept.
// - If the English changes, the machine translation for that field is redone.

export const TARGETS = ['es', 'pt'];
const DEEPL_CODE = { es: 'ES', pt: 'PT-BR' };
const LANG_NAME = { es: 'Spanish', pt: 'Portuguese' };

let customTranslator = null; // used by the tests

export function setTranslator(fn) {
  customTranslator = fn;
}

export function translationEnabled() {
  return Boolean(customTranslator || process.env.DEEPL_API_KEY);
}

async function deepl(texts, lang) {
  const key = process.env.DEEPL_API_KEY;
  // Free-plan keys end in ":fx" and must use the free endpoint.
  const defaultUrl = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const url = `${process.env.DEEPL_API_URL || defaultUrl}/v2/translate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `DeepL-Auth-Key ${key}`,
    },
    body: JSON.stringify({ text: texts, source_lang: 'EN', target_lang: DEEPL_CODE[lang] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`the translation service answered ${res.status}`);
  const data = await res.json();
  return data.translations.map((t) => t.text);
}

const translateTexts = (texts, lang) => (customTranslator ?? deepl)(texts, lang);

// What needs translating for one field: which languages to fill, and which
// existing machine translations are still good.
function plan(field, record, prev) {
  const en = record[field.key]?.en;
  const out = { need: [], keep: {} };
  if (!en) return out;
  for (const lang of TARGETS) {
    const cur = record[field.key][lang] ?? '';
    const old = prev?._auto?.[field.key]?.[lang]; // { src, text } from the last machine translation
    if (cur && !(old && old.text === cur)) continue; // typed by a person
    if (cur && old.src === en) {
      out.keep[lang] = old; // machine translation, English unchanged
      continue;
    }
    out.need.push(lang);
  }
  return out;
}

// Fills in missing translations on `record` (in place). Returns warnings for the editor.
export async function fillTranslations(fields, record, prev) {
  const warnings = [];
  const auto = {};
  const jobs = {}; // lang -> [{ field, en }]

  for (const field of fields.filter((f) => f.i18n)) {
    const { need, keep } = plan(field, record, prev);
    for (const [lang, old] of Object.entries(keep)) {
      (auto[field.key] ??= {})[lang] = old;
    }
    if (!translationEnabled()) continue;
    for (const lang of need) {
      (jobs[lang] ??= []).push({ field, en: record[field.key].en });
    }
  }

  for (const [lang, items] of Object.entries(jobs)) {
    try {
      const out = await translateTexts(items.map((i) => i.en), lang);
      items.forEach((item, i) => {
        const key = item.field.key;
        record[key] = { ...record[key], [lang]: out[i] };
        (auto[key] ??= {})[lang] = { src: item.en, text: out[i] };
      });
    } catch (err) {
      console.error(`Automatic translation to ${LANG_NAME[lang]} failed:`, err.message);
      warnings.push(`Automatic ${LANG_NAME[lang]} translation failed (${err.message}). Please type it in, or try saving again.`);
    }
  }

  if (Object.keys(auto).length) record._auto = auto;
  else delete record._auto;
  return warnings;
}
