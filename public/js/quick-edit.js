// Editing tools for signed-in staff. Each button opens the content editor in a panel
// over the page. When something is saved, the page reloads so the change shows.
(function () {
  const dialog = document.getElementById('quick-edit');
  const menu = document.querySelector('.edit-menu');
  if (!dialog || !menu) return;
  const frame = dialog.querySelector('iframe');

  menu.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
    frame.src = `/admin/?embed=1#${btn.dataset.edit}`;
    menu.removeAttribute('open');
    dialog.showModal();
  }));

  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { frame.src = 'about:blank'; });

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data && e.data.type === 'saved') location.reload();
  });
})();
