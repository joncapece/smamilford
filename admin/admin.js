// Content editor. Builds its forms from the schema the server sends, so new fields
// added in src/schema.js appear here automatically.

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LANGS = [['en', 'English'], ['es', 'Español'], ['pt', 'Português']];
const pickText = (v) => (typeof v === 'string' ? v : v?.en || v?.es || v?.pt || '');
const main = () => $('#main');

let schema = null;
const collection = (key) => schema.collections.find((c) => c.key === key);
const fieldLabel = (c, key) => c.fields.find((f) => f.key === key)?.label || key;

async function api(url, opts = {}) {
  const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
  if (opts.form) {
    init.body = opts.form;
  } else if (opts.json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.json);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `show${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), 4000);
}

// ---- navigation -----------------------------------------------------------

function renderNav() {
  const current = location.hash.slice(1);
  const items = schema.collections.map((c) => ({ href: `#c/${c.key}`, label: c.label, key: `c/${c.key}` }));
  items.push({ href: '#settings', label: 'Site settings', key: 'settings' });
  $('#side').innerHTML = `<ul>${items.map((i) =>
    `<li><a href="${i.href}" ${current === i.key || current.startsWith(`${i.key}/`) ? 'aria-current="page"' : ''}>${esc(i.label)}</a></li>`).join('')}</ul>`;
}

async function route() {
  renderNav();
  const [kind, name, id] = location.hash.slice(1).split('/');
  main().innerHTML = '<p class="loading">Loading…</p>';
  try {
    if (kind === 'settings') return await renderSettings();
    if (kind === 'c' && collection(name)) {
      if (id === undefined) return await renderList(name);
      if (id === 'new') return renderForm(name, null);
      const items = await api(`api/${name}`);
      const rec = items.find((r) => r.id === decodeURIComponent(id));
      return rec ? renderForm(name, rec) : renderList(name);
    }
    location.hash = `#c/${schema.collections[0].key}`;
  } catch (err) {
    main().innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

// ---- lists ----------------------------------------------------------------

const SORT = {
  order: (a, b) => (a.order ?? 9999) - (b.order ?? 9999) || pickText(a.title ?? a.name ?? a.day).localeCompare(pickText(b.title ?? b.name ?? b.day)),
  'date-asc': (a, b) => (a.date || '').localeCompare(b.date || ''),
  'date-desc': (a, b) => (b.date || '').localeCompare(a.date || ''),
};

async function renderList(name) {
  const c = collection(name);
  const items = (await api(`api/${name}`)).sort(SORT[c.sortBy] || SORT.order);
  const cell = (r, key) => {
    const f = c.fields.find((x) => x.key === key);
    let v = r[key];
    if (f?.type === 'select') v = f.options?.find((o) => o.value === v)?.label ?? v;
    if (typeof v === 'boolean') return v ? 'Yes' : '';
    return esc(pickText(v));
  };
  main().innerHTML = `
    <div class="head"><h1>${esc(c.label)}</h1><a class="btn" href="#c/${name}/new">+ Add ${esc(c.singular)}</a></div>
    ${items.length ? `<div class="table-wrap"><table>
      <thead><tr>${c.list.map((k) => `<th scope="col">${esc(fieldLabel(c, k))}</th>`).join('')}<th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${items.map((r) => `<tr>
        ${c.list.map((k) => `<td>${cell(r, k)}</td>`).join('')}
        <td class="actions"><a href="#c/${name}/${encodeURIComponent(r.id)}">Edit</a><button class="danger" data-del="${esc(r.id)}">Delete</button></td>
      </tr>`).join('')}</tbody>
    </table></div>` : `<p class="empty">Nothing here yet. Use “Add” to create the first one.</p>`}`;

  main().querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm(`Delete this ${c.singular}? This cannot be undone.`)) return;
    try {
      await api(`api/${name}/${encodeURIComponent(btn.dataset.del)}`, { method: 'DELETE' });
      toast('Deleted.');
      renderList(name);
    } catch (err) {
      toast(err.message, true);
    }
  }));
}

// ---- rich text ------------------------------------------------------------

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline'],
  ['link', 'image'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote'],
  ['clean'],
];
const rteField = (name, value) =>
  `<div class="rte-wrap"><div class="rte" data-name="${esc(name)}"></div></div><textarea name="${esc(name)}" hidden>${esc(value)}</textarea>`;

