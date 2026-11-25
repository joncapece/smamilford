(function () {
  // Main menu groups: open on hover with a mouse on desktop, close when clicking or tapping
  // elsewhere, and close with the Escape key. Touch and keyboard use the normal open/close.
  var groups = Array.prototype.slice.call(document.querySelectorAll('.nav-group'));
  if (!groups.length) return;
  var hoverMenus = window.matchMedia('(hover: hover) and (min-width: 960px)');

  function closeAll(except) {
    groups.forEach(function (g) {
      if (g !== except) g.open = false;
    });
  }

  groups.forEach(function (g) {
    var summary = g.querySelector('summary');

    g.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse' && hoverMenus.matches) g.open = true;
    });
    g.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse' && hoverMenus.matches) g.open = false;
    });

    // With a mouse on desktop, the group is already open from hovering, so a click keeps it open.
    summary.addEventListener('click', function (e) {
      if (hoverMenus.matches) e.preventDefault();
    });

    g.addEventListener('toggle', function () {
      if (g.open) closeAll(g);
    });
  });

  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest || !e.target.closest('.nav-group')) closeAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });
})();
