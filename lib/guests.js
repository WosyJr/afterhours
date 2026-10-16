const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');
const ML = require('./modlog');

const KEY = 'guests';
const TICK_MS = Number(process.env.GUEST_TICK_MS || 5 * 60000);

let timer = null;

function log() { console.log.apply(console, ['[guests'].concat([].slice.call(arguments)).concat([']'])); }

function all() {
  const r = S.read(KEY, null);
  return Array.isArray(r) ? r : [];
}

function save(v) { S.write(KEY, v); return v; }

function get(code) {
  return all().find(g => g.code === code) || null;
}

function make(opts) {
  const roles = G.live.roles || [];
  const role = roles.find(r => r.id === opts.role && !r.managed);
  if (!role) throw new Error('Pick a role that exists and is not an integration role.');
  const hours = Math.max(1, Math.min(720, Number(opts.hours) || 24));
  const uses = Math.max(1, Math.min(50, Number(opts.uses) || 1));
  const row = {
    code: S.id() + S.id().slice(0, 6),
    role: role.id,
    hours: hours,
    uses: uses,
    used: [],
    note: String(opts.note || '').slice(0, 80),
    by: opts.by || '',
    byName: opts.byName || '',
    at: Date.now(),
    expires: Date.now() + hours * 3600000,
    dead: false
  };
  const list = all();
  list.unshift(row);
  save(list.slice(0, 100));
  return row;
}

function alive(g) {
  if (!g || g.dead) return false;
  if (Date.now() > g.expires) return false;
  return g.used.length < g.uses;
}

function statusOf(g) {
  if (g.dead) return 'revoked';
  if (Date.now() > g.expires) return 'expired';
  if (g.used.length >= g.uses) return 'used up';
  return 'live';
}

function revoke(code) {
  const list = all();
  const g = list.find(x => x.code === code);
  if (!g) return false;
  g.dead = true;
  save(list);
  return true;
}

async function redeem(code, uid, name) {
  const list = all();
  const g = list.find(x => x.code === code);
  if (!g) return { ok: false, why: 'That pass does not exist.' };
  if (g.dead) return { ok: false, why: 'That pass was revoked.' };
  if (Date.now() > g.expires) return { ok: false, why: 'That pass has expired.' };
  if (g.used.some(u => u.uid === uid)) return { ok: true, already: true, role: g.role };
  if (g.used.length >= g.uses) return { ok: false, why: 'That pass has been used as many times as it allows.' };

  const member = G.live.members[uid];
  if (!member) return { ok: false, why: 'You have to be in the Discord server first.' };

  try {
    await D.addRole(uid, g.role);
  } catch (e) {
    return { ok: false, why: e.status === 403
      ? 'Discord refused the role. The bot has to sit above it in the role list.'
      : e.message };
  }

  g.used.push({ uid: uid, name: name || '', at: Date.now(), until: Date.now() + g.hours * 3600000 });
  save(list);

  ML.record('selfrole', {
    who: uid, whoName: name || E.nameOf(uid), byName: 'Guest pass',
    detail: 'Used a pass for ' + roleName(g.role) + ', good for ' + g.hours + 'h' + (g.note ? ' — ' + g.note : '')
  });

  return { ok: true, role: g.role, hours: g.hours };
}

function roleName(id) {
  const r = (G.live.roles || []).find(x => x.id === id);
  return r ? r.name : 'a role';
}

async function sweep() {
  if (!D.botConfigured()) return [];
  const list = all();
  const pulled = [];
  for (const g of list) {
    for (const u of g.used) {
      if (u.done) continue;
      if (Date.now() < u.until) continue;
      try {
        await D.removeRole(u.uid, g.role);
        u.done = Date.now();
        pulled.push({ uid: u.uid, role: g.role });
        ML.record('role', {
          who: u.uid, whoName: u.name || E.nameOf(u.uid), byName: 'Guest pass',
          detail: 'Pass ran out, took ' + roleName(g.role) + ' back'
        });
      } catch (e) {
        if (e.status === 404) u.done = Date.now();
        else log('sweep', e.message);
      }
    }
  }
  save(list);
  return pulled;
}

function start() {
  if (timer) return;
  setTimeout(() => sweep().catch(() => {}), 45000);
  timer = setInterval(() => sweep().catch(() => {}), TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); timer = null; }

module.exports = { all, get, make, revoke, redeem, sweep, alive, statusOf, roleName, start, stop };