// Toolbar "photo" button: choose a file, describe it, and place it in the text.
function insertPhoto(quill) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/gif';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { url } = await api('api/upload', { method: 'POST', form: fd });
      const alt = window.prompt('Describe this photo for people who cannot see it. Leave blank if it is only decoration.', '') ?? '';
      const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
      quill.insertEmbed(range.index, 'image', url, 'user');
      const img = [...quill.root.querySelectorAll('img')].reverse().find((i) => i.getAttribute('src') === url);
      if (img) img.setAttribute('alt', alt.trim());
      quill.setSelection(range.index + 1, 0);
      toast('Photo added. Save the page to publish it.');
    } catch (err) {
      toast(err.message, true);
    }
  });
  input.click();
}

function initEditors(root) {
  root.querySelectorAll('.rte').forEach((el) => {
    const ta = root.querySelector(`textarea[name="${el.dataset.name}"]`);
    const q = new Quill(el, {
      theme: 'snow',
      modules: { toolbar: { container: TOOLBAR, handlers: { image() { insertPhoto(this.quill); } } } },
    });
    q.clipboard.dangerouslyPasteHTML(ta?.value || '', 'silent');
    el._quill = q;
  });
}

function syncEditors(root) {
  root.querySelectorAll('.rte').forEach((el) => {
    const ta = root.querySelector(`textarea[name="${el.dataset.name}"]`);
    const html = el._quill.root.innerHTML;
    ta.value = html === '<p><br></p>' ? '' : html;
  });
}

// ---- forms ----------------------------------------------------------------

function previewHtml(type, val) {
  if (!val) return '';
  if (type === 'image') return `<img class="thumb" src="${esc(val)}" alt="">`;
  return `<a href="${esc(val)}" target="_blank" rel="noopener">Open file ↗</a>`;
}

function fieldHtml(f, val, opts) {
  const help = f.help ? `<small class="help">${esc(f.help)}</small>` : '';
  const label = `${esc(f.label)}${f.required ? ' <span aria-hidden="true">*</span>' : ''}`;

  if (f.i18n && schema.translation) {
    // Translation is on: people type English only. Spanish and Portuguese are kept as hidden
    // values, so saving doesn't re-translate text that hasn't changed.
    const obj = typeof val === 'string' ? { en: val } : val || {};
    const multiline = f.type === 'markdown' || f.type === 'textarea';
    const control = f.type === 'markdown'
      ? rteField(`${f.key}.en`, obj.en)
      : multiline
        ? `<textarea name="${f.key}.en" rows="${f.type === 'markdown' ? 6 : 3}" lang="en">${esc(obj.en)}</textarea>`
        : `<input type="text" name="${f.key}.en" value="${esc(obj.en)}" lang="en"${f.required ? ' required' : ''}>`;
    const hidden = ['es', 'pt'].map((l) => `<input type="hidden" name="${f.key}.${l}" value="${esc(obj[l])}">`).join('');
    return `<fieldset class="i18n"><legend>${label}</legend>${help}<div class="lang-field one"><span>English</span>${control}</div><p class="help">Spanish and Portuguese are filled in automatically when you save.</p>${hidden}</fieldset>`;
  }

  if (f.i18n) {
    const obj = typeof val === 'string' ? { en: val } : val || {};
    const multiline = f.type === 'markdown' || f.type === 'textarea';
    const autoNote = (l) => (obj[l] && opts.auto?.[l] ? ' <em class="auto">auto-translated: please check</em>' : '');
    const inputs = LANGS.map(([l, name]) => `<div class="lang-field"><span>${name}${autoNote(l)}</span>${f.type === 'markdown'
      ? rteField(`${f.key}.${l}`, obj[l])
      : multiline
        ? `<textarea name="${f.key}.${l}" rows="${f.type === 'markdown' ? 6 : 3}" lang="${l}">${esc(obj[l])}</textarea>`
        : `<input type="text" name="${f.key}.${l}" value="${esc(obj[l])}" lang="${l}"${f.required && l === 'en' ? ' required' : ''}>`}</div>`).join('');
    return `<fieldset class="i18n"><legend>${label}</legend>${help}${inputs}</fieldset>`;
  }

  if (f.type === 'boolean') {
    return `<div class="field"><label class="check"><input type="checkbox" name="${f.key}" ${val ? 'checked' : ''}> ${label}</label>${help}</div>`;
  }

  const id = `f-${f.key}`;
  const req = f.required ? ' required' : '';
  let control;
  if (f.type === 'markdown') {
    control = rteField(f.key, val);
  } else if (f.type === 'textarea') {
    control = `<textarea id="${id}" name="${f.key}" rows="3">${esc(val)}</textarea>`;
  } else if (f.type === 'select') {
    control = `<select id="${id}" name="${f.key}">${(f.options || []).map((o) =>
      `<option value="${esc(o.value)}" ${o.value === val ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else if (f.type === 'image' || f.type === 'file') {
    const accept = f.type === 'image' ? 'image/*' : 'application/pdf';
    control = `<div class="upload">
        <input id="${id}" name="${f.key}" type="text" value="${esc(val)}" placeholder="Paste a link, or upload a file →"${req}>
        <button type="button" class="btn-small" data-upload="${f.key}">Upload</button>
        <input type="file" id="file-${f.key}" accept="${accept}" class="sr-only" tabindex="-1">
      </div>
      <div class="preview" id="prev-${f.key}" data-type="${f.type}">${previewHtml(f.type, val)}</div>`;
  } else {
    const typeAttr = { date: 'date', number: 'number', email: 'email', url: 'url' }[f.type] || 'text';
    const readonly = f.type === 'slug' && opts.lockSlug ? ' readonly' : '';
    control = `<input id="${id}" name="${f.key}" type="${typeAttr}" value="${esc(val ?? '')}"${req}${readonly}>`;
  }
  return `<div class="field"><label for="${id}">${label}</label>${help}${control}</div>`;
}

const fieldsHtml = (fields, values, opts = {}) => fields.map((f) => fieldHtml(f, values[f.key], { ...opts, auto: values._auto?.[f.key] || {} })).join('');

function collectForm(fields, form) {
  const data = {};
  for (const f of fields) {
    if (f.i18n) {
      data[f.key] = {};
      for (const [l] of LANGS) data[f.key][l] = form.elements[`${f.key}.${l}`].value;
    } else if (f.type === 'boolean') {
      data[f.key] = form.elements[f.key].checked;
    } else {
      data[f.key] = form.elements[f.key].value;
    }
  }
  return data;
}

function bindForm(form, fields, onSave) {
  initEditors(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      syncEditors(form);
      await onSave(collectForm(fields, form));
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  });

  form.querySelectorAll('[data-upload]').forEach((b) =>
    b.addEventListener('click', () => form.querySelector(`#file-${b.dataset.upload}`).click()));

  form.querySelectorAll('input[type=file]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const key = input.id.replace('file-', '');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { url } = await api('api/upload', { method: 'POST', form: fd });
      form.elements[key].value = url;
      const prev = form.querySelector(`#prev-${key}`);
      prev.innerHTML = previewHtml(prev.dataset.type, url);
      toast('Uploaded. Save the form to publish it.');
    } catch (err) {
      toast(err.message, true);
    }
    input.value = '';
  }));
}

