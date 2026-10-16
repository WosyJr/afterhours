const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');

const RENAME_MS = Number(process.env.VOICE_RENAME_MS || 6 * 60000);
const TICK_MS = Number(process.env.VOICE_TICK_MS || 30000);

const seen = { names: {}, renamedAt: {}, alone: {}, told: {} };
let timer = null;

function log() { console.log.apply(console, ['[voice]'].concat([].slice.call(arguments))); }

function cfg() { return S.read('config', {}); }

function bases() { return S.read('voicebase', {}); }
function saveBases(v) { S.write('voicebase', v); }

function temps() {
  const t = S.read('temprooms', null);
  return Array.isArray(t) ? t : [];
}
function saveTemps(v) { S.write('temprooms', v); }

function peopleIn(channelId) {
  const out = [];
  Object.keys(G.live.voice || {}).forEach(uid => {
    const m = G.live.members[uid];
    if (!m || m.bot) return;
    if ((G.live.voice[uid] || {}).channel === channelId) out.push(uid);
  });
  return out;
}

function roomsWithPeople() {
  const rooms = {};
  Object.keys(G.live.voice || {}).forEach(uid => {
    const m = G.live.members[uid];
    if (!m || m.bot) return;
    const ch = (G.live.voice[uid] || {}).channel;
    if (!ch) return;
    (rooms[ch] = rooms[ch] || []).push(uid);
  });
  return rooms;
}

function gameOf(uid) {
  const p = G.live.presence[uid];
  if (!p || !p.activity) return null;
  if (p.activity.type !== 0) return null;
  const n = String(p.activity.name || '').trim();
  return n && n.length <= 40 ? n : null;
}

function topGame(who) {
  const tally = {};
  who.forEach(uid => {
    const g = gameOf(uid);
    if (g) tally[g] = (tally[g] || 0) + 1;
  });
  const names = Object.keys(tally);
  if (!names.length) return null;
  names.sort((a, b) => tally[b] - tally[a]);
  return { name: names[0], count: tally[names[0]] };
}

function baseName(channelId) {
  const b = bases();
  if (b[channelId]) return b[channelId];
  const live = G.live.channels[channelId];
  const raw = live ? live.name : '';
  const clean = String(raw).split(' — ')[0].trim();
  if (clean) {
    b[channelId] = clean;
    saveBases(b);
  }
  return clean;
}

function wantedName(channelId) {
  const base = baseName(channelId);
  if (!base) return null;
  const who = peopleIn(channelId);
  if (!who.length) return base;
  const g = topGame(who);
  if (!g) return base + ' — ' + who.length;
  return (base + ' — ' + g.name + ' (' + who.length + ')').slice(0, 95);
}

async function renameRooms() {
  if (!cfg().voiceNames || !D.botConfigured()) return;
  const rooms = Object.values(G.live.channels).filter(c => c.type === 2);
  for (const c of rooms) {
    if (isTemp(c.id)) continue;
    const want = wantedName(c.id);
    if (!want || want === c.name) continue;
    if (Date.now() - (seen.renamedAt[c.id] || 0) < RENAME_MS) continue;
    seen.renamedAt[c.id] = Date.now();
    try {
      await D.editChannel(c.id, { name: want });
      c.name = want;
    } catch (e) {
      log('rename', c.id, e.message);
    }
  }
}

async function restoreNames() {
  const b = bases();
  for (const id of Object.keys(b)) {
    const c = G.live.channels[id];
    if (!c || c.type !== 2 || c.name === b[id]) continue;
    try {
      await D.editChannel(id, { name: b[id] });
      c.name = b[id];
    } catch (e) {
      log('restore', id, e.message);
    }
  }
}

function isTemp(channelId) {
  return temps().some(t => t.id === channelId);
}

function nameForTemp(uid) {
  const m = G.live.members[uid];
  const who = m ? (m.nick || m.global_name || m.username) : 'Someone';
  const g = gameOf(uid);
  return (g ? g + ' — ' + who : who + "'s room").slice(0, 95);
}

