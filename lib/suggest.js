const S = require('./store');
const G = require('./gateway');
const Steam = require('./steam');

function lib() { return S.read('library', []); }

function inVoice() {
  const out = [];
  Object.keys(G.live.voice || {}).forEach(uid => {
    const m = G.live.members[uid];
    if (m && !m.bot) out.push(uid);
  });
  return out;
}

function voiceRooms() {
  const rooms = {};
  Object.keys(G.live.voice || {}).forEach(uid => {
    const m = G.live.members[uid];
    if (!m || m.bot) return;
    const ch = G.live.voice[uid].channel;
    if (!ch) return;
    (rooms[ch] = rooms[ch] || []).push(uid);
  });
  return rooms;
}

function biggestRoom() {
  const rooms = voiceRooms();
  let best = null;
  Object.keys(rooms).forEach(ch => {
    if (!best || rooms[ch].length > rooms[best].length) best = ch;
  });
  return best ? { channel: best, who: rooms[best] } : null;
}

function ownedByAll(who) {
  if (!who.length) return [];
  return lib().filter(g => who.every(uid => (g.owners || []).indexOf(uid) > -1));
}

function ownedByMost(who, missAllowed) {
  if (!who.length) return [];
  const slack = Math.max(0, missAllowed || 0);
  return lib()
    .map(g => {
      const have = who.filter(uid => (g.owners || []).indexOf(uid) > -1);
      return { game: g, have: have, missing: who.length - have.length };
    })
    .filter(x => x.missing <= slack && x.have.length > 0)
    .sort((a, b) => a.missing - b.missing);
}

function totalMinutes(appid) {
  if (!appid) return null;
  const all = Steam.playtimes();
  let sum = 0;
  let known = false;
  Object.keys(all).forEach(uid => {
    const v = all[uid][String(appid)];
    if (v !== undefined) { known = true; sum += v; }
  });
  return known ? sum : null;
}

function minutesAmong(appid, who) {
  if (!appid) return null;
  const all = Steam.playtimes();
  let sum = 0;
  let known = false;
  who.forEach(uid => {
    const t = all[uid];
    if (!t) return;
    const v = t[String(appid)];
    if (v !== undefined) { known = true; sum += v; }
  });
  return known ? sum : null;
}

function score(entry, who) {
  const mins = minutesAmong(entry.game.appid, who);
  const everyone = entry.missing === 0 ? 40 : 0;
  const reach = (entry.have.length / Math.max(1, who.length)) * 30;
  const played = mins === null ? 10 : Math.min(25, Math.sqrt(mins / 60) * 4);
  const fresh = mins !== null && mins < 120 ? 8 : 0;
  return everyone + reach + played + fresh;
}

function whatNow(who, n) {
  const list = who && who.length ? who : inVoice();
  if (!list.length) return { who: [], picks: [] };
  const cands = ownedByMost(list, Math.max(0, Math.floor(list.length / 3)));
  const ranked = cands
    .map(c => ({
      name: c.game.name,
      appid: c.game.appid || null,
      have: c.have,
      missing: c.missing,
      minutes: minutesAmong(c.game.appid, list),
      score: score(c, list)
    }))
    .sort((a, b) => b.score - a.score);
  return { who: list, picks: ranked.slice(0, n || 3), total: ranked.length };
}

function neverPlayed(minOwners) {
  const need = Math.max(2, Number(minOwners) || 3);
  const all = Steam.playtimes();
  const anyone = Object.keys(all).length > 0;
  if (!anyone) return [];
  return lib()
    .filter(g => (g.owners || []).length >= need && g.appid)
    .map(g => {
      const mins = totalMinutes(g.appid);
      return { name: g.name, appid: g.appid, owners: g.owners || [], minutes: mins };
    })
    .filter(x => x.minutes === 0)
    .sort((a, b) => b.owners.length - a.owners.length);
}

function barelyPlayed(minOwners, underMinutes) {
  const need = Math.max(2, Number(minOwners) || 3);
  const cap = Math.max(1, Number(underMinutes) || 60);
  return lib()
    .filter(g => (g.owners || []).length >= need && g.appid)
    .map(g => ({ name: g.name, appid: g.appid, owners: g.owners || [], minutes: totalMinutes(g.appid) }))
    .filter(x => x.minutes !== null && x.minutes > 0 && x.minutes < cap)
    .sort((a, b) => a.minutes - b.minutes);
}

function roulette(who, seed) {
  const list = who && who.length ? who : Object.keys(G.live.members).filter(id => !G.live.members[id].bot);
  let pool = ownedByAll(list);
  let scope = 'everyone';
  if (!pool.length) {
    const most = ownedByMost(list, 1);
    pool = most.map(x => x.game);
    scope = 'nearly everyone';
  }
  if (!pool.length) {
    pool = lib();
    scope = 'the list';
  }
  if (!pool.length) return null;
  const i = typeof seed === 'number'
    ? Math.abs(seed) % pool.length
    : Math.floor(Math.random() * pool.length);
  const g = pool[i];
  return {
    name: g.name,
    appid: g.appid || null,
    owners: g.owners || [],
    minutes: totalMinutes(g.appid),
    scope: scope,
    pool: pool.length
  };
}

function dur(mins) {
  if (mins === null || mins === undefined) return 'unknown';
  if (mins < 60) return mins + 'm';
  const h = Math.round(mins / 60);
  return h + 'h';
}

module.exports = {
  inVoice, voiceRooms, biggestRoom, ownedByAll, ownedByMost,
  whatNow, neverPlayed, barelyPlayed, roulette, totalMinutes, minutesAmong, dur
};
