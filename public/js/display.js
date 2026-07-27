// ─── STATE ────────────────────────────────────────────────────────────────────
let state = null;

let cardSnapshot  = '';
let discSnapshotA = '';
let discSnapshotB = '';

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────
socket.on('connect',    () => console.log('Display connected'));
socket.on('disconnect', () => console.log('Display disconnected'));

socket.on('state', s => {
  state = s;
  cardSnapshot = discSnapshotA = discSnapshotB = '';
  renderAll();
});

socket.on('tick', data => {
  if (!state) return;
  state.timer.value             = data.value;
  state.activeCards             = data.activeCards;
  state.teams.a.disciplineCards = data.disciplineA;
  state.teams.b.disciplineCards = data.disciplineB;
  renderTimer();
  smartRenderCards();
  smartRenderDiscipline();
});

// ─── CUSTOM SOUND HELPER ──────────────────────────────────────────────────────
function playCustomSound(key, synthFn) {
  if (!soundEnabled) return;
  const url = state?.sounds?.[key];
  if (url) {
    try { new Audio(url).play().catch(() => {}); } catch(e) {}
  } else {
    synthFn();
  }
}

socket.on('goalEvent', data => {
  if (!state) return;
  state.teams.a.goals = data.goals.a;
  state.teams.b.goals = data.goals.b;
  // Niente video/animazione quando si toglie un gol (-1) o si azzera: solo su gol veri (amount>0)
  // o su anteprima esplicita richiesta dall'admin (preview).
  if (data.amount > 0 || data.preview) {
    const videoToPlay = data.playerVideoUrl || data.videoUrl;
    if (videoToPlay) {
      playVideo(videoToPlay);
    } else {
      playCustomSound('goal', playGoalSound);
      showGoalAnimation(data.team, data.goals, data.playerName);
    }
  }
  renderScore();
});

socket.on('animation', data => {
  if (data.type === 'card') {
    playCustomSound('card', playCardSound);
    showCardAnimation(data.card);
  } else if (data.type === 'discipline') {
    if (data.card.type === 'yellow') playCustomSound('yellowCard', playYellowCardSound);
    if (data.card.type === 'red')    playCustomSound('redCard',    playRedCardSound);
    showDisciplineAnimation(data.card);
  } else if (data.type === 'rigorePres') {
    playCustomSound('rigore', playRigorePresSound);
    if (data.videoUrl) playVideo(data.videoUrl);
    else               showRigorePresAnimation();
  }
});

let varResultTimeout = null;
socket.on('varCall', data => {
  if (!state) return;
  const teamName = data.team === 'a' ? state.teams.a.name : state.teams.b.name;
  const overlay = document.getElementById('varOverlay');
  overlay.innerHTML = `
    <div class="var-content">
      <div class="var-icon">🔍</div>
      <div class="var-label">VAR</div>
      <div class="var-team">${teamName}</div>
      <div class="var-status var-blink">IN CORSO…</div>
    </div>`;
  overlay.classList.add('active');
  clearTimeout(varResultTimeout);
});

socket.on('varResult', data => {
  const overlay = document.getElementById('varOverlay');
  const isConf  = data.result === 'confirmed';
  const icon    = isConf ? '✓' : '✗';
  const label   = isConf ? 'CONFERMATO' : 'RIBALTATO';
  const cls     = isConf ? 'var-confirmed' : 'var-overturned';
  overlay.innerHTML = `
    <div class="var-content">
      <div class="var-icon">${isConf ? '✅' : '❌'}</div>
      <div class="var-label ${cls}">VAR</div>
      <div class="var-status ${cls}">${icon} ${label}</div>
    </div>`;
  clearTimeout(varResultTimeout);
  varResultTimeout = setTimeout(() => overlay.classList.remove('active'), 4000);
});

// ─── SHOOTOUT ─────────────────────────────────────────────────────────────────
let shootoutInterval    = null;
let shootoutSafetyTimer = null; // failsafe: se nessun esito arriva, riapre comunque il display

function closeShootoutOverlay() {
  clearInterval(shootoutInterval);
  clearTimeout(shootoutSafetyTimer);
  document.getElementById('shootoutOverlay').classList.remove('active');
}

