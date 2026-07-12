const varScreen   = document.getElementById('varScreen');
const varStandby  = document.getElementById('varStandby');
const varVideo    = document.getElementById('varVideo');
const varWrap     = document.getElementById('varVideoWrap');
const varStateLabel = document.getElementById('varStateLabel');

let currentZoom = 1;
let panX = 0;
let panY = 0;

function showState(text, ms) {
  varStateLabel.textContent = text;
  varStateLabel.classList.add('visible');
  if (ms) setTimeout(() => varStateLabel.classList.remove('visible'), ms);
}

function applyTransform() {
  varVideo.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

socket.on('varLoad', data => {
  varStandby.style.display = 'none';
  varScreen.classList.remove('hidden');
  currentZoom = 1;
  panX = 0; panY = 0;
  applyTransform();
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
      panX = 0; panY = 0;
    } else {
      currentZoom = Math.max(1, Math.min(4, currentZoom + value));
    }
    applyTransform();
    if (value !== 0) showState(`ZOOM ${currentZoom.toFixed(1)}×`, 900);
  }
  if (ctrl === 'pan') {
    panX += value.dx;
    panY += value.dy;
    applyTransform();
  }
});

socket.on('varClose', () => {
  varVideo.pause();
  varVideo.src = '';
  varScreen.classList.add('hidden');
  varStandby.style.display = 'flex';
  currentZoom = 1;
  panX = 0; panY = 0;
  varStateLabel.classList.remove('visible');
});