function renderForm(name, record) {
  const c = collection(name);
  const isNew = !record;
  main().innerHTML = `
    <div class="head"><h1>${isNew ? 'New' : 'Edit'} ${esc(c.singular)}</h1><a href="#c/${name}">← Back to ${esc(c.label)}</a></div>
    <form id="rec" novalidate>
      ${fieldsHtml(c.fields, record || {}, { lockSlug: !isNew && c.idField === 'slug' })}
      <div class="actions-bar"><button type="submit">Save</button><a href="#c/${name}">Cancel</a></div>
    </form>`;
  bindForm($('#rec'), c.fields, async (data) => {
    const r = await api(`api/${name}`, { method: 'POST', json: isNew ? data : { ...data, id: record.id } });
    if (r.warnings?.length) toast(r.warnings.join(' '), true);
    else toast('Saved. The website is updated.');
    location.hash = `#c/${name}`;
  });
}

async function renderSettings() {
  const values = await api('api/settings');
  main().innerHTML = `
    <div class="head"><h1>Site settings</h1></div>
    <p class="help-lead">These details appear across the whole website: the header, the footer and the home page.</p>
    <p class="help-lead">${schema.translation
      ? 'Automatic translation is <strong>on</strong>: blank Spanish and Portuguese boxes are filled in from the English when you save. Check them, and edit as needed.'
      : 'Automatic translation is <strong>off</strong>. Fill in each language yourself, or ask the web team to add a translation key.'}</p>
    <form id="rec" novalidate>
      ${fieldsHtml(schema.settings, values)}
      <div class="actions-bar"><button type="submit">Save settings</button></div>
    </form>`;
  bindForm($('#rec'), schema.settings, async (data) => {
    const r = await api('api/settings', { method: 'PUT', json: data });
    if (r.warnings?.length) toast(r.warnings.join(' '), true);
    else toast('Settings saved.');
    renderSettings();
  });
}

// ---- start ----------------------------------------------------------------

async function init() {
  schema = await api('api/schema');
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = `#c/${schema.collections[0].key}`;
  else route();
}

init().catch((err) => {
  main().innerHTML = `<p class="error">Could not load the editor: ${esc(err.message)}</p>`;
});
