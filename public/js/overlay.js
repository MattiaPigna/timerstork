let state = null;
const lastCard = { a: null, b: null };

// ─── SOCKET ───────────────────────────────────────────────────────────────────
socket.on('state', s => { state = s; renderAll(); });

socket.on('tick', data => {
  if (!state) return;
  state.timer.value             = data.value;
  state.activeCards             = data.activeCards;
  state.teams.a.disciplineCards = data.disciplineA;
  state.teams.b.disciplineCards = data.disciplineB;
  renderTimer();
  renderTeamSlot('a');
  renderTeamSlot('b');
  renderDisc();
});

socket.on('goalEvent', data => {
  if (!state) return;
  state.teams.a.goals = data.goals.a;
  state.teams.b.goals = data.goals.b;
  renderScore();
  animateGoal(data.team, data.goals, data.playerName);
});

socket.on('animation', data => {
  if (data.type === 'card')       { animateCardFlip(data.card); }
  if (data.type === 'discipline') { animateDisc(data.card); }
  if (data.type === 'rigorePres') {
    if (state?.rigorePres) {
      if (data.team === 'a') state.rigorePres.playedA = true;
      if (data.team === 'b') state.rigorePres.playedB = true;
    }
    animateRigorePres(data.team);
  }
});

socket.on('phaseChange', data => {
  if (!state) return;
  state.phase = data.to;
  renderPhase();
  animatePhase(data.from, data.to);
});

socket.on('varCall', data => {
  if (state?.var) state.var.active = true;
  animateVarCall(data.team);
  renderVar();
});

socket.on('varResult', data => {
  if (state?.var) {
    state.var.active = false;
    if (data.team === 'a') state.var.resultA = data.result;
    if (data.team === 'b') state.var.resultB = data.result;
  }
  animateVarResult(data.result);
  renderVar();
});

// ─── RENDER BASE ──────────────────────────────────────────────────────────────
function renderAll() {
  if (!state) return;
  renderPhase();
  renderTeams();
  renderScore();
  renderTimer();
  renderTeamSlot('a');
  renderTeamSlot('b');
  renderRigore();
  renderVar();
  renderDisc();
}

