// ─── STATE ────────────────────────────────────────────────────────────────────
let state = null;
let varReadyClip = null; // { filename, url } — ultimo clip OBS rilevato

let vaPlaying = false;
let vaZoom = 1;
let vaPanX = 0;
let vaPanY = 0;

const vaVideo    = document.getElementById('vaVideo');
const vaStage    = document.getElementById('vaStage');
const vaStandby  = document.getElementById('vaStandby');
const vaHint     = document.getElementById('vaHint');

function applyVaTransform() {
  vaVideo.style.transform = `translate(${vaPanX}px, ${vaPanY}px) scale(${vaZoom})`;
}

// ─── SOCKET ───────────────────────────────────────────────────────────────────
socket.on('connect', () => {
  document.getElementById('connDot').classList.add('connected');
  document.getElementById('connText').textContent = 'Connesso';
});
socket.on('disconnect', () => {
  document.getElementById('connDot').classList.remove('connected');
  document.getElementById('connText').textContent = 'Disconnesso';
});
socket.on('authError', () => {
  sessionStorage.removeItem('adminToken');
  window.ADMIN_TOKEN = null;
  location.reload();
});

socket.on('state', s => { state = s; renderVaCall(); });

socket.on('varClipReady', data => {
  varReadyClip = data;
  const notif = document.getElementById('varClipNotif');
  const name  = document.getElementById('varClipName');
  if (notif) notif.style.display = 'block';
  if (name)  name.textContent = data.filename;
});

socket.on('varLoad', data => {
  vaStandby.style.display = 'none';
  vaHint.style.display = 'block';
  vaVideo.style.display = 'block';
  vaZoom = 1; vaPanX = 0; vaPanY = 0;
  applyVaTransform();
  vaVideo.preload = 'auto';
  vaVideo.src = data.url; vaVideo.load();
  vaVideo.play().catch(() => {});
  vaPlaying = true; updatePlayBtn();
  const ctrl = document.getElementById('varReplayControls');
  if (ctrl) ctrl.style.display = 'flex';
});

socket.on('varControl', data => {
  const { ctrl, value } = data;
  if (ctrl === 'play')  { vaVideo.play(); vaPlaying = true; }
  if (ctrl === 'pause') { vaVideo.pause(); vaPlaying = false; }
  if (ctrl === 'seek')  { vaVideo.currentTime = Math.max(0, vaVideo.currentTime + value); }
  if (ctrl === 'speed') { vaVideo.playbackRate = value; highlightSpeed(value); }
  if (ctrl === 'zoom') {
    if (value === 0) { vaZoom = 1; vaPanX = 0; vaPanY = 0; }
    else vaZoom = Math.max(1, Math.min(4, vaZoom + value));
    applyVaTransform();
  }
  if (ctrl === 'pan') {
    vaPanX += value.dx; vaPanY += value.dy;
    applyVaTransform();
  }
  updatePlayBtn();
});

socket.on('varClose', () => {
  vaVideo.pause(); vaVideo.src = ''; vaVideo.style.display = 'none';
  vaStandby.style.display = 'flex';
  vaHint.style.display = 'none';
  vaPlaying = false; vaZoom = 1; vaPanX = 0; vaPanY = 0;
  const ctrl = document.getElementById('varReplayControls');
  if (ctrl) ctrl.style.display = 'none';
  updatePlayBtn();
});

// ─── ACTIONS ──────────────────────────────────────────────────────────────────
function send(action) { socket.emit('action', action); }

function callVar(team)     { send({ type: 'VAR_CALL', team }); }
function varResult(result) { send({ type: 'VAR_RESULT', result, team: state?.var?.lastTeam }); }

function renderVaCall() {
  if (!state) return;
  const v   = state.var || {};
  const na  = state.teams.a.name;
  const nb  = state.teams.b.name;
  const sec = document.getElementById('vaCallSection');
  if (!sec) return;

  if (v.active) {
    sec.innerHTML = `
      <div style="text-align:center;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;color:#FFD700;letter-spacing:.15em;margin-bottom:10px;">VAR IN CORSO…</div>
      <div class="va-call-grid">
        <button class="disc-btn" style="background:rgba(0,197,110,.15);border-color:rgba(0,197,110,.6);color:#00C56E;" onclick="varResult('confirmed')">✓ CONFERMATO</button>
        <button class="disc-btn" style="background:rgba(229,27,27,.15);border-color:rgba(229,27,27,.6);color:#ff5555;" onclick="varResult('overturned')">✗ RIBALTATO</button>
      </div>`;
    return;
  }

  sec.innerHTML = `
    <div class="va-call-grid">
      <button class="disc-btn" style="background:rgba(255,107,0,.12);border:1px solid rgba(255,107,0,.4);color:#FF6B00;" onclick="callVar('a')">🔍 VAR<br><small>${na}</small>${v.usedA ? ' ✓' : ''}</button>
      <button class="disc-btn" style="background:rgba(255,107,0,.12);border:1px solid rgba(255,107,0,.4);color:#FF6B00;" onclick="callVar('b')">🔍 VAR<br><small>${nb}</small>${v.usedB ? ' ✓' : ''}</button>
    </div>`;
}

