(function () {
  // Plays the live stream on the Live Streaming page.
  var video = document.querySelector('video[data-hls]');
  if (!video) return;
  var src = video.getAttribute('data-hls');
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
  } else if (window.Hls && window.Hls.isSupported()) {
    var hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(video);
  } else {
    var note = document.createElement('p');
    note.className = 'empty';
    note.textContent = 'This browser cannot play the live stream. Please try another browser.';
    video.parentNode.replaceChild(note, video);
  }
})();