socket.on('shootoutStart', data => {
  const overlay  = document.getElementById('shootoutOverlay');
  const teamName = getTeamName(data.team);
  let n = 5;

  const renderCount = () => {
    overlay.innerHTML = `
      <div class="shootout-content">
        <div class="shootout-label">SHOOTOUT</div>
        <div class="shootout-team">${teamName}</div>
        <div class="shootout-count${n <= 1 ? ' final' : ''}">${n}</div>
      </div>`;
  };

  clearInterval(shootoutInterval);
  clearTimeout(shootoutSafetyTimer);
  renderCount();
  overlay.classList.add('active');
  playCustomSound('shootoutBeep', () => playCountdownBeep(false));

  shootoutInterval = setInterval(() => {
    n--;
    if (n > 0) {
      renderCount();
      playCustomSound('shootoutBeep', () => playCountdownBeep(false));
    } else {
      clearInterval(shootoutInterval);
      overlay.innerHTML = `
        <div class="shootout-content">
          <div class="shootout-label">SHOOTOUT</div>
          <div class="shootout-team">${teamName}</div>
          <div class="shootout-status shootout-blink">TIRO IN CORSO…</div>
        </div>`;
      playCustomSound('shootoutBeep', () => playCountdownBeep(true));
      // Se per qualsiasi motivo l'arbitro non conferma mai l'esito, non blocchiamo
      // il display all'infinito: dopo 30s torniamo comunque al timer normale.
      clearTimeout(shootoutSafetyTimer);
      shootoutSafetyTimer = setTimeout(closeShootoutOverlay, 30000);
    }
  }, 1000);
});

socket.on('shootoutResult', data => {
  clearInterval(shootoutInterval);
  clearTimeout(shootoutSafetyTimer);
  const overlay = document.getElementById('shootoutOverlay');
  if (data.scored) {
    // Il gol vero e proprio arriva subito dopo via 'goalEvent' (con video/animazione): chiudiamo qui.
    overlay.classList.remove('active');
    return;
  }
  const teamName = getTeamName(data.team);
  overlay.innerHTML = `
    <div class="shootout-content">
      <div class="shootout-label">SHOOTOUT</div>
      <div class="shootout-team">${teamName}</div>
      <div class="shootout-status shootout-miss">✗ NO GOL</div>
    </div>`;
  setTimeout(() => overlay.classList.remove('active'), 2200);
});

socket.on('shootoutCancel', () => closeShootoutOverlay());

socket.on('playerEntryAlert', data => {
  playCustomSound('playerAlert', playPlayerEntryAlert);
  showPlayerEntryAlert(data.minute);
});

socket.on('phaseEnd', data => {
  playCustomSound('phaseEnd', playPhaseEndSound);
  showPhaseEndOverlay(data.phase);
});

socket.on('phaseChange', data => {
  if (data.from === 'pre') {
    const screen = document.getElementById('preMatchScreen');
    if (screen) { screen.classList.add('hiding'); setTimeout(() => { screen.style.display = 'none'; }, 700); }
  }
  // Hide victory overlay on any new phase change
  document.getElementById('victoryOverlay')?.classList.remove('active');

  if (data.to === 'post') {
    playCustomSound('phaseEnd', playPhaseEndSound);
    showVictoryScreen();
    return;
  }
  const key      = `${data.from}_${data.to}`;
  const videoUrl = state?.transitionVideos?.[key];
  if (videoUrl) {
    playCustomSound('phaseStart', playPhaseStartSound);
    playTransitionVideo(videoUrl);
  } else {
    showPhaseTransition(data.from, data.to);
  }
});

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderAll() {
  if (!state) return;
  renderPhase();
  renderTeams();
  renderTeamScale();
  renderScore();
  renderTimer();
  renderPreMatch();
  rebuildCards();
  rebuildDiscipline();
  if (state.phase === 'post') showVictoryScreen();
  else document.getElementById('victoryOverlay')?.classList.remove('active');
}

// Dimensione logo+nome squadra regolabile dal vivo dall'admin (Setup → Dimensione Logo/Nome)
function renderTeamScale() {
  const scale = state.settings?.teamDisplayScale || 1;
  document.documentElement.style.setProperty('--team-scale', scale);
}

