const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');
const Stats = require('./stats');
const Fc = require('./forecast');
const ML = require('./modlog');

const TICK_MS = Number(process.env.LADDER_TICK_MS || 6 * 3600000);

let timer = null;

function log() { console.log.apply(console, ['[ladder]'].concat([].slice.call(arguments))); }

function cfg() { return S.read('config', {}); }

function rungs() {
  const r = S.read('ladder', null);
  return Array.isArray(r) ? r : [];
}

function saveRungs(v) { S.write('ladder', v); }

function parseRungs(text) {
  const roles = G.live.roles || [];
  const out = [];
  const seen = {};
  String(text || '').split('\n').forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split('|').map(x => x.trim());
    if (parts.length < 2) return;
    const want = parts[0].replace(/^@/, '').toLowerCase();
    const role = roles.find(x => x.id === parts[0] || x.name.toLowerCase() === want);
    if (!role || role.managed || seen[role.id]) return;
    const nights = Math.max(0, Math.min(999, Number(parts[1]) || 0));
    seen[role.id] = 1;
    out.push({ role: role.id, nights: nights });
  });
  return out.sort((a, b) => a.nights - b.nights).slice(0, 12);
}

function rungsText() {
  const roles = G.live.roles || [];
  return rungs().map(r => {
    const role = roles.find(x => x.id === r.role);
    return (role ? '@' + role.name : r.role) + ' | ' + r.nights;
  }).join('\n');
}

function unknownRungs(text) {
  const roles = G.live.roles || [];
  const bad = [];
  String(text || '').split('\n').forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split('|').map(x => x.trim());
    if (parts.length < 2) { bad.push(raw.slice(0, 30)); return; }
    const want = parts[0].replace(/^@/, '').toLowerCase();
    if (!roles.some(x => x.id === parts[0] || x.name.toLowerCase() === want)) bad.push(parts[0].slice(0, 30));
  });
  return bad;
}

function tooHigh() {
  const roles = G.live.roles || [];
  const top = G.live.botRoleTop;
  if (top == null) return [];
  const ids = rungs().map(r => r.role).concat(beds().map(b => b.role));
  return ids.map(id => roles.find(r => r.id === id))
    .filter(r => r && r.position >= top)
    .map(r => r.name)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function earnedRung(nights) {
  const list = rungs();
  let got = null;
  list.forEach(r => { if (nights >= r.nights) got = r; });
  return got;
}

async function applyRung(uid, want, dry) {
  const list = rungs();
  const live = G.live.members[uid];
  if (!live) return null;
  const has = (live.roles || []).filter(id => list.some(r => r.role === id));
  const wantId = want ? want.role : null;

  const drop = has.filter(id => id !== wantId);
  const add = wantId && has.indexOf(wantId) === -1 ? wantId : null;
  if (!drop.length && !add) return null;
  if (dry) return { uid: uid, add: add, drop: drop };

  for (const id of drop) {
    try { await D.removeRole(uid, id); } catch (e) { log('drop', e.message); return null; }
  }
  if (add) {
    try { await D.addRole(uid, add); } catch (e) { log('add', e.message); return null; }
  }
  return { uid: uid, add: add, drop: drop };
}

function beds() {
  const b = S.read('bedroles', null);
  return Array.isArray(b) ? b : [];
}

function saveBeds(v) { S.write('bedroles', v); }

function parseBeds(text) {
  const roles = G.live.roles || [];
  const out = [];
  const seen = {};
  String(text || '').split('\n').forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split('|').map(x => x.trim());
    if (parts.length < 2) return;
    const want = parts[0].replace(/^@/, '').toLowerCase();
    const role = roles.find(x => x.id === parts[0] || x.name.toLowerCase() === want);
    if (!role || role.managed || seen[role.id]) return;
    const h = Number(parts[1]);
    if (!(h >= 0 && h <= 29)) return;
    seen[role.id] = 1;
    out.push({ role: role.id, from: Math.floor(h) });
  });
  return out.sort((a, b) => a.from - b.from).slice(0, 8);
}

function bedsText() {
  const roles = G.live.roles || [];
  return beds().map(b => {
    const role = roles.find(x => x.id === b.role);
    return (role ? '@' + role.name : b.role) + ' | ' + b.from;
  }).join('\n');
}

function nights() {
  const n = S.read('bedtimes', null);
  return n && typeof n === 'object' ? n : {};
}

function recordLeave(uid, at) {
  const c = cfg();
  if (!c.bedRoles) return null;
  const { hour } = Fc.localParts(at || Date.now());
  const shifted = hour < 12 ? hour + 24 : hour;
  if (shifted < 18) return null;
  const all = nights();
  const list = all[uid] || [];
  list.unshift({ at: at || Date.now(), hour: shifted });
  all[uid] = list.slice(0, 40);
  S.write('bedtimes', all);
  return shifted;
}

function medianHour(uid) {
  const list = (nights()[uid] || []).filter(x => Date.now() - x.at < 90 * 86400000);
  if (list.length < 4) return null;
  const hours = list.map(x => x.hour).sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  return hours.length % 2 ? hours[mid] : Math.round((hours[mid - 1] + hours[mid]) / 2);
}

