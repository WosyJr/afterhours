const S = require('./store');

const CUR = 'streamcur';
const LOG = 'streamlog';
const MAX = 400;

function current() { return S.read(CUR, {}); }
function log() { return S.read(LOG, []); }

function begin(uid, s) {
  const cur = current();
  if (cur[uid]) return;
  cur[uid] = {
    start: s.started || Date.now(),
    peak: Number(s.viewers) || 0,
    platform: s.platform || 'twitch',
    game: s.game || '',
    title: s.title || ''
  };
  S.write(CUR, cur);
}

function seen(uid, s) {
  const cur = current();
  const row = cur[uid];
  if (!row) return;
  const v = Number(s.viewers) || 0;
  let dirty = false;
  if (v > row.peak) { row.peak = v; dirty = true; }
  if (s.game && s.game !== row.game) { row.game = s.game; dirty = true; }
  if (dirty) S.write(CUR, cur);
}

function end(uid) {
  const cur = current();
  const row = cur[uid];
  if (!row) return null;
  delete cur[uid];
  S.write(CUR, cur);
  const mins = Math.max(0, Math.round((Date.now() - row.start) / 60000));
  if (mins < 2) return null;
  const list = log();
  const entry = {
    uid: String(uid),
    start: row.start,
    end: Date.now(),
    minutes: mins,
    peak: row.peak,
    game: row.game,
    platform: row.platform
  };
  list.unshift(entry);
  S.write(LOG, list.slice(0, MAX));
  return entry;
}

function forUser(uid) {
  return log().filter(r => String(r.uid) === String(uid));
}

function summaryFor(uid) {
  const rows = forUser(uid);
  const live = current()[uid];
  const mins = rows.reduce((a, r) => a + (r.minutes || 0), 0);
  const best = rows.reduce((a, r) => (!a || r.peak > a.peak ? r : a), null);
  const longest = rows.reduce((a, r) => (!a || r.minutes > a.minutes ? r : a), null);
  const games = {};
  rows.forEach(r => { if (r.game) games[r.game] = (games[r.game] || 0) + (r.minutes || 0); });
  const top = Object.keys(games).sort((a, b) => games[b] - games[a])[0] || '';
  return {
    streams: rows.length,
    minutes: mins,
    hours: Math.round(mins / 6) / 10,
    peak: best ? best.peak : 0,
    peakGame: best ? best.game : '',
    longest: longest ? longest.minutes : 0,
    topGame: top,
    liveSince: live ? live.start : 0,
    any: rows.length > 0 || !!live
  };
}

function dur(min) {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function recent(n) { return log().slice(0, n || 10); }

module.exports = { begin, seen, end, forUser, summaryFor, recent, dur, current, log };