function renderPhase() {
  const map = {
    pre:         { badge: 'PRE PARTITA',  sub: '' },
    '1tempo':    { badge: '1° TEMPO',     sub: 'Primo Tempo' },
    momentodado: { badge: 'MOMENTO DADO', sub: 'Estrazione Dado — 2 minuti' },
    '2tempo':    { badge: '2° TEMPO',     sub: 'Secondo Tempo' },
    golx2:       { badge: 'GOL × 2',      sub: 'Ultimi 2 minuti — Goal doppi!' },
    post:        { badge: 'FINE PARTITA', sub: 'Partita terminata' },
  };
  const p = map[state.phase] || { badge: state.phase, sub: '' };
  document.getElementById('phaseBadge').textContent = p.badge;
  document.getElementById('phaseSub').textContent   = p.sub;
  document.getElementById('displayRoot').className  = `display-root phase-${state.phase}`;
  document.getElementById('golx2Badge').classList.toggle('visible', state.phase === 'golx2');
}

function renderTeams() {
  document.getElementById('teamAName').textContent = state.teams.a.name;
  document.getElementById('teamBName').textContent = state.teams.b.name;
  const pna = document.getElementById('preNameA');
  const pnb = document.getElementById('preNameB');
  if (pna) pna.textContent = state.teams.a.name;
  if (pnb) pnb.textContent = state.teams.b.name;
}

function renderScore() {
  const a = document.getElementById('scoreA');
  const b = document.getElementById('scoreB');
  const prev = { a: a.textContent, b: b.textContent };
  a.textContent = state.teams.a.goals;
  b.textContent = state.teams.b.goals;
  if (String(state.teams.a.goals) !== prev.a) { a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); }
  if (String(state.teams.b.goals) !== prev.b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}

function renderTimer() {
  const el  = document.getElementById('timerDisplay');
  el.textContent = formatTime(state.timer.value);
  const rem = state.timer.phaseDuration - state.timer.value;
  el.classList.toggle('warning', state.timer.phaseDuration > 0 && rem <= 30 && rem >= 0 && state.timer.running);
}

// ─── PRE-MATCH SCREEN ─────────────────────────────────────────────────────────
function renderPreMatch() {
  const screen = document.getElementById('preMatchScreen');
  if (!screen) return;
  if (state.phase !== 'pre') { screen.style.display = 'none'; return; }
  screen.style.display = 'flex';
  screen.classList.remove('hiding');
  const pna = document.getElementById('preNameA');
  const pnb = document.getElementById('preNameB');
  if (pna) pna.textContent = state.teams.a.name;
  if (pnb) pnb.textContent = state.teams.b.name;
  setPreLogo('preLogoA', state.teams.a.logo);
  setPreLogo('preLogoB', state.teams.b.logo);
}

function setPreLogo(containerId, url) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = url
    ? `<img class="pre-team-logo" src="${url}" alt="">`
    : `<div style="width:160px;height:160px;border:3px dashed #000;border-radius:50%;opacity:.3;"></div>`;
}

// ─── SMART CARD RENDERING ─────────────────────────────────────────────────────
function makeCardSnap(cards) {
  return cards.map(c => `${c.id}|${c.team}|${c.expired}`).join(';');
}

function smartRenderCards() {
  const newSnap = makeCardSnap(state.activeCards || []);
  if (newSnap !== cardSnapshot) { cardSnapshot = newSnap; rebuildCards(); }
  else updateCardTimersInPlace();
}

function rebuildCards() {
  const cards = state.activeCards || [];
  buildCardPanel('a', cards.filter(c => c.team === 'a'));
  buildCardPanel('b', cards.filter(c => c.team === 'b'));
  updateTeamLogos();
}