async function varAdminUpload(input) {
  const file = input.files[0]; if (!file) return;
  const status = document.getElementById('varUploadStatus');
  if (status) status.textContent = 'Caricamento…';
  try {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    varReadyClip = { filename: file.name, url: data.url };
    send({ type: 'VAR_LOAD', url: data.url, filename: file.name });
    if (status) status.textContent = '✓ ' + file.name;
  } catch(e) {
    if (status) status.textContent = '✗ Errore caricamento';
  }
  input.value = '';
}

async function varSaveWatchPath() {
  const input  = document.getElementById('varWatchPathInput');
  const status = document.getElementById('varWatchPathStatus');
  const watchPath = input?.value?.trim();
  if (!watchPath) return;
  if (status) status.textContent = 'Salvataggio…';
  try {
    const res  = await fetch('/api/var-watch-path', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watchPath })
    });
    const data = await res.json();
    if (data.ok) {
      if (status) { status.textContent = '✓ Cartella impostata'; status.style.color = '#00C56E'; }
    } else {
      if (status) { status.textContent = '✗ ' + (data.error || 'Errore'); status.style.color = '#E51B1B'; }
    }
  } catch(e) {
    if (status) { status.textContent = '✗ Errore di rete'; status.style.color = '#E51B1B'; }
  }
}

async function varLoadCurrentPath() {
  try {
    const res  = await fetch('/api/var-watch-path');
    const data = await res.json();
    const input = document.getElementById('varWatchPathInput');
    if (input && data.watchPath) input.value = data.watchPath;
  } catch(e) {}
}
varLoadCurrentPath();

function varAdminTogglePlay() {
  send({ type: 'VAR_CONTROL', ctrl: vaPlaying ? 'pause' : 'play' });
}

function varCtrl(ctrl, value) {
  send({ type: 'VAR_CONTROL', ctrl, value });
}

function varResetView() {
  send({ type: 'VAR_CONTROL', ctrl: 'zoom', value: 0 });
}

function varAdminClose() {
  send({ type: 'VAR_CLOSE' });
}

function updatePlayBtn() {
  const btn = document.getElementById('varPlayPauseBtn');
  if (!btn) return;
  btn.textContent = vaPlaying ? '⏸' : '▶';
  btn.classList.toggle('paused', !vaPlaying);
}

function highlightSpeed(val) {
  document.querySelectorAll('.var-speed-btn').forEach(b => b.classList.remove('active'));
  const map = { 0.25: 0, 0.5: 1, 1: 2, 1.5: 3, 2: 4 };
  const idx = map[val];
  if (idx !== undefined) {
    const btns = document.querySelectorAll('.var-speed-btn');
    if (btns[idx]) btns[idx].classList.add('active');
  }
}

// ─── DRAG TO PAN ───────────────────────────────────────────────────────────────
let dragging = false;
let lastX = 0, lastY = 0;
let pendingDx = 0, pendingDy = 0;
let panFlushTimer = null;

function flushPan() {
  panFlushTimer = null;
  if (!pendingDx && !pendingDy) return;
  send({ type: 'VAR_CONTROL', ctrl: 'pan', value: { dx: pendingDx, dy: pendingDy } });
  pendingDx = 0; pendingDy = 0;
}

function schedulePanFlush() {
  if (panFlushTimer) return;
  panFlushTimer = setTimeout(flushPan, 50);
}

vaStage.addEventListener('pointerdown', e => {
  if (vaVideo.style.display === 'none') return;
  dragging = true;
  lastX = e.clientX; lastY = e.clientY;
  vaStage.classList.add('dragging');
  vaStage.setPointerCapture(e.pointerId);
});
vaStage.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  vaPanX += dx; vaPanY += dy;
  applyVaTransform();
  pendingDx += dx; pendingDy += dy;
  schedulePanFlush();
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  vaStage.classList.remove('dragging');
  if (panFlushTimer) { clearTimeout(panFlushTimer); flushPan(); }
}
vaStage.addEventListener('pointerup', endDrag);
vaStage.addEventListener('pointercancel', endDrag);
