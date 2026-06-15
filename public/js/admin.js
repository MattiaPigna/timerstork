// ─── STATE ────────────────────────────────────────────────────────────────────
let state = null;
let pendingCardId   = null;
let pendingCardDef  = null;
let pendingGoalTeam = null;
let pendingGoalAmt  = null;

// ─── SOCKET ───────────────────────────────────────────────────────────────────
socket.on('connect', () => {
  document.getElementById('connDot').classList.add('connected');
  document.getElementById('connText').textContent = 'Connesso';
});
socket.on('disconnect', () => {
  document.getElementById('connDot').classList.remove('connected');
  document.getElementById('connText').textContent = 'Disconnesso';
});

socket.on('state', s => { state = s; renderAdmin(); unlockAudio(); });
socket.on('tick', data => {
  if (!state) return;
  state.timer.value             = data.value;
  state.activeCards             = data.activeCards;
  state.teams.a.disciplineCards = data.disciplineA;
  state.teams.b.disciplineCards = data.disciplineB;
  renderTimer();
  renderActiveList();
});
socket.on('goalEvent', data => {
  if (!state) return;
  state.teams.a.goals = data.goals.a;
  state.teams.b.goals = data.goals.b;
  renderGoals();
});

// ─── ACTIONS ──────────────────────────────────────────────────────────────────
function send(action) { socket.emit('action', action); }

function setPhase(phase)   { send({ type: 'SET_PHASE',   phase }); }
function timerStart()      { send({ type: 'TIMER_START' }); unlockAudio(); }
function timerPause()      { send({ type: 'TIMER_PAUSE' }); }
function timerReset()      { send({ type: 'TIMER_RESET' }); }
function addGoal(t, amt)   { openGoalModal(t, amt); }
function removeCard(id)    { send({ type: 'REMOVE_CARD', id }); }
function removeDiscipline(team, id) { send({ type: 'REMOVE_DISCIPLINE', team, id }); }
function resetMatch()      { if (confirm('Reset partita?')) send({ type: 'RESET_MATCH' }); }
function playRigorePres()  { send({ type: 'PLAY_RIGORE_PRES' }); unlockAudio(); }

function timerSetValue() {
  const val = document.getElementById('timerSetInput').value;
  const parts = val.split(':');
  let sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseInt(val) * 60;
  if (!isNaN(sec) && sec >= 0) send({ type: 'TIMER_SET', value: sec });
}

// ─── GOAL PLAYER MODAL ────────────────────────────────────────────────────────
function openGoalModal(team, amount) {
  if (!state) return;
  const players = (state.teams[team].players || []).filter(p => amount > 0 ? true : false);
  if (amount <= 0 || !players.length) {
    send({ type: 'ADD_GOAL', team, amount });
    unlockAudio();
    return;
  }
  pendingGoalTeam = team;
  pendingGoalAmt  = amount;
  const teamName = team === 'a' ? state.teams.a.name : state.teams.b.name;
  document.getElementById('goalPlayerModalTitle').textContent = `GOL — ${teamName}`;
  const list = document.getElementById('goalPlayerList');
  list.innerHTML = '';
  players.forEach(p => {
    const name = typeof p === 'string' ? p : p.name;
    const btn = document.createElement('button');
    btn.className = 'modal-team-btn';
    btn.textContent = name;
    btn.onclick = () => confirmGoal(name);
    list.appendChild(btn);
  });
  document.getElementById('goalPlayerModal').classList.add('open');
}

function confirmGoal(playerName) {
  if (pendingGoalTeam === null) return;
  send({ type: 'ADD_GOAL', team: pendingGoalTeam, amount: pendingGoalAmt, playerName });
  closeGoalModal();
  unlockAudio();
}

function confirmGoalAnonymous() {
  if (pendingGoalTeam === null) return;
  send({ type: 'ADD_GOAL', team: pendingGoalTeam, amount: pendingGoalAmt });
  closeGoalModal();
  unlockAudio();
}

function closeGoalModal() {
  document.getElementById('goalPlayerModal').classList.remove('open');
  pendingGoalTeam = pendingGoalAmt = null;
}