function bedFor(hour) {
  const list = beds();
  if (hour === null || !list.length) return null;
  let got = null;
  list.forEach(b => { if (hour >= b.from) got = b; });
  return got || list[0];
}

async function applyBed(uid, want, dry) {
  const list = beds();
  const live = G.live.members[uid];
  if (!live) return null;
  const has = (live.roles || []).filter(id => list.some(b => b.role === id));
  const wantId = want ? want.role : null;
  const drop = has.filter(id => id !== wantId);
  const add = wantId && has.indexOf(wantId) === -1 ? wantId : null;
  if (!drop.length && !add) return null;
  if (dry) return { uid: uid, add: add, drop: drop };
  for (const id of drop) {
    try { await D.removeRole(uid, id); } catch (e) { log('bed drop', e.message); return null; }
  }
  if (add) {
    try { await D.addRole(uid, add); } catch (e) { log('bed add', e.message); return null; }
  }
  return { uid: uid, add: add, drop: drop };
}

function preview() {
  const c = cfg();
  const out = { rungs: [], beds: [] };
  Object.values(G.live.members).filter(m => !m.bot).forEach(m => {
    if (c.autoRank && rungs().length) {
      const st = Stats.forUser(m.id) || {};
      const want = earnedRung(st.nights || 0);
      const has = (m.roles || []).filter(id => rungs().some(r => r.role === id));
      const wantId = want ? want.role : null;
      if (has.indexOf(wantId) === -1 || has.length > 1) {
        out.rungs.push({ uid: m.id, nights: st.nights || 0, want: wantId, has: has });
      }
    }
    if (c.bedRoles && beds().length) {
      const h = medianHour(m.id);
      const want = bedFor(h);
      const has = (m.roles || []).filter(id => beds().some(b => b.role === id));
      const wantId = want ? want.role : null;
      if (h !== null && (has.indexOf(wantId) === -1 || has.length > 1)) {
        out.beds.push({ uid: m.id, hour: h, want: wantId, has: has });
      }
    }
  });
  return out;
}

async function run(dry) {
  const c = cfg();
  const moved = { rungs: [], beds: [] };
  if (!D.botConfigured()) return moved;

  if (c.autoRank && rungs().length) {
    for (const m of Object.values(G.live.members).filter(x => !x.bot)) {
      const st = Stats.forUser(m.id) || {};
      const want = earnedRung(st.nights || 0);
      const r = await applyRung(m.id, want, dry);
      if (r) moved.rungs.push(Object.assign({ nights: st.nights || 0 }, r));
    }
  }

  if (c.bedRoles && beds().length) {
    for (const m of Object.values(G.live.members).filter(x => !x.bot)) {
      const h = medianHour(m.id);
      if (h === null) continue;
      const r = await applyBed(m.id, bedFor(h), dry);
      if (r) moved.beds.push(Object.assign({ hour: h }, r));
    }
  }

  if (!dry && (moved.rungs.length || moved.beds.length)) {
    await announce(moved).catch(e => log(e.message));
    moved.rungs.forEach(r => {
      ML.record('role', {
        who: r.uid, whoName: E.nameOf(r.uid), byName: 'Afterhours',
        detail: 'Rank set from ' + r.nights + ' night' + (r.nights === 1 ? '' : 's')
      });
    });
  }
  return moved;
}

function roleName(id) {
  const r = (G.live.roles || []).find(x => x.id === id);
  return r ? r.name : 'a role';
}

async function announce(moved) {
  const c = cfg();
  const ch = c.rankChannel || c.announceChannel;
  if (!ch) return;
  const lines = [];
  moved.rungs.forEach(r => {
    if (r.add) lines.push('⬆️  **' + E.nameOf(r.uid) + '** → **' + roleName(r.add) + '**  ·  ' + r.nights + ' nights');
    else if (r.drop.length) lines.push('⬇️  **' + E.nameOf(r.uid) + '** lost **' + roleName(r.drop[0]) + '**');
  });
  moved.beds.forEach(b => {
    if (!b.add) return;
    const h = b.hour % 24;
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    lines.push('\u{1F319}  **' + E.nameOf(b.uid) + '** → **' + roleName(b.add) + '**  ·  usually off around ' + h12 + ' ' + ap);
  });
  if (!lines.length) return;
  await D.post(ch, E.plain('Ranks have moved', lines, E.C.night));
}

function start() {
  G.on('voice', (uid, before, after) => {
    if (before && !after) recordLeave(uid, Date.now());
  });
  if (timer) return;
  timer = setInterval(() => run(false).catch(e => log(e.message)), TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); timer = null; }

module.exports = {
  start, stop, run, preview, rungs, saveRungs, parseRungs, rungsText, unknownRungs,
  beds, saveBeds, parseBeds, bedsText, earnedRung, bedFor, medianHour,
  recordLeave, nights, tooHigh, roleName
};
