const varScreen   = document.getElementById('varScreen');
const varStandby  = document.getElementById('varStandby');
const varVideo    = document.getElementById('varVideo');
const varWrap     = document.getElementById('varVideoWrap');
const varStateLabel = document.getElementById('varStateLabel');

let currentZoom = 1;

function showState(text, ms) {
  varStateLabel.textContent = text;
  varStateLabel.classList.add('visible');
  if (ms) setTimeout(() => varStateLabel.classList.remove('visible'), ms);
}

socket.on('varLoad', data => {
  varStandby.style.display = 'none';
  varScreen.classList.remove('hidden');
  currentZoom = 1;
  varVideo.style.transform = 'scale(1)';
  varVideo.preload = 'auto';
  varVideo.src = data.url;
  varVideo.load();
  varVideo.play().catch(() => {
    // autoplay bloccato dal browser — aspetta interazione
    showState('▶ TAP PER AVVIARE', 0);
    varScreen.addEventListener('click', () => {
      varVideo.play().catch(() => {});
      varStateLabel.classList.remove('visible');
    }, { once: true });
  });
});

socket.on('varControl', data => {
  const { ctrl, value } = data;

  if (ctrl === 'play')   { varVideo.play(); }
  if (ctrl === 'pause')  { varVideo.pause(); }
  if (ctrl === 'seek')   { varVideo.currentTime = Math.max(0, varVideo.currentTime + value); }
  if (ctrl === 'speed')  {
    varVideo.playbackRate = value;
    showState(value === 1 ? 'NORMALE' : `×${value}`, 1200);
  }
  if (ctrl === 'zoom') {
    if (value === 0) {
      currentZoom = 1;
    } else {
      currentZoom = Math.max(1, Math.min(4, currentZoom + value));
    }
    varVideo.style.transform = `scale(${currentZoom})`;
    if (value !== 0) showState(`ZOOM ${currentZoom.toFixed(1)}×`, 900);
  }
});

socket.on('varClose', () => {
  varVideo.pause();
  varVideo.src = '';
  varScreen.classList.add('hidden');
  varStandby.style.display = 'flex';
  currentZoom = 1;
  varStateLabel.classList.remove('visible');
});