// ─── CARD MODAL ───────────────────────────────────────────────────────────────
function openCardModal(cardId) {
  if (!state) return;
  const def = state.cardDefs.find(c => c.id === cardId);
  if (!def) return;
  pendingCardId  = cardId;
  pendingCardDef = def;
  document.getElementById('cardModalTitle').textContent = def.name.toUpperCase();
  document.getElementById('cardModalTeamA').textContent = state.teams.a.name;
  document.getElementById('cardModalTeamB').textContent = state.teams.b.name;
  document.getElementById('cardTeamModal').classList.add('open');
}

function closeCardModal() {
  document.getElementById('cardTeamModal').classList.remove('open');
  pendingCardId = pendingCardDef = null;
}

function confirmCard(team) {
  if (!pendingCardId || !state) return;
  const cardId = pendingCardId;
  const dur    = pendingCardDef?.duration;
  send({ type: 'PLAY_CARD', cardId, team, duration: dur });
  closeCardModal();
  markCardPlayed(cardId);
  unlockAudio();
}

function confirmCardNoTeam() {
  if (!pendingCardId) return;
  const cardId = pendingCardId;
  const dur    = pendingCardDef?.duration;
  send({ type: 'PLAY_CARD', cardId, team: null, duration: dur });
  closeCardModal();
  markCardPlayed(cardId);
  unlockAudio();
}

// Green tick feedback on card button
function markCardPlayed(cardId) {
  const btn = document.querySelector(`.card-play-item[data-card-id="${cardId}"]`);
  if (!btn) return;
  btn.classList.add('played');
  setTimeout(() => btn.classList.remove('played'), 4000);
}

// ─── DISCIPLINE ────────────────────────────────────────────────────────────────
function playDiscipline(team, cardType) {
  const sel = document.getElementById(`playerSel${team.toUpperCase()}${cardType}`);
  const playerName = sel ? sel.value : '';
  send({ type: 'PLAY_DISCIPLINE', team, cardType, playerName });
  unlockAudio();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderAdmin() {
  renderPhase();
  renderTimer();
  renderGoals();
  renderCards();
  renderActiveList();
  renderTeamMgmt();
  renderPlayerSelectors();
  renderCardDurationSettings();
  renderTransitionVideos();
  renderCustomSounds();
}

function renderPhase() {
  document.querySelectorAll('.phase-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.phase === state.phase);
  });
}

function renderTimer() {
  const el = document.getElementById('adminTimerDisplay');
  el.textContent = formatTime(state.timer.value);
  el.classList.toggle('running', state.timer.running);
  document.getElementById('btnPlay').style.display  = state.timer.running ? 'none' : 'flex';
  document.getElementById('btnPause').style.display = state.timer.running ? 'flex' : 'none';
}

function renderGoals() {
  document.getElementById('scoreA').textContent    = state.teams.a.goals;
  document.getElementById('scoreB').textContent    = state.teams.b.goals;
  document.getElementById('goalNameA').textContent = state.teams.a.name;
  document.getElementById('goalNameB').textContent = state.teams.b.name;
}

function renderCards() {
  const container = document.getElementById('cardsGrid');
  container.innerHTML = '';
  // Exclude rigore presidenziale from regular card grid (it has its own dedicated button)
  const regularCards = (state.cardDefs || []).filter(def => def.id !== 'rigorePresidenziale');
  regularCards.forEach(def => {
    const el = document.createElement('div');
    el.className = 'card-play-item';
    el.dataset.cardId = def.id;
    el.onclick = () => openCardModal(def.id);
    el.innerHTML = `
      <div class="card-played-tick">✓</div>
      <img class="card-play-img" src="/carte/${encodeURIComponent(def.image)}" alt="${def.name}">
      <div class="card-play-name">${def.name}</div>
      <div class="card-play-dur">${formatTime(def.duration)}</div>
    `;
    container.appendChild(el);
  });
}