// ─── CARTA ATTIVA PANEL (pannello esterno sx/dx per team) ────────────────────
function buildCardPanel(team, cards) {
  const panel = document.getElementById(`cardPanel${team.toUpperCase()}`);
  const main  = document.querySelector('.display-main');
  if (!panel) return;

  const card = cards.find(c => !c.expired) || cards[0];

  if (!card) {
    panel.className = 'carta-attiva-panel panel-hidden';
    panel.innerHTML = '';
    if (main) main.classList.add(`no-card-${team}`);
    return;
  }

  panel.className = 'carta-attiva-panel';
  if (main) main.classList.remove(`no-card-${team}`);

  const isPermanent = card.totalDuration === 0;
  const pct = isPermanent ? 100 : Math.max(0, (card.timeLeft / card.totalDuration) * 100);
  const low = pct < 25;
  panel.className = 'carta-attiva-panel';
  panel.innerHTML = `
    <div class="panel-label">CARTA ATTIVA</div>
    <img class="panel-card-img" src="${cardImageUrl(card.image)}" alt="${card.name}">
    ${card.expired ? '<div class="panel-expired-x">✕</div>' : ''}
    ${!isPermanent
      ? `<div class="panel-timer${card.expired ? ' expired-label' : ''}" data-card-timer="${card.id}">
           ${card.expired ? 'SCADUTA' : formatTime(card.timeLeft)}
         </div>
         <div class="panel-progress-wrap">
           <div class="panel-progress-bar${low ? ' low' : ''}" style="width:${pct.toFixed(1)}%" data-progress-bar="${card.id}"></div>
         </div>
         <div class="panel-duration-label">DURATA CARTA: ${formatTime(card.totalDuration)}</div>`
      : `<div class="panel-permanent-label">Permanente</div>`
    }
  `;
}

// ─── TEAM LOGOS ───────────────────────────────────────────────────────────────
function updateTeamLogos() {
  ['a', 'b'].forEach(team => {
    const logo = state.teams[team]?.logo;
    const img  = document.getElementById(`teamLogo${team.toUpperCase()}`);
    const ph   = document.getElementById(`teamLogo${team.toUpperCase()}Placeholder`);
    if (img) { img.src = logo || ''; img.style.display = logo ? 'block' : 'none'; }
    if (ph)  { ph.style.display = logo ? 'none' : 'block'; }
  });
}

// Update timer text and progress bar in place — no DOM rebuild, no bounce
function updateCardTimersInPlace() {
  (state.activeCards || []).forEach(card => {
    if (card.totalDuration === 0) return;
    const pct = Math.max(0, (card.timeLeft / card.totalDuration) * 100);
    const low = pct < 25;
    document.querySelectorAll(`[data-card-timer="${card.id}"]`).forEach(el => {
      if (card.expired) { el.textContent = 'SCADUTA'; el.classList.add('expired-label'); }
      else { el.textContent = formatTime(card.timeLeft); }
    });
    document.querySelectorAll(`[data-progress-bar="${card.id}"]`).forEach(el => {
      el.style.width = `${pct.toFixed(1)}%`;
      el.classList.toggle('low', low);
    });
  });
}

// ─── DISCIPLINE RENDERING ─────────────────────────────────────────────────────
function smartRenderDiscipline() {
  const snapA = (state.teams.a.disciplineCards || []).map(c => c.id).join(',');
  const snapB = (state.teams.b.disciplineCards || []).map(c => c.id).join(',');
  if (snapA !== discSnapshotA) { discSnapshotA = snapA; buildDiscipline('a'); }
  else updateDisciplineTimers('a');
  if (snapB !== discSnapshotB) { discSnapshotB = snapB; buildDiscipline('b'); }
  else updateDisciplineTimers('b');
}

function rebuildDiscipline() {
  buildDiscipline('a');
  buildDiscipline('b');
}

function buildDiscipline(team) {
  const container = document.getElementById(`discipline${team.toUpperCase()}`);
  container.innerHTML = '';
  (state.teams[team].disciplineCards || []).forEach(c => {
    const badge = document.createElement('div');
    badge.className = `discipline-badge ${c.type}`;
    badge.dataset.discId = c.id;
    badge.innerHTML = `
      <span class="dc-player">${c.playerName || state.teams[team].name}</span>
      <span class="dc-time" data-disc-timer="${c.id}">${formatTime(c.timeLeft)}</span>
    `;
    container.appendChild(badge);
  });
}

function updateDisciplineTimers(team) {
  (state.teams[team].disciplineCards || []).forEach(c => {
    const el = document.querySelector(`[data-disc-timer="${c.id}"]`);
    if (el) el.textContent = formatTime(c.timeLeft);
  });
}

