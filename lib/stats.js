const S = require('./store');
const G = require('./gateway');

const TICK_MS = Number(process.env.STATS_TICK_MS || 60000);
let timer = null;

/* Everything here is sampled, not event-driven. Once a minute we look at who
   is actually in voice and what they are playing, and add a minute. That
   survives restarts, missed events and the bot being down, which an
   event-ledger approach does not. */

function all() {
  return S.read('stats', {});
}

function blank() {
  return { voiceMin: 0, months: {}, games: {}, with: {}, clips: 0, streams: 0, nights: 0, hosted: 0, lastNight: null, streak: 0 };
}

/* Rows written by older versions, or half-written ones, are missing keys the
   rest of the code assumes. Fill in whatever is absent every time rather than
   only when one particular field happens to be missing. */
function forUser(id) {
  const a = all();
  if (!a[id] || typeof a[id] !== 'object') a[id] = blank();
  const s = a[id];
  const shape = blank();
  Object.keys(shape).forEach(k => {
    const want = shape[k];
    const have = s[k];
    if (have === undefined || have === null) { s[k] = want; return; }
    if (want && typeof want === 'object' && typeof have !== 'object') s[k] = want;
    if (typeof want === 'number' && typeof have !== 'number') s[k] = want;
  });
  return s;
}

function monthKey(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
}

function tick() {
  const a = all();
  const mk = monthKey();

  /* who is in voice, grouped by channel */
  const rooms = {};
  Object.keys(G.live.voice).forEach(uid => {
    const v = G.live.voice[uid];
    if (!v || !v.channel) return;
    const m = G.live.members[uid];
    if (!m || m.bot) return;
    (rooms[v.channel] = rooms[v.channel] || []).push(uid);
  });

  Object.keys(rooms).forEach(ch => {
    const people = rooms[ch];
    people.forEach(uid => {
      if (!a[uid]) a[uid] = blank();
      a[uid].voiceMin += 1;
      a[uid].months[mk] = (a[uid].months[mk] || 0) + 1;
      /* only count time with someone else as time together */
      people.forEach(other => {
        if (other === uid) return;
        a[uid].with[other] = (a[uid].with[other] || 0) + 1;
      });
    });
  });

  /* what everyone is playing */
  Object.keys(G.live.presence).forEach(uid => {
    const p = G.live.presence[uid];
    if (!p || p.status === 'offline' || !p.activity) return;
    if (p.activity.type !== 0) return;
    const m = G.live.members[uid];
    if (!m || m.bot) return;
    const name = p.activity.name;
    if (!name) return;
    if (!a[uid]) a[uid] = blank();
    a[uid].games[name] = (a[uid].games[name] || 0) + 1;
  });

  S.write('stats', a);
}

function bump(id, key, by) {
  const a = all();
  if (!a[id]) a[id] = blank();
  a[id][key] = (a[id][key] || 0) + (by === undefined ? 1 : by);
  S.write('stats', a);
  return a[id][key];
}

/* Called when a night is locked in and people RSVP, so streaks mean something. */
function recordNight(goingIds, hostId) {
  const a = all();
  const now = Date.now();
  Object.keys(G.live.members).forEach(uid => {
    if (G.live.members[uid].bot) return;
    if (!a[uid]) a[uid] = blank();
  });
  (goingIds || []).forEach(uid => {
    if (!a[uid]) a[uid] = blank();
    a[uid].nights = (a[uid].nights || 0) + 1;
    const missedSince = a[uid].lastNight ? (now - a[uid].lastNight) > 21 * 86400000 : false;
    a[uid].streak = missedSince ? 1 : (a[uid].streak || 0) + 1;
    a[uid].lastNight = now;
  });
  Object.keys(a).forEach(uid => {
    if ((goingIds || []).indexOf(uid) === -1) a[uid].streak = 0;
  });
  if (hostId) {
    if (!a[hostId]) a[hostId] = blank();
    a[hostId].hosted = (a[hostId].hosted || 0) + 1;
  }
  S.write('stats', a);
}

function hoursOf(id) { return Math.round((forUser(id).voiceMin || 0) / 60); }

function monthHours(id) {
  const s = forUser(id);
  return Math.round((s.months[monthKey()] || 0) / 60);
}

/* Minutes, not hours, because a fresh install has minutes and rounding them
   to whole hours would show an empty page for the first few days. */
function topGames(id, n) {
  const s = forUser(id);
  return Object.keys(s.games)
    .map(k => [k, s.games[k]])
    .filter(x => x[1] >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 5);
}

function playsWith(id, n) {
  const s = forUser(id);
  return Object.keys(s.with)
    .map(k => [k, s.with[k]])
    .filter(x => x[1] >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 3);
}

function dur(min) {
  const m = Math.round(min || 0);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h >= 10 ? h + 'h' : h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
}

function summary(id) {
  const s = forUser(id);
  return {
    voice: hoursOf(id),
    voiceMin: s.voiceMin || 0,
    month: monthHours(id),
    monthMin: s.months[monthKey()] || 0,
    nights: s.nights || 0,
    hosted: s.hosted || 0,
    clips: s.clips || 0,
    streams: s.streams || 0,
    streak: s.streak || 0,
    games: topGames(id, 5),
    with: playsWith(id, 3)
  };
}

function leaderboard(key) {
  const a = all();
  return Object.keys(a)
    .filter(id => G.live.members[id] && !G.live.members[id].bot)
    .map(id => ({ id, v: key === 'voice' ? (a[id].voiceMin || 0) : (a[id][key] || 0) }))
    .sort((x, y) => y.v - x.v);
}

function start() {
  if (timer) return;
  tick();
  timer = setInterval(tick, TICK_MS);
  if (timer.unref) timer.unref();
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { start, stop, tick, all, forUser, summary, bump, recordNight, hoursOf, monthHours, topGames, playsWith, leaderboard, monthKey, dur };