function renderActiveList() {
  const container = document.getElementById('activeList');
  container.innerHTML = '';

  const cards = state.activeCards || [];
  const discA = state.teams.a.disciplineCards || [];
  const discB = state.teams.b.disciplineCards || [];
  const all   = [
    ...cards.map(c => ({ ...c, kind: 'card' })),
    ...discA.map(c => ({ ...c, kind: 'disc', team: 'a' })),
    ...discB.map(c => ({ ...c, kind: 'disc', team: 'b' })),
  ];

  if (!all.length) {
    container.innerHTML = '<div class="empty-state">Nessun elemento attivo</div>';
    return;
  }

  all.forEach(item => {
    const el = document.createElement('div');
    if (item.kind === 'card') {
      const teamLabel = item.team ? ` (${item.team === 'a' ? state.teams.a.name : state.teams.b.name})` : '';
      el.className = 'active-item';
      el.innerHTML = `
        <img src="/carte/${encodeURIComponent(item.image)}" alt="${item.name}">
        <div class="active-item-info">
          <div class="active-item-name">${item.name}${teamLabel}${item.expired ? ' — SCADUTA' : ''}</div>
          <div class="active-item-time" style="${item.expired ? 'color:#ff4444' : ''}">${item.expired ? 'SCADUTA' : formatTime(item.timeLeft)}</div>
        </div>
        <button class="active-item-remove" onclick="removeCard('${item.id}')">✕</button>
      `;
    } else {
      const teamName = item.team === 'a' ? state.teams.a.name : state.teams.b.name;
      el.className = 'active-item discipline';
      el.innerHTML = `
        <div class="disc-color ${item.type}"></div>
        <div class="active-item-info">
          <div class="active-item-name">${item.playerName || teamName}</div>
          <div class="active-item-time">${formatTime(item.timeLeft)}</div>
        </div>
        <button class="active-item-remove" onclick="removeDiscipline('${item.team}','${item.id}')">✕</button>
      `;
    }
    container.appendChild(el);
  });
}

function renderTeamMgmt() {
  document.getElementById('teamANameInput').value = state.teams.a.name;
  document.getElementById('teamBNameInput').value = state.teams.b.name;

  const setLogoPreview = (id, url) => {
    const el = document.getElementById(id);
    if (url) { el.src = url; el.style.display = 'block'; }
    else el.style.display = 'none';
  };
  setLogoPreview('logoPreviewA', state.teams.a.logo);
  setLogoPreview('logoPreviewB', state.teams.b.logo);

  document.getElementById('videoStatusA').textContent       = state.teams.a.goalVideoUrl ? '✓ Video caricato' : '';
  document.getElementById('videoStatusB').textContent       = state.teams.b.goalVideoUrl ? '✓ Video caricato' : '';
  document.getElementById('rigoreVideoStatus').textContent  = state.rigorePres?.videoUrl ? '✓ Video caricato' : '';

  renderPlayerLists();
}

function renderPlayerLists() {
  ['a', 'b'].forEach(team => {
    const listEl = document.getElementById(`playerList${team.toUpperCase()}`);
    listEl.innerHTML = '';
    (state.teams[team].players || []).forEach((p, idx) => {
      const name     = typeof p === 'string' ? p : p.name;
      const hasVideo = typeof p === 'object' && !!p.goalVideoUrl;
      const el = document.createElement('div');
      el.className = 'player-item';
      el.innerHTML = `
        <span class="player-name-text">${name}</span>
        <label class="player-vid-btn${hasVideo ? ' has-vid' : ''}" title="${hasVideo ? 'Video gol caricato' : 'Carica video gol'}">
          🎬<input type="file" accept="video/*" style="display:none" onchange="uploadPlayerVideo('${team}','${name.replace(/'/g,"\\'").replace(/"/g,'\\"')}',this)">
        </label>
        <button class="player-del" onclick="removePlayer('${team}',${idx})">✕</button>
      `;
      listEl.appendChild(el);
    });
  });
}