// ─── PHASE TRANSITION ─────────────────────────────────────────────────────────
function showPhaseTransition(from, to) {
  const configs = {
    '1tempo':    { emoji: '⚽', title: '1° TEMPO',     sub: 'FISCHIO D\'INIZIO',   color: '#FF6B00' },
    momentodado: { emoji: '🎲', title: 'MOMENTO DADO', sub: 'ESTRAZIONE DEL DADO', color: '#FF8A30', dice: true },
    '2tempo':    { emoji: '⚽', title: '2° TEMPO',     sub: 'SECONDO TEMPO',       color: '#FF6B00' },
    golx2:       { emoji: '⚡', title: 'GOL × 2',      sub: 'ULTIMI 2 MINUTI!',    color: '#FF3333' },
    post:        { emoji: '🏆', title: 'FINE PARTITA', sub: 'PARTITA TERMINATA',   color: '#FFD700' },
  };
  const cfg = configs[to];
  if (!cfg) return;
  playCustomSound('phaseStart', playPhaseStartSound);
  const overlay = document.getElementById('phaseTransitionOverlay');
  overlay.innerHTML = `
    <div class="phase-transition">
      <div class="pt-icon${cfg.dice ? ' pt-dice' : ''}">${cfg.emoji}</div>
      <div class="pt-title">${cfg.title}</div>
      <div class="pt-sub">${cfg.sub}</div>
    </div>
  `;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 2800);
}

function playTransitionVideo(url) {
  const overlay = document.getElementById('transitionVideoOverlay');
  const video   = document.getElementById('transitionVideo');
  video.src = url;
  overlay.classList.add('active');
  video.play().catch(() => {});
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    overlay.classList.remove('active');
    video.pause(); video.src = '';
  };
  video.onended = close;
  setTimeout(close, 60000);
}

// ─── CARD FLIP ANIMATION ──────────────────────────────────────────────────────
function showCardAnimation(card) {
  const overlay = document.getElementById('cardAnimOverlay');
  overlay.innerHTML = `
    <div class="card-anim-scene">
      <div class="card-anim-inner" id="flipCard">
        <div class="card-face card-face-back"><img src="${cardImageUrl('retro(2)_senza_sfondo.png')}" alt="back"></div>
        <div class="card-face card-face-front"><img src="${cardImageUrl(card.image)}" alt="${card.name}"></div>
      </div>
    </div>
    <div class="card-anim-label">${card.name.toUpperCase()}</div>
    ${card.team ? `<div class="card-team-label">${getTeamName(card.team)}</div>` : ''}
  `;
  overlay.classList.add('active');
  setTimeout(() => { const fc = document.getElementById('flipCard'); if (fc) fc.classList.add('flipped'); }, 800);
  setTimeout(() => { overlay.classList.remove('active'); rebuildCards(); }, 3600);
}

// ─── DISCIPLINE ANIMATION ─────────────────────────────────────────────────────
function showDisciplineAnimation(card) {
  const overlay  = document.getElementById('disciplineOverlay');
  const teamName = getTeamName(card.team);
  const isYellow = card.type === 'yellow';
  overlay.innerHTML = `
    <div class="disc-scene">
      <div class="disc-card-shape ${card.type}"></div>
      <div class="disc-info">
        ${card.playerName ? `<div class="disc-player-name">${card.playerName}</div>` : ''}
        <div class="disc-team-name">${teamName}</div>
      </div>
    </div>
  `;
  overlay.classList.add('active');
  setTimeout(() => { overlay.classList.remove('active'); rebuildDiscipline(); }, 2800);
}

// ─── GOAL ANIMATION: SCRITTE VOLANTI + ZOOM ───────────────────────────────────
function showGoalAnimation(team, goals, playerName) {
  const overlay  = document.getElementById('goalOverlay');
  const teamName = getTeamName(team);
  const logo     = state?.teams?.[team]?.logo || '';

  const palette = ['#000000', '#FFFFFF'];
  let flying = '';
  for (let i = 0; i < 18; i++) {
    const top   = (3 + Math.random() * 90).toFixed(0);
    const fs    = (3 + Math.random() * 8).toFixed(1);
    const spd   = (.55 + Math.random() * .6).toFixed(2);
    const delay = (Math.random() * .6).toFixed(2);
    const color = palette[Math.floor(Math.random() * palette.length)];
    const op    = (.75 + Math.random() * .25).toFixed(2);
    flying += `<div class="gol-fly" style="top:${top}%;font-size:${fs}vh;color:${color};opacity:${op};--spd:${spd}s;--delay:${delay}s">GOL!</div>`;
  }

  const logoHtml   = logo ? `<img class="goal-info-logo" src="${logo}" alt="">` : '';
  const playerHtml = playerName ? `<div class="goal-info-player">${playerName}</div>` : '';

  overlay.innerHTML = `
    <div class="goal-fly-container">${flying}</div>
    <div class="goal-center-glow"></div>
    <div class="goal-zoom-wrap">
      <div class="goal-zoom-text">GOL!</div>
    </div>
    <div class="goal-info-strip">
      ${logoHtml}
      <div class="goal-info-team">${teamName}</div>
      ${playerHtml}
      <div class="goal-info-score">${goals.a} — ${goals.b}</div>
    </div>
  `;

  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 4200);
}

