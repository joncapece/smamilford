(function () {
  var popup = document.getElementById('live-popup');
  if (!popup) return;
  var video = popup.querySelector('video');
  var note = popup.querySelector('.live-note');
  var close = popup.querySelector('.live-close');
  var src = video.getAttribute('data-src');

  if (sessionStorage.getItem('live-dismissed')) {
    popup.hidden = true;
    return;
  }

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
  } else if (window.Hls && window.Hls.isSupported()) {
    var hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(video);
  } else {
    note.textContent = 'This browser cannot play the live stream. Please try another browser.';
  }

  close.addEventListener('click', function () {
    video.pause();
    popup.hidden = true;
    sessionStorage.setItem('live-dismissed', '1');
  });
})();