function renderPlayerSelectors() {
  [['a','yellow'],['a','red'],['b','yellow'],['b','red']].forEach(([team, type]) => {
    const sel = document.getElementById(`playerSel${team.toUpperCase()}${type}`);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— Generico —</option>';
    (state.teams[team].players || []).forEach(p => {
      const name = typeof p === 'string' ? p : p.name;
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  });
}

function renderCardDurationSettings() {
  const grid = document.getElementById('cardDurationGrid');
  if (!grid) return;
  grid.innerHTML = '';
  (state.cardDefs || []).forEach(def => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = `
      <label>${def.name}</label>
      <input type="number" id="cardDur_${def.id}" value="${Math.floor(def.duration / 60)}" min="0" max="60">
      <span>min</span>
    `;
    grid.appendChild(row);
  });
}

// ─── TEAM MANAGEMENT ──────────────────────────────────────────────────────────
function saveTeamName(team) {
  const name = document.getElementById(`team${team.toUpperCase()}NameInput`).value.trim();
  if (name) send({ type: 'UPDATE_TEAM', team, data: { name } });
}

async function uploadLogo(team, input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  send({ type: 'UPDATE_TEAM', team, data: { logo: data.url } });
}

async function uploadVideo(team, input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  send({ type: 'UPDATE_TEAM', team, data: { goalVideoUrl: data.url } });
}

async function uploadRigoreVideo(input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  send({ type: 'SET_RIGORE_VIDEO', url: data.url });
}

function addPlayer(team) {
  const input = document.getElementById(`playerInput${team.toUpperCase()}`);
  const name  = input.value.trim();
  if (!name) return;
  const existing = (state.teams[team].players || []).map(p => typeof p === 'string' ? { name: p, goalVideoUrl: null } : p);
  send({ type: 'UPDATE_TEAM', team, data: { players: [...existing, { name, goalVideoUrl: null }] } });
  input.value = '';
}

async function uploadPlayerVideo(team, playerName, input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res  = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  send({ type: 'SET_PLAYER_VIDEO', team, playerName, url: data.url });
}

function removePlayer(team, idx) {
  const players = [...(state.teams[team].players || [])];
  players.splice(idx, 1);
  send({ type: 'UPDATE_TEAM', team, data: { players } });
}

function loadTeamsJSON(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const teams = JSON.parse(e.target.result);
      send({ type: 'LOAD_TEAMS_JSON', teams });
      alert('Squadre caricate!');
    } catch(err) { alert('Errore nel JSON: ' + err.message); }
  };
  reader.readAsText(file);
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function saveSettings() {
  const mins = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? null : v * 60; };
  const s = state.settings;
  const settings = {
    tempo1Duration:      mins('set_tempo1')      ?? s.tempo1Duration,
    momentoDadoDuration: mins('set_momentodado') ?? s.momentoDadoDuration,
    tempo2Duration:      mins('set_tempo2')      ?? s.tempo2Duration,
    golX2Duration:       mins('set_golx2')       ?? s.golX2Duration,
    yellowCardDuration:  mins('set_yellow')      ?? s.yellowCardDuration,
    redCardDuration:     mins('set_red')         ?? s.redCardDuration,
  };
  const cardDurations = (state.cardDefs || []).map(def => {
    const input = document.getElementById(`cardDur_${def.id}`);
    const val   = input ? parseFloat(input.value) * 60 : def.duration;
    return { id: def.id, duration: isNaN(val) ? def.duration : val };
  });
  send({ type: 'UPDATE_SETTINGS', settings, cardDurations });
  alert('Impostazioni salvate!');
}

// ─── TRANSITION VIDEOS ────────────────────────────────────────────────────────
const TRANSITION_DEFS = [
  { key: 'pre_1tempo',         label: 'Pre → 1° Tempo' },
  { key: '1tempo_momentodado', label: '1° Tempo → Momento Dado' },
  { key: 'momentodado_2tempo', label: 'Momento Dado → 2° Tempo' },
  { key: '2tempo_golx2',       label: '2° Tempo → Gol x2' },
  { key: 'golx2_post',         label: 'Gol x2 → Fine Partita' },
];

function renderTransitionVideos() {
  const container = document.getElementById('transitionVideoList');
  if (!container || !state) return;
  const tvs = state.transitionVideos || {};
  container.innerHTML = '';
  TRANSITION_DEFS.forEach(t => {
    const has = !!tvs[t.key];
    const div = document.createElement('div');
    div.className = 'media-upload-row';
    div.innerHTML = `
      <span class="media-label">${t.label}</span>
      <label class="media-upload-btn">🎬 Carica
        <input type="file" accept="video/*" style="display:none" onchange="uploadTransitionVideo('${t.key}', this)">
      </label>
      ${has ? `<button class="media-remove-btn" onclick="removeTransitionVideo('${t.key}')">✕</button>` : ''}
      <span class="media-status${has ? ' has-media' : ''}">${has ? '✓' : '—'}</span>
    `;
    container.appendChild(div);
  });
}