// ─── VICTORY SCREEN ───────────────────────────────────────────────────────────
function buildGoalLogHtml() {
  const log = state.goalLog || [];
  if (!log.length) return '';
  const rows = log.map(e => {
    const teamName = e.team === 'a' ? state.teams.a.name : state.teams.b.name;
    const scorer   = e.playerName ? `<span class="vgl-player">${e.playerName}</span>` : '';
    return `<div class="vgl-row">
      <span class="vgl-min">${formatTime(e.timerValue)}</span>
      <span class="vgl-team">${teamName}</span>
      ${scorer}
      <span class="vgl-score">${e.scoreA}–${e.scoreB}</span>
    </div>`;
  }).join('');
  return `<div class="victory-goal-log"><div class="vgl-title">MARCATORI</div>${rows}</div>`;
}

function showVictoryScreen() {
  if (!state) return;
  const ga = state.teams.a.goals;
  const gb = state.teams.b.goals;
  const overlay = document.getElementById('victoryOverlay');
  const goalLog = buildGoalLogHtml();
  const pdfBtn  = `<button class="victory-pdf-btn" onclick="downloadMatchPDF()">⬇ Scarica riepilogo PDF</button>`;
  let html;
  if (ga === gb) {
    html = `
      <div class="victory-content">
        <div class="victory-draw-label">PAREGGIO</div>
        <div class="victory-score-big">${ga} — ${gb}</div>
        <div class="victory-teams-row">
          ${state.teams.a.logo ? `<img class="victory-logo-sm" src="${state.teams.a.logo}" alt="">` : ''}
          <span class="victory-team-sm">${state.teams.a.name}</span>
          <span class="victory-vs-sep">vs</span>
          <span class="victory-team-sm">${state.teams.b.name}</span>
          ${state.teams.b.logo ? `<img class="victory-logo-sm" src="${state.teams.b.logo}" alt="">` : ''}
        </div>
        ${goalLog}
        ${pdfBtn}
      </div>
    `;
  } else {
    const w  = ga > gb ? 'a' : 'b';
    const wt = state.teams[w];
    html = `
      <div class="victory-content">
        <div class="victory-label">VINCITORE</div>
        ${wt.logo ? `<img class="victory-logo-big" src="${wt.logo}" alt="">` : ''}
        <div class="victory-team-name">${wt.name}</div>
        <div class="victory-score-big">${ga} — ${gb}</div>
        <div class="victory-teams-row">
          <span class="victory-team-sm">${state.teams.a.name}</span>
          <span class="victory-vs-sep">vs</span>
          <span class="victory-team-sm">${state.teams.b.name}</span>
        </div>
        ${goalLog}
        ${pdfBtn}
      </div>
    `;
  }
  overlay.innerHTML = html;
  overlay.classList.add('active');
}

