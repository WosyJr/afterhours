const S = require('./store');
const G = require('./gateway');
const Stats = require('./stats');

const TIERS = [
  { k: 'hours', n: 'In voice', steps: [[10, 'Showed up'], [50, '50 hours'], [150, '150 hours'],
    [400, '400 hours'], [1000, '1,000 hours']], tone: 'iris' },
  { k: 'nights', n: 'Game nights', steps: [[5, '5 nights'], [20, '20 nights'], [50, '50 nights'],
    [100, 'Century of nights']], tone: 'lime' },
  { k: 'hosted', n: 'Hosted', steps: [[1, 'Hosted one'], [5, 'Host x5'], [15, 'Host x15'],
    [40, 'Keeper of the lobby']], tone: 'gold' },
  { k: 'clips', n: 'Clips posted', steps: [[10, '10 clips'], [50, '50 clips'], [200, 'Archivist']], tone: 'cyan' },
  { k: 'streams', n: 'Streams', steps: [[5, 'Streamer'], [25, 'Regular broadcast'], [100, 'Always on']], tone: 'rose' },
  { k: 'streak', n: 'Streak', steps: [[3, '3 in a row'], [8, '8 in a row'], [20, 'Never misses']], tone: 'gold' }
];

function valueFor(st, k) {
  if (!st) return 0;
  if (k === 'hours') return Math.round((st.voiceMin || 0) / 60);
  return st[k] || 0;
}

function forUser(uid) {
  const st = Stats.forUser(uid);
  const out = [];
  TIERS.forEach(t => {
    const v = valueFor(st, t.k);
    let got = null;
    t.steps.forEach(s => { if (v >= s[0]) got = s; });
    if (got) out.push({ key: t.k, label: got[1], tone: t.tone, value: v, at: got[0] });
  });

  const games = (st && st.games) || {};
  const names = Object.keys(games).sort((a, b) => games[b] - games[a]);
  if (names.length && games[names[0]] >= 20 * 60) {
    out.push({ key: 'main', label: names[0] + ' main', tone: 'iris', value: Math.round(games[names[0]] / 60) });
  }

  const withers = (st && st.with) || {};
  const mates = Object.keys(withers).sort((a, b) => withers[b] - withers[a]);
  if (mates.length && withers[mates[0]] >= 20 * 60) {
    const m = G.live.members[mates[0]];
    const who = m ? (m.nick || m.global_name || m.username) : null;
    if (who) out.push({ key: 'duo', label: 'Usually with ' + who, tone: 'cyan', value: Math.round(withers[mates[0]] / 60) });
  }

  const beds = S.read('bedtimes', {})[uid] || [];
  if (beds.length >= 6) {
    const hours = beds.map(x => x.hour).sort((a, b) => a - b);
    const med = hours[Math.floor(hours.length / 2)];
    if (med >= 27) out.push({ key: 'late', label: 'Up past 3', tone: 'rose', value: med });
    else if (med <= 21) out.push({ key: 'early', label: 'Early night', tone: 'cyan', value: med });
  }

  return out;
}

function next(uid) {
  const st = Stats.forUser(uid);
  const out = [];
  TIERS.forEach(t => {
    const v = valueFor(st, t.k);
    const step = t.steps.find(s => v < s[0]);
    if (step) out.push({ key: t.k, label: step[1], need: step[0], have: v, left: step[0] - v, name: t.n });
  });
  return out.sort((a, b) => (a.left / Math.max(1, a.need)) - (b.left / Math.max(1, b.need))).slice(0, 3);
}

function all() {
  const out = {};
  Object.values(G.live.members).filter(m => !m.bot).forEach(m => { out[m.id] = forUser(m.id); });
  return out;
}

module.exports = { forUser, next, all, TIERS };