async function uploadTransitionVideo(key, input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  send({ type: 'SET_TRANSITION_VIDEO', key, url: data.url });
}

function removeTransitionVideo(key) {
  send({ type: 'SET_TRANSITION_VIDEO', key, url: null });
}

// ─── CUSTOM SOUNDS ────────────────────────────────────────────────────────────
const SOUND_DEFS = [
  { key: 'goal',        label: '⚽ Goal' },
  { key: 'card',        label: '🃏 Carta speciale' },
  { key: 'yellowCard',  label: '🟡 Cartellino giallo' },
  { key: 'redCard',     label: '🔴 Cartellino rosso' },
  { key: 'playerAlert', label: '⬆ Alert giocatore' },
  { key: 'rigore',      label: '⚽ Rigore Presidenziale' },
  { key: 'phaseStart',  label: '▶ Inizio fase' },
  { key: 'phaseEnd',    label: '⏹ Fine fase' },
];

function renderCustomSounds() {
  const container = document.getElementById('customSoundList');
  if (!container || !state) return;
  const sounds = state.sounds || {};
  container.innerHTML = '';
  SOUND_DEFS.forEach(s => {
    const has = !!sounds[s.key];
    const div = document.createElement('div');
    div.className = 'media-upload-row';
    div.innerHTML = `
      <span class="media-label">${s.label}</span>
      <label class="media-upload-btn">🔊 Carica
        <input type="file" accept="audio/*" style="display:none" onchange="uploadCustomSound('${s.key}', this)">
      </label>
      ${has ? `<button class="media-remove-btn" onclick="removeCustomSound('${s.key}')">✕</button>` : ''}
      <span class="media-status${has ? ' has-media' : ''}">${has ? '✓' : '—'}</span>
    `;
    container.appendChild(div);
  });
}

async function uploadCustomSound(key, input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  send({ type: 'SET_SOUND', key, url: data.url });
}

function removeCustomSound(key) {
  send({ type: 'SET_SOUND', key, url: null });
}

// ─── TEAM PRESETS ─────────────────────────────────────────────────────────────
let teamPresets = {};

async function fetchPresets() {
  try {
    const res = await fetch('/api/presets');
    teamPresets = await res.json();
  } catch(e) { teamPresets = {}; }
  renderPresetSelector();
}

function renderPresetSelector() {
  const sel = document.getElementById('presetSelector');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Seleziona preset —</option>';
  Object.keys(teamPresets).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  // Restore selection if still available
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

function loadPreset(team) {
  const name = document.getElementById('presetSelector')?.value;
  if (!name || !teamPresets[name]) { alert('Seleziona un preset prima'); return; }
  send({ type: 'UPDATE_TEAM', team, data: teamPresets[name] });
}

async function savePreset(team) {
  if (!state) return;
  const t = state.teams[team];
  const defaultName = t.name || `Squadra ${team.toUpperCase()}`;
  const name = window.prompt('Nome del preset:', defaultName);
  if (!name || !name.trim()) return;
  const data = {
    name:        t.name,
    logo:        t.logo        || null,
    players:     (t.players || []).map(p => typeof p === 'string' ? { name: p, goalVideoUrl: null } : p),
    goalVideoUrl: t.goalVideoUrl || null,
  };
  await fetch('/api/presets', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: name.trim(), data }),
  });
  await fetchPresets();
  // Select the just-saved preset
  const sel = document.getElementById('presetSelector');
  if (sel) sel.value = name.trim();
}

async function deleteSelectedPreset() {
  const name = document.getElementById('presetSelector')?.value;
  if (!name) { alert('Seleziona un preset da eliminare'); return; }
  if (!confirm(`Eliminare il preset "${name}"?`)) return;
  await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await fetchPresets();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function unlockAudio() { try { getAudioCtx(); } catch(e) {} }

document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('touchstart', unlockAudio, { once: true });
  document.body.addEventListener('click',      unlockAudio, { once: true });
  fetchPresets();
});