// ─── PDF RIEPILOGO ────────────────────────────────────────────────────────────
function downloadMatchPDF() {
  if (typeof window.jspdf === 'undefined') { alert('Libreria PDF non caricata'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const orange = [255, 107, 0];
  const white  = [255, 255, 255];
  const black  = [20, 20, 20];
  const gray   = [100, 100, 100];

  // Header band
  doc.setFillColor(...orange);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('STORK LEAGUE', 105, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Riepilogo Partita', 105, 20, { align: 'center' });

  // Date
  doc.setTextColor(...gray);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' }), 105, 26, { align: 'center' });

  // Score block
  const ga = state.teams.a.goals;
  const gb = state.teams.b.goals;
  doc.setTextColor(...black);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(state.teams.a.name, 52, 44, { align: 'center' });
  doc.text(state.teams.b.name, 158, 44, { align: 'center' });
  doc.setFontSize(36);
  doc.setTextColor(...orange);
  doc.text(`${ga}  –  ${gb}`, 105, 58, { align: 'center' });

  // Result label
  doc.setFontSize(11);
  doc.setTextColor(...gray);
  if (ga === gb) {
    doc.text('PAREGGIO', 105, 66, { align: 'center' });
  } else {
    const winner = ga > gb ? state.teams.a.name : state.teams.b.name;
    doc.text(`VINCITORE: ${winner}`, 105, 66, { align: 'center' });
  }

  // Separator
  doc.setDrawColor(...orange);
  doc.setLineWidth(0.6);
  doc.line(15, 72, 195, 72);

  // Goal log table
  const log = state.goalLog || [];
  if (log.length) {
    doc.setTextColor(...orange);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('MARCATORI', 15, 80);

    doc.autoTable({
      startY: 84,
      head: [['Minuto', 'Squadra', 'Giocatore', 'Risultato']],
      body: log.map(e => [
        formatTime(e.timerValue),
        e.team === 'a' ? state.teams.a.name : state.teams.b.name,
        e.playerName || '—',
        `${e.scoreA} – ${e.scoreB}`,
      ]),
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: orange, textColor: white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 15, right: 15 },
    });
  } else {
    doc.setTextColor(...gray);
    doc.setFontSize(10);
    doc.text('Nessun gol registrato.', 15, 82);
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...orange);
  doc.rect(0, pageH - 10, 210, 10, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(8);
  doc.text('Stork League © ' + new Date().getFullYear(), 105, pageH - 3.5, { align: 'center' });

  doc.save(`storkleague_${state.teams.a.name}_vs_${state.teams.b.name}.pdf`);
}

// ─── RIGORE PRESIDENZIALE ─────────────────────────────────────────────────────
function showRigorePresAnimation() {
  const overlay = document.getElementById('rigorePresOverlay');
  overlay.innerHTML = `
    <div class="rigore-content">
      <img class="rigore-card-img" src="${cardImageUrl('rigore presidenziale(4)_senza_sfondo.png')}" alt="Rigore Presidenziale">
      <div class="rigore-title">RIGORE</div>
      <div class="rigore-subtitle">PRESIDENZIALE</div>
    </div>
  `;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 5000);
}

// ─── VIDEO ────────────────────────────────────────────────────────────────────
function playVideo(url) {
  const overlay = document.getElementById('videoOverlay');
  const video   = document.getElementById('goalVideo');
  video.src = url;
  overlay.classList.add('active');
  video.play().catch(() => {});
  let closed = false;
  const close = () => { if (closed) return; closed = true; overlay.classList.remove('active'); video.pause(); video.src = ''; };
  video.onended = close;
  setTimeout(close, 30000);
}

// ─── PHASE END ────────────────────────────────────────────────────────────────
function showPhaseEndOverlay(phase) {
  const labels = { '1tempo': 'FINE 1° TEMPO', momentodado: 'FINE MOMENTO DADO', '2tempo': 'FINE 2° TEMPO', golx2: 'FINE PARTITA' };
  const overlay = document.getElementById('phaseEndOverlay');
  overlay.innerHTML = `
    <div class="phase-end-title">${labels[phase] || 'FASE TERMINATA'}</div>
    <div class="phase-end-sub">In attesa dell'arbitro…</div>
  `;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 5000);
}

// ─── PLAYER ENTRY ALERT ───────────────────────────────────────────────────────
function showPlayerEntryAlert(minute) {
  const overlay = document.getElementById('alertOverlay');
  overlay.innerHTML = `
    <div class="alert-box">
      <div class="alert-title">⬆ FAI ENTRARE IL GIOCATORE</div>
      <div class="alert-sub">Minuto ${minute} — Sostituzione disponibile</div>
    </div>
  `;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 3000);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getTeamName(team) {
  if (!state) return team === 'a' ? 'Squadra A' : 'Squadra B';
  return team === 'a' ? state.teams.a.name : state.teams.b.name;
}

// ─── SOUND TOGGLE ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('soundToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btn.classList.toggle('active', soundEnabled);
      btn.textContent = soundEnabled ? '🔊' : '🔇';
      if (soundEnabled) getAudioCtx();
    });
  }
  document.addEventListener('click', () => { try { getAudioCtx(); } catch(e) {} }, { once: true });
});