function renderPhase() {
  const labels = { pre:'PRE','1tempo':'1° TEMPO',momentodado:'M. DADO','2tempo':'2° TEMPO',golx2:'GOL ×2',post:'FINE' };
  document.getElementById('obPhase').textContent = labels[state.phase] || state.phase;
  document.body.className = `phase-${state.phase}`;
}
function renderTeams() {
  document.getElementById('obNameA').textContent = state.teams.a.name;
  document.getElementById('obNameB').textContent = state.teams.b.name;
  setLogo('obImgA', state.teams.a.logo);
  setLogo('obImgB', state.teams.b.logo);
}
function setLogo(id, url) {
  const img = document.getElementById(id);
  if (!img) return;
  img.src = url || ''; img.style.display = url ? 'block' : 'none';
}
function renderScore() {
  const elA = document.getElementById('obScoreA'), elB = document.getElementById('obScoreB');
  const pA = elA.textContent, pB = elB.textContent;
  elA.textContent = state.teams.a.goals;
  elB.textContent = state.teams.b.goals;
  if (String(state.teams.a.goals) !== pA) bump(elA);
  if (String(state.teams.b.goals) !== pB) bump(elB);
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function renderTimer() {
  const el = document.getElementById('obTimer');
  el.textContent = formatTime(state.timer.value);
  const rem = state.timer.phaseDuration - state.timer.value;
  el.classList.toggle('warning', state.timer.phaseDuration > 0 && rem <= 30 && rem >= 0 && state.timer.running);
}

// ─── SLOT CARTE ───────────────────────────────────────────────────────────────
function renderTeamSlot(team) {
  const T = team.toUpperCase();
  const slot      = document.getElementById(`slot${T}`);
  const imgEl     = document.getElementById(`slot${T}Img`);
  const nameEl    = document.getElementById(`slot${T}Name`);
  const timerEl   = document.getElementById(`slot${T}Timer`);
  const barWrapEl = document.getElementById(`slot${T}BarWrap`);
  const barEl     = document.getElementById(`slot${T}Bar`);

  const cards        = state.activeCards || [];
  const consumed     = state.consumedCards || [];
  const activeCard   = cards.find(c => c.team === team && !c.expired);
  const expiredCard  = cards.find(c => c.team === team && c.expired);
  const consumedCard = consumed.slice().reverse().find(c => c.team === team);
  const anyCard = activeCard || expiredCard || consumedCard;
  if (anyCard) lastCard[team] = anyCard;
  const card = lastCard[team];

  if (!card) { slot.className = 'ob-card-slot state-none'; return; }

  const isPerm = card.totalDuration === 0, isExpired = card.expired || card.consumed;
  imgEl.src = cardImageUrl(card.image);
  nameEl.textContent = card.name.toUpperCase();

  if (isExpired) {
    slot.className = 'ob-card-slot state-played';
    timerEl.textContent = ''; barWrapEl.style.display = 'none';
  } else if (isPerm) {
    slot.className = 'ob-card-slot state-active';
    timerEl.textContent = ''; barWrapEl.style.display = 'none';
  } else {
    const pct = Math.max(0, (card.timeLeft / card.totalDuration) * 100);
    slot.className = 'ob-card-slot state-active';
    timerEl.textContent = formatTime(card.timeLeft);
    barWrapEl.style.display = 'block';
    barEl.style.width = `${pct.toFixed(1)}%`;
    barEl.className = `ob-slot-bar${pct < 25 ? ' low' : ''}`;
  }
}

function renderRigore() {
  setRigore('slotRigoreA', state?.rigorePres?.playedA || false);
  setRigore('slotRigoreB', state?.rigorePres?.playedB || false);
}
function setRigore(id, played) {
  document.getElementById(id).className = played
    ? 'ob-card-slot ob-rigore-slot state-played'
    : 'ob-card-slot ob-rigore-slot state-available';
}

function renderVar() {
  const v = state?.var || {};
  setVarBadge('varBadgeA', 'varTickA', v.usedA, v.resultA);
  setVarBadge('varBadgeB', 'varTickB', v.usedB, v.resultB);
}
function setVarBadge(badgeId, tickId, used, result) {
  const badge = document.getElementById(badgeId);
  const tick  = document.getElementById(tickId);
  if (!badge || !tick) return;
  const overturned = used && result === 'overturned';
  badge.classList.toggle('used', !!used);
  badge.classList.toggle('overturned', overturned);
  if (!used)          { tick.textContent = ''; tick.className = 'ob-var-tick'; }
  else if (overturned){ tick.textContent = '✗'; tick.className = 'ob-var-tick red'; }
  else                { tick.textContent = '✓'; tick.className = 'ob-var-tick'; }
}

function renderDisc() {
  const all = [
    ...(state.teams.a.disciplineCards || []).map(c => ({ ...c, teamName: state.teams.a.name })),
    ...(state.teams.b.disciplineCards || []).map(c => ({ ...c, teamName: state.teams.b.name })),
  ];
  document.getElementById('overlayDisc').innerHTML = all.map(c => `
    <div class="ob-disc-badge">
      <div class="ob-disc-color ${c.type}"></div>
      <div class="ob-disc-text">${c.playerName || c.teamName}</div>
      <div class="ob-disc-time">${formatTime(c.timeLeft)}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════════
// ANIMAZIONI
// ══════════════════════════════════════════════════════════════

// ─── GOL — testo che vola lungo la barra ──────────────────────
let goalAnimTimeout = null;
function animateGoal(team, goals, playerName) {
  const teamName = team === 'a' ? state?.teams?.a?.name : state?.teams?.b?.name;
  const anim = document.getElementById('obAnimGoal');
  const palette = ['#FF6B00','#FFD700','#FF8A30','rgba(255,255,255,.8)','#FF4400'];
  const sizes   = ['28px','36px','24px','42px','22px','32px'];
  let flies = '';
  for (let i = 0; i < 14; i++) {
    const top   = (8 + Math.random() * 56).toFixed(0);
    const size  = sizes[Math.floor(Math.random() * sizes.length)];
    const spd   = (.7 + Math.random() * .8).toFixed(2);
    const delay = (Math.random() * .5).toFixed(2);
    const col   = palette[Math.floor(Math.random() * palette.length)];
    flies += `<span class="ob-gol-fly" style="--top:${top}%;--size:${size};--spd:${spd}s;--delay:${delay}s;--col:${col}">GOL!</span>`;
  }
  document.getElementById('obGoalFlyTrack').innerHTML = flies;
  document.getElementById('obGoalCenter').innerHTML = `
    <div class="ob-goal-big">${teamName}${playerName ? ' — ' + playerName : ''}</div>
    <div class="ob-goal-sub-bar">${goals.a} &nbsp;—&nbsp; ${goals.b}</div>`;
  const sw = document.getElementById('obGoalSweep');
  sw.style.animation = 'none'; void sw.offsetWidth; sw.style.animation = '';
  anim.classList.add('active');
  clearTimeout(goalAnimTimeout);
  goalAnimTimeout = setTimeout(() => {
    anim.classList.remove('active');
    document.getElementById('obGoalFlyTrack').innerHTML = '';
    document.getElementById('obGoalCenter').innerHTML = '';
  }, 3800);
}

// ─── CARTA SPECIALE — flip 3D sotto la barra ──────────────────
let cardFlipTimeout = null;
function animateCardFlip(card) {
  const teamName = card.team ? (card.team === 'a' ? state?.teams?.a?.name : state?.teams?.b?.name) : '';
  const anim     = document.getElementById('obAnimCard');
  const inner    = document.getElementById('obCardFlipInner');
  const img      = document.getElementById('obCardFlipImg');

  img.src = cardImageUrl(card.image);
  document.getElementById('obCardFlipName').textContent = card.name.toUpperCase();
  document.getElementById('obCardFlipTeam').textContent = teamName;
  inner.classList.remove('flipped');

  anim.classList.remove('active');
  void anim.offsetWidth;
  anim.classList.add('active');

  // flip dopo 0.8s
  clearTimeout(cardFlipTimeout);
  const flipTimer = setTimeout(() => inner.classList.add('flipped'), 800);
  cardFlipTimeout = setTimeout(() => {
    anim.classList.remove('active');
    inner.classList.remove('flipped');
  }, 3800);
}

// ─── RIGORE PRESIDENZIALE — zoom poi tick ─────────────────────
let rigoreAnimTimeout = null;
function animateRigorePres(team) {
  const anim = document.getElementById('obAnimRigore');
  anim.classList.remove('active');
  void anim.offsetWidth;
  anim.classList.add('active');
  clearTimeout(rigoreAnimTimeout);
  rigoreAnimTimeout = setTimeout(() => {
    anim.classList.remove('active');
    renderRigore();
  }, 2800);
}

// ─── FASE — slide verticale sulla barra ───────────────────────
let phaseAnimTimeout = null;
function animatePhase(from, to) {
  const configs = {
    '1tempo':    { icon:'⚽', label:'1° TEMPO',     sub:"FISCHIO D'INIZIO", color:'#FF6B00' },
    momentodado: { icon:'🎲', label:'MOMENTO DADO', sub:'ESTRAZIONE DADO',  color:'#FF8A30' },
    '2tempo':    { icon:'⚽', label:'2° TEMPO',     sub:'SECONDO TEMPO',    color:'#FF6B00' },
    golx2:       { icon:'⚡', label:'GOL × 2',      sub:'ULTIMI 2 MINUTI!', color:'#FF3333' },
    post:        { icon:'🏆', label:'FINE PARTITA', sub:'PARTITA TERMINATA',color:'#FFD700' },
  };
  const cfg = configs[to];
  if (!cfg) return;
  const el = document.getElementById('obAnimPhase');
  el.style.borderBottomColor = cfg.color;
  el.innerHTML = `
    <span class="ob-phase-icon">${cfg.icon}</span>
    <span class="ob-phase-label" style="color:${cfg.color};text-shadow:0 0 30px ${cfg.color}88">${cfg.label}</span>
    <span class="ob-phase-sub">${cfg.sub}</span>`;
  el.classList.add('active');
  clearTimeout(phaseAnimTimeout);
  phaseAnimTimeout = setTimeout(() => el.classList.remove('active'), 2600);
}

// ─── VAR CHIAMATO ─────────────────────────────────────────────
let varAnimTimeout = null;
function animateVarCall(team) {
  const teamName = team === 'a' ? state?.teams?.a?.name : state?.teams?.b?.name;
  const el = document.getElementById('obAnimVar');
  el.innerHTML = `
    <span class="ob-var-anim-icon">🔍</span>
    <span class="ob-var-anim-label">VAR</span>
    <span class="ob-var-anim-team">${teamName || ''}</span>
    <span class="ob-var-anim-status blink">IN CORSO…</span>`;
  el.classList.add('active');
  clearTimeout(varAnimTimeout);
}

// ─── VAR RISULTATO ────────────────────────────────────────────
function animateVarResult(result) {
  const isConf = result === 'confirmed';
  const el = document.getElementById('obAnimVar');
  el.innerHTML = `
    <span class="ob-var-anim-icon">${isConf ? '✅' : '❌'}</span>
    <span class="ob-var-anim-label" style="${isConf ? 'color:#00C56E;text-shadow:0 0 28px rgba(0,197,110,.7)' : 'color:#E51B1B;text-shadow:0 0 28px rgba(229,27,27,.7)'}">VAR</span>
    <span class="ob-var-anim-status ${isConf ? 'conf' : 'over'}">${isConf ? '✓ CONFERMATO' : '✗ RIBALTATO'}</span>`;
  clearTimeout(varAnimTimeout);
  varAnimTimeout = setTimeout(() => el.classList.remove('active'), 4000);
}

// ─── CARTELLINO DISCIPLINARE ──────────────────────────────────
let discAnimTimeout = null;
function animateDisc(card) {
  const teamName = card.team === 'a' ? state?.teams?.a?.name : state?.teams?.b?.name;
  const el = document.getElementById('obAnimDisc');
  el.className = `ob-anim-disc team-${card.team}`;
  el.innerHTML = `
    <div class="ob-disc-shape ${card.type}"></div>
    <div class="ob-disc-info">
      <div class="ob-disc-pname">${card.playerName || teamName}</div>
      <div class="ob-disc-tname">${teamName}</div>
    </div>`;
  void el.offsetWidth;
  el.classList.add('active');
  clearTimeout(discAnimTimeout);
  discAnimTimeout = setTimeout(() => {
    el.style.transition = 'opacity .4s'; el.style.opacity = '0';
    setTimeout(() => { el.classList.remove('active'); el.style.opacity = ''; el.style.transition = ''; }, 420);
  }, 2800);
}