async function onJoinLobby(uid) {
  const c = cfg();
  if (!c.lobbyChannel || !D.botConfigured()) return;
  const lobby = G.live.channels[c.lobbyChannel];
  if (!lobby) return;
  if (temps().filter(t => t.owner === uid).length) return;
  try {
    const parent = c.tempCategory || lobby.parent || null;
    const body = {
      name: nameForTemp(uid),
      type: 2,
      user_limit: Math.max(0, Math.min(99, Number(c.tempLimit) || 0))
    };
    if (parent) body.parent_id = parent;
    const made = await D.createChannel(body);
    if (!made || !made.id) return;
    G.live.channels[made.id] = { id: made.id, name: made.name, type: 2, parent: made.parent_id || parent || null };
    const list = temps();
    list.push({ id: made.id, owner: uid, at: Date.now() });
    saveTemps(list);
    await D.moveMember(uid, made.id);
  } catch (e) {
    log('temp room', e.message);
  }
}

async function sweepTemps() {
  const list = temps();
  if (!list.length) return;
  const keep = [];
  for (const t of list) {
    const live = G.live.channels[t.id];
    if (!live) continue;
    const who = peopleIn(t.id);
    if (who.length) { keep.push(t); continue; }
    if (Date.now() - t.at < 20000) { keep.push(t); continue; }
    try {
      await D.deleteChannel(t.id);
      delete G.live.channels[t.id];
    } catch (e) {
      if (e.status !== 404) { keep.push(t); continue; }
    }
  }
  if (keep.length !== list.length) saveTemps(keep);
}

async function checkAlone() {
  const c = cfg();
  const mins = Math.max(0, Number(c.aloneMinutes) || 0);
  if (!mins || !D.botConfigured()) return;
  const ch = c.aloneChannel || c.announceChannel;
  if (!ch) return;

  const rooms = roomsWithPeople();
  const ids = Object.keys(rooms);

  Object.keys(seen.alone).forEach(uid => {
    const still = ids.some(k => rooms[k].length === 1 && rooms[k][0] === uid);
    if (!still) { delete seen.alone[uid]; delete seen.told[uid]; }
  });

  for (const id of ids) {
    if (rooms[id].length !== 1) continue;
    const uid = rooms[id][0];
    if (!seen.alone[uid]) { seen.alone[uid] = Date.now(); continue; }
    if (Date.now() - seen.alone[uid] < mins * 60000) continue;
    if (Date.now() - (seen.told[uid] || 0) < 3 * 3600000) continue;
    seen.told[uid] = Date.now();

    const role = c.alonePing && (G.live.roles || []).some(r => r.id === c.alonePing) ? c.alonePing : '';
    const name = E.nameOf(uid);
    const room = (G.live.channels[id] || {}).name || 'a voice channel';
    const g = gameOf(uid);
    try {
      await D.post(ch, {
        content: (role ? '<@&' + role + '> ' : '') +
          '**' + name + '** has been sitting in **' + room + '** on their own for ' + mins + ' minutes' +
          (g ? ', playing ' + g : '') + '.',
        allowed_mentions: role ? { parse: [], roles: [role] } : { parse: [] }
      });
    } catch (e) {
      log('alone', e.message);
    }
  }
}

async function tick() {
  try { await sweepTemps(); } catch (e) { log(e.message); }
  try { await renameRooms(); } catch (e) { log(e.message); }
  try { await checkAlone(); } catch (e) { log(e.message); }
}

function start() {
  G.on('voice', (uid, before, after) => {
    const c = cfg();
    if (c.lobbyChannel && after === c.lobbyChannel) onJoinLobby(uid).catch(e => log(e.message));
    if (before && isTemp(before)) setTimeout(() => sweepTemps().catch(() => {}), 2500);
  });
  if (timer) return;
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); timer = null; }

module.exports = {
  start, stop, tick, peopleIn, roomsWithPeople, gameOf, topGame,
  baseName, wantedName, renameRooms, restoreNames, onJoinLobby, sweepTemps,
  checkAlone, isTemp, temps, seen
};
