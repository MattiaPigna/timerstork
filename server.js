const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const PORT      = process.env.PORT || 3000;
const DATA_DIR  = process.env.DATA_DIR || __dirname;
const ADMIN_PIN = process.env.ADMIN_PIN || '';
const adminTokens = new Set();

const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
const replaysDir = path.join(publicDir, 'replays');
if (!fs.existsSync(replaysDir)) fs.mkdirSync(replaysDir, { recursive: true });

app.use(express.json());
app.use(express.static(publicDir));
app.use('/carte', express.static(path.join(__dirname, 'carte')));
app.use('/uploads', express.static(uploadsDir));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'logo (2).png')));
app.get('/admin',   (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('/overlay', (req, res) => res.sendFile(path.join(publicDir, 'overlay.html')));
app.get('/var',     (req, res) => res.sendFile(path.join(publicDir, 'var.html')));
app.get('/varadmin', (req, res) => res.sendFile(path.join(publicDir, 'varadmin.html')));

// Serve clip da percorso arbitrario (cartella OBS esterna)
app.get('/var-clip/:filename', (req, res) => {
  const filePath = path.join(currentWatchPath, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ─── REPLAY CONFIG ────────────────────────────────────────────────────────────
const varConfigFile = path.join(__dirname, 'var_config.json');
function readVarConfig() {
  try { if (fs.existsSync(varConfigFile)) return JSON.parse(fs.readFileSync(varConfigFile, 'utf8')); } catch(e) {}
  return { watchPath: '' };
}
function saveVarConfig(cfg) {
  fs.writeFileSync(varConfigFile, JSON.stringify(cfg, null, 2));
}

let varConfig = readVarConfig();
let currentWatchPath = varConfig.watchPath && fs.existsSync(varConfig.watchPath)
  ? varConfig.watchPath : replaysDir;

// API per aggiornare il percorso
app.post('/api/var-watch-path', (req, res) => {
  const { watchPath } = req.body;
  if (!watchPath || !fs.existsSync(watchPath)) {
    return res.status(400).json({ error: 'Percorso non valido o non trovato' });
  }
  varConfig.watchPath = watchPath;
  saveVarConfig(varConfig);
  startWatcher(watchPath);
  res.json({ ok: true, watchPath });
});

app.get('/api/var-watch-path', (req, res) => {
  res.json({ watchPath: currentWatchPath });
});

// ─── REPLAY FILE WATCHER ───────────────────────────────────────────────────────
let lastNotifiedClip = null;
let watchDebounce    = null;
let activeWatcher    = null;

function startWatcher(watchPath) {
  if (activeWatcher) { try { activeWatcher.close(); } catch(e) {} }
  if (!fs.existsSync(watchPath)) return;
  currentWatchPath = watchPath;
  lastNotifiedClip = null;
  activeWatcher = fs.watch(watchPath, (eventType, filename) => {
    if (!filename || !/\.(mp4|mov|mkv|avi|webm)$/i.test(filename)) return;
    clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
      const full = path.join(watchPath, filename);
      if (!fs.existsSync(full) || filename === lastNotifiedClip) return;
      lastNotifiedClip = filename;
      const isExternal = watchPath !== replaysDir;
      const url = isExternal
        ? `/var-clip/${encodeURIComponent(filename)}`
        : `/replays/${encodeURIComponent(filename)}`;
      io.emit('varClipReady', { filename, url, watchPath });
      io.emit('varLoad', { url, filename });
    }, 800);
  });
}

startWatcher(currentWatchPath);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// ─── TEAM STATE PERSISTENCE ────────────────────────────────────────────────────
const teamsStateFile = path.join(DATA_DIR, 'teams_state.json');

function readTeamsState() {
  try { if (fs.existsSync(teamsStateFile)) return JSON.parse(fs.readFileSync(teamsStateFile, 'utf8')); }
  catch(e) {}
  return null;
}

function saveTeamsState() {
  const data = {
    a: { name: state.teams.a.name, logo: state.teams.a.logo, players: state.teams.a.players, goalVideoUrl: state.teams.a.goalVideoUrl },
    b: { name: state.teams.b.name, logo: state.teams.b.logo, players: state.teams.b.players, goalVideoUrl: state.teams.b.goalVideoUrl },
  };
  try { fs.writeFileSync(teamsStateFile, JSON.stringify(data, null, 2), 'utf8'); } catch(e) {}
}

// ─── TEAM PRESETS (saved to disk) ──────────────────────────────────────────────
const presetsFile = path.join(DATA_DIR, 'team_presets.json');

function readPresets() {
  try { if (fs.existsSync(presetsFile)) return JSON.parse(fs.readFileSync(presetsFile, 'utf8')); }
  catch(e) {}
  return {};
}
function writePresets(p) { fs.writeFileSync(presetsFile, JSON.stringify(p, null, 2), 'utf8'); }

app.get('/api/presets', (req, res) => res.json(readPresets()));

app.post('/api/presets', express.json(), (req, res) => {
  const { name, data } = req.body || {};
  if (!name || !data) return res.status(400).json({ error: 'name + data required' });
  const p = readPresets(); p[name] = data; writePresets(p);
  res.json({ ok: true });
});

app.delete('/api/presets/:name', (req, res) => {
  const p = readPresets(); delete p[req.params.name]; writePresets(p);
  res.json({ ok: true });
});

// ─── ADMIN AUTH ────────────────────────────────────────────────────────────────

app.get('/api/admin-pin-required', (req, res) => {
  res.json({ required: !!ADMIN_PIN });
});

app.post('/api/admin-auth', express.json(), (req, res) => {
  if (!ADMIN_PIN) return res.json({ token: 'open' });
  if (req.body?.pin !== ADMIN_PIN) return res.status(401).json({ error: 'PIN errato' });
  const token = crypto.randomBytes(16).toString('hex');
  adminTokens.add(token);
  res.json({ token });
});

// ─── MATCH STATE PERSISTENCE ───────────────────────────────────────────────────

const matchStateFile = path.join(DATA_DIR, 'match_state.json');

function saveMatchState() {
  try {
    fs.writeFileSync(matchStateFile, JSON.stringify({
      phase:          state.phase,
      timer:          { value: state.timer.value, phaseDuration: state.timer.phaseDuration },
      goals:          { a: state.teams.a.goals, b: state.teams.b.goals },
      activeCards:    state.activeCards,
      rigorePres:     state.rigorePres,
      var:            state.var,
      settings:       state.settings,
      cardDefs:       state.cardDefs,
      transitionVideos: state.transitionVideos,
      sounds:         state.sounds,
    }), 'utf8');
  } catch(e) {}
}

function restoreMatchState() {
  try {
    if (!fs.existsSync(matchStateFile)) return;
    const d = JSON.parse(fs.readFileSync(matchStateFile, 'utf8'));
    if (d.phase)            state.phase = d.phase;
    if (d.timer)            { state.timer.value = d.timer.value || 0; state.timer.phaseDuration = d.timer.phaseDuration || 0; }
    if (d.goals)            { state.teams.a.goals = d.goals.a || 0; state.teams.b.goals = d.goals.b || 0; }
    if (d.activeCards)      state.activeCards = d.activeCards;
    if (d.rigorePres)       state.rigorePres = { ...state.rigorePres, ...d.rigorePres };
    if (d.var)              state.var = { ...state.var, ...d.var, active: false };
    if (d.settings)         state.settings = { ...state.settings, ...d.settings };
    if (d.cardDefs)         state.cardDefs = d.cardDefs;
    if (d.transitionVideos) state.transitionVideos = { ...state.transitionVideos, ...d.transitionVideos };
    if (d.sounds)           state.sounds = { ...state.sounds, ...d.sounds };
    console.log(`  ✅ Stato partita ripristinato (fase: ${state.phase}, ${state.teams.a.goals}-${state.teams.b.goals})`);
  } catch(e) { console.warn('  ⚠ Impossibile ripristinare lo stato partita:', e.message); }
}

// ─── GAME STATE ────────────────────────────────────────────────────────────────

// duration: 0  = permanent card (no countdown, stays until manually removed)
// duration: >0 = card with countdown timer in seconds
const CARD_DEFS = [
  { id: 'starplayer',          name: 'Star Player',          image: 'Starplayer(1)_senza_sfondo.png',           duration: 0   },
  { id: 'golx2card',           name: 'Gol x2',               image: 'golx2(1)_senza_sfondo.png',                duration: 120 },
  { id: 'joker',               name: 'Joker',                image: 'joker(2)_senza_sfondo.png',                duration: 120 },
  { id: 'obrigado',            name: 'Obrigado',             image: 'obrigado(2)_senza_sfondo.png',             duration: 120 },
  { id: 'penalty',             name: 'Penalty',              image: 'penalty(2)_senza_sfondo.png',              duration: 0   },
  { id: 'reversepenalty',      name: 'Reverse Penalty',      image: 'reverse penalty(1)_senza_sfondo.png',      duration: 0   },
  { id: 'shootout',            name: 'Shootout',             image: 'shootout(1)_senza_sfondo.png',             duration: 0   },
  { id: 'suspension',          name: 'Suspension',           image: 'suspension(1)_senza_sfondo.png',           duration: 120 },
  { id: 'rigorePresidenziale', name: 'Rigore Presidenziale', image: 'rigore presidenziale(4)_senza_sfondo.png', duration: 0   },
];

function makeState() {
  return {
    phase: 'pre',
    timer: { running: false, value: 0, phaseDuration: 0 },
    teams: {
      a: { name: 'Squadra A', logo: null, goals: 0, players: [], disciplineCards: [], goalVideoUrl: null },
      b: { name: 'Squadra B', logo: null, goals: 0, players: [], disciplineCards: [], goalVideoUrl: null },
    },
    activeCards: [],
    goalLog: [],
    consumedCards: [],
    rigorePres: { videoUrl: null, playedA: false, playedB: false },
    var: { usedA: false, usedB: false, active: false, resultA: null, resultB: null, lastTeam: null },
    varClip: null, // { url, filename } — ultima clip caricata sul VAR replay
    // Custom transition videos per phase pair
    transitionVideos: {
      'pre_1tempo': null, '1tempo_momentodado': null,
      'momentodado_2tempo': null, '2tempo_golx2': null, 'golx2_post': null,
    },
    // Custom sound files (null = use synthesized)
    sounds: {
      goal: null, card: null, yellowCard: null, redCard: null,
      playerAlert: null, rigore: null, phaseStart: null, phaseEnd: null,
    },
    settings: {
      tempo1Duration:      600,
      momentoDadoDuration: 120,
      tempo2Duration:      600,
      golX2Duration:       120,
      cardDefaultDuration: 120,
      yellowCardDuration:  120,
      redCardDuration:     240,
    },
    cardDefs: CARD_DEFS,
  };
}

let state = makeState();

function migratePlayers(players) {
  return (players || []).map(p => typeof p === 'string' ? { name: p, goalVideoUrl: null } : p);
}

// Restore persisted team data on startup
{
  const saved = readTeamsState();
  if (saved) {
    if (saved.a) state.teams.a = { ...state.teams.a, ...saved.a, players: migratePlayers(saved.a.players), disciplineCards: [], goals: 0 };
    if (saved.b) state.teams.b = { ...state.teams.b, ...saved.b, players: migratePlayers(saved.b.players), disciplineCards: [], goals: 0 };
  }
}
// Restore persisted match state (phase, timer, score, cards)
restoreMatchState();

function phaseDuration(phase) {
  const s = state.settings;
  return { pre: 0, post: 0, '1tempo': s.tempo1Duration, momentodado: s.momentoDadoDuration, '2tempo': s.tempo2Duration, golx2: s.golX2Duration }[phase] || 0;
}

// ─── TIMER ─────────────────────────────────────────────────────────────────────

let timerTick = null;
let timerStartMs = null;
let timerStartValue = 0;

function startTimer() {
  if (timerTick) return;
  state.timer.running = true;
  timerStartMs = Date.now();
  timerStartValue = state.timer.value;
  timerTick = setInterval(() => {
    const prev = state.timer.value;
    const elapsed = Math.floor((Date.now() - timerStartMs) / 1000);
    state.timer.value = timerStartValue + elapsed;
    const delta = state.timer.value - prev;
    if (delta <= 0) return;

    // player-entry alerts at min 1, 2, 3
    for (let s = prev + 1; s <= state.timer.value; s++) {
      if (['1tempo', '2tempo'].includes(state.phase) && s <= 180 && s % 60 === 0) {
        io.emit('playerEntryAlert', { minute: s / 60 });
      }
    }

    // tick special-card countdowns (only for cards with a timer; permanent cards skip)
    let cardChanged = false;
    state.activeCards = state.activeCards.map(c => {
      if (!c.expired && c.totalDuration > 0 && c.timeLeft > 0) {
        c.timeLeft = Math.max(0, c.timeLeft - delta);
        if (c.timeLeft === 0) { c.expired = true; cardChanged = true; }
      }
      return c;
    });

    // discipline cards auto-remove when expired
    ['a', 'b'].forEach(t => {
      state.teams[t].disciplineCards = state.teams[t].disciplineCards
        .map(c => { if (c.timeLeft > 0) c.timeLeft = Math.max(0, c.timeLeft - delta); return c; })
        .filter(c => c.timeLeft > 0);
    });

    io.emit('tick', {
      value: state.timer.value,
      activeCards: state.activeCards,
      disciplineA: state.teams.a.disciplineCards,
      disciplineB: state.teams.b.disciplineCards,
    });

    if (cardChanged) io.emit('state', state);

    // salva lo stato ogni 30 secondi
    if (state.timer.value % 30 === 0) saveMatchState();

    // phase end when elapsed >= phaseDuration (only for phases with a duration)
    if (state.timer.phaseDuration > 0 && state.timer.value >= state.timer.phaseDuration) {
      stopTimer();
      io.emit('phaseEnd', { phase: state.phase });
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerTick);
  timerTick = null;
  state.timer.running = false;
  timerStartMs = null;
}

// ─── ACTIONS ───────────────────────────────────────────────────────────────────

function handle(action) {
  switch (action.type) {

    case 'SET_PHASE': {
      const fromPhase = state.phase;
      stopTimer();
      state.phase = action.phase;
      const dur = phaseDuration(action.phase);
      state.timer.value = 0;
      state.timer.phaseDuration = dur;
      state.timer.running = false;
      io.emit('phaseChange', { from: fromPhase, to: action.phase });
      saveMatchState();
      break;
    }

    case 'TIMER_START': startTimer(); break;
    case 'TIMER_PAUSE': stopTimer();  break;

    case 'TIMER_RESET': {
      stopTimer();
      state.timer.value = 0;
      timerStartValue = 0;
      saveMatchState();
      break;
    }

    case 'TIMER_SET': {
      state.timer.value = action.value;
      if (state.timer.running) {
        timerStartMs = Date.now();
        timerStartValue = action.value;
      }
      break;
    }

    case 'ADD_GOAL': {
      const { team, amount, playerName } = action;
      state.teams[team].goals = Math.max(0, state.teams[team].goals + amount);
      if (amount > 0) {
        state.goalLog.push({
          team,
          playerName: playerName || null,
          timerValue: state.timer.value,
          phase: state.phase,
          scoreA: state.teams.a.goals,
          scoreB: state.teams.b.goals,
        });
      }
      let playerVideoUrl = null;
      if (playerName) {
        const player = (state.teams[team].players || []).find(p =>
          (typeof p === 'string' ? p : p.name) === playerName
        );
        if (player && typeof player === 'object') playerVideoUrl = player.goalVideoUrl || null;
      }
      io.emit('goalEvent', {
        team, amount,
        goals: { a: state.teams.a.goals, b: state.teams.b.goals },
        playerName: playerName || null,
        playerVideoUrl,
        videoUrl: state.teams[team].goalVideoUrl || null,
      });
      saveMatchState();
      break;
    }

    case 'SET_PLAYER_VIDEO': {
      const { team, playerName, url } = action;
      state.teams[team].players = (state.teams[team].players || []).map(p => {
        if (typeof p === 'string') p = { name: p, goalVideoUrl: null };
        return p.name === playerName ? { ...p, goalVideoUrl: url } : p;
      });
      saveTeamsState();
      break;
    }

    case 'PLAY_CARD': {
      const def = state.cardDefs.find(c => c.id === action.cardId);
      if (!def) break;
      const dur = action.duration !== undefined ? action.duration : def.duration;
      const card = {
        id: `${Date.now()}`,
        cardId: action.cardId,
        name: def.name,
        image: def.image,
        team: action.team || null,
        timeLeft: dur,
        totalDuration: dur,
        expired: false,
      };
      state.activeCards.push(card);
      io.emit('animation', { type: 'card', card });
      break;
    }

    case 'VAR_CALL': {
      if (action.team === 'a') state.var.usedA = true;
      if (action.team === 'b') state.var.usedB = true;
      state.var.active = true;
      state.var.lastTeam = action.team;
      io.emit('varCall', { team: action.team });
      break;
    }

    case 'VAR_RESULT': {
      state.var.active = false;
      if (action.team === 'a') state.var.resultA = action.result;
      if (action.team === 'b') state.var.resultB = action.result;
      io.emit('varResult', { result: action.result, team: action.team });
      break;
    }

    case 'RESET_RIGORE_PRES': {
      if (action.team === 'a') state.rigorePres.playedA = false;
      if (action.team === 'b') state.rigorePres.playedB = false;
      io.emit('state', state);
      break;
    }

    case 'VAR_LOAD': {
      state.varClip = { url: action.url, filename: action.filename };
      io.emit('varLoad', state.varClip);
      return;
    }
    case 'VAR_CONTROL': {
      io.emit('varControl', { ctrl: action.ctrl, value: action.value });
      return;
    }
    case 'VAR_CLOSE': {
      state.varClip = null;
      io.emit('varClose');
      return;
    }

    case 'PLAY_RIGORE_PRES': {
      if (action.team === 'a') state.rigorePres.playedA = true;
      if (action.team === 'b') state.rigorePres.playedB = true;
      io.emit('animation', { type: 'rigorePres', team: action.team, videoUrl: state.rigorePres?.videoUrl || null });
      break;
    }

    case 'SET_RIGORE_VIDEO': {
      state.rigorePres = { ...state.rigorePres, videoUrl: action.url };
      break;
    }

    case 'SET_TRANSITION_VIDEO': {
      if (state.transitionVideos.hasOwnProperty(action.key)) {
        state.transitionVideos[action.key] = action.url;
      }
      break;
    }

    case 'SET_SOUND': {
      if (state.sounds.hasOwnProperty(action.key)) {
        state.sounds[action.key] = action.url;
      }
      break;
    }

    case 'PLAY_DISCIPLINE': {
      const { team, cardType, playerName } = action;
      const dur = cardType === 'yellow' ? state.settings.yellowCardDuration : state.settings.redCardDuration;
      const dc = {
        id: `${Date.now()}`,
        type: cardType, team,
        playerName: playerName || '',
        timeLeft: dur, totalDuration: dur,
      };
      state.teams[team].disciplineCards.push(dc);
      io.emit('animation', { type: 'discipline', card: dc });
      break;
    }

    case 'REMOVE_CARD': {
      const removing = state.activeCards.find(c => c.id === action.id);
      if (removing && removing.totalDuration === 0) {
        state.consumedCards.push({ ...removing, consumed: true });
      }
      state.activeCards = state.activeCards.filter(c => c.id !== action.id);
      saveMatchState();
      break;
    }

    case 'REMOVE_DISCIPLINE': {
      state.teams[action.team].disciplineCards =
        state.teams[action.team].disciplineCards.filter(c => c.id !== action.id);
      break;
    }

    case 'UPDATE_TEAM': {
      state.teams[action.team] = { ...state.teams[action.team], ...action.data };
      saveTeamsState();
      break;
    }

    case 'UPDATE_SETTINGS': {
      state.settings = { ...state.settings, ...action.settings };
      if (action.cardDurations) {
        action.cardDurations.forEach(({ id, duration }) => {
          const def = state.cardDefs.find(c => c.id === id);
          if (def) def.duration = duration;
        });
      }
      saveMatchState();
      break;
    }

    case 'LOAD_TEAMS_JSON': {
      const { teams } = action;
      if (teams.a) state.teams.a = { ...state.teams.a, ...teams.a, players: migratePlayers(teams.a.players), disciplineCards: [], goals: 0 };
      if (teams.b) state.teams.b = { ...state.teams.b, ...teams.b, players: migratePlayers(teams.b.players), disciplineCards: [], goals: 0 };
      break;
    }

    case 'RESET_MATCH': {
      stopTimer();
      const savedDefs   = state.cardDefs;
      const savedSett   = state.settings;
      const savedRig    = state.rigorePres;
      const savedTrans  = state.transitionVideos;
      const savedSounds = state.sounds;
      state = makeState();
      state.cardDefs         = savedDefs;
      state.settings         = savedSett;
      state.rigorePres       = savedRig;
      state.transitionVideos = savedTrans;
      state.sounds           = savedSounds;
      try { if (fs.existsSync(matchStateFile)) fs.unlinkSync(matchStateFile); } catch(e) {}
      break;
    }
  }

  io.emit('state', state);
}

// ─── SOCKET.IO ─────────────────────────────────────────────────────────────────

io.on('connection', socket => {
  socket.emit('state', state);
  if (state.varClip) socket.emit('varLoad', state.varClip);
  socket.on('action', action => {
    if (ADMIN_PIN && !adminTokens.has(socket.handshake.auth?.token)) {
      socket.emit('authError', { message: 'Token non valido' });
      return;
    }
    handle(action);
  });
});

// ─── START ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  Object.values(os.networkInterfaces()).flat().forEach(n => {
    if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  });

  console.log('\n🦢  STORK LEAGUE — SERVER AVVIATO');
  console.log('════════════════════════════════════');
  console.log(`  Display : http://localhost:${PORT}/`);
  console.log(`  Admin   : http://localhost:${PORT}/admin`);
  if (ips.length) {
    console.log('\n  Accesso da telefono (stessa WiFi):');
    ips.forEach(ip => console.log(`  Admin   : http://${ip}:${PORT}/admin`));
  }
  console.log('════════════════════════════════════\n');
});
