const S = require('./store');
const St = require('./stats');
const G = require('./gateway');
const D = require('./discord');

const LIST = [
  { k: 'host10', ico: '\u{1F3E0}', n: 'Door’s always open', d: 'Host ten nights', goal: 10, get: s => s.hosted },
  { k: 'v100', ico: '\u{1F3A7}', n: 'Never logs off', d: '100 hours in voice', goal: 100, get: s => s.voice },
  { k: 'v500', ico: '\u{1F451}', n: 'Practically furniture', d: '500 hours in voice', goal: 500, get: s => s.voice },
  { k: 'c50', ico: '\u{1F3AC}', n: 'Camera always rolling', d: 'Post 50 clips', goal: 50, get: s => s.clips },
  { k: 'st10', ico: '\u{1F525}', n: 'Ten in a row', d: 'Ten nights without missing one', goal: 10, get: s => s.streak },
  { k: 's25', ico: '\u{1F4FA}', n: 'Going live', d: 'Stream 25 times', goal: 25, get: s => s.streams },
  { k: 'n25', ico: '\u{1F3AE}', n: 'Regular', d: 'Turn up to 25 nights', goal: 25, get: s => s.nights },
  { k: 'n100', ico: '\u{1F3C6}', n: 'Hundred nights', d: 'Turn up to 100 nights', goal: 100, get: s => s.nights }
];

function earned() { return S.read('achievements', {}); }

function forUser(id) {
  const s = St.summary(id);
  const got = earned()[id] || {};
  return LIST.map(a => {
    const have = Math.min(a.goal, a.get(s) || 0);
    return { k: a.k, ico: a.ico, n: a.n, d: a.d, goal: a.goal, have, got: have >= a.goal, at: got[a.k] || null };
  });
}

/* Counted from what people have actually done, not from the awards ledger,
   so it is right the moment someone crosses the line rather than after the
   next sweep. */
function rarity(k) {
  const a = LIST.filter(x => x.k === k)[0];
  if (!a) return 0;
  return Object.keys(G.live.members)
    .filter(id => !G.live.members[id].bot)
    .filter(id => (a.get(St.summary(id)) || 0) >= a.goal).length;
}

/* Awards anything newly reached. When there is a channel to announce in, at
   most one badge per person per run is awarded, so a fresh install does not
   dump eight messages into the channel at once; the rest come on later runs
   and each one still gets its own post. */
async function sweep() {
  const e = earned();
  const cfg = S.read('config', {});
  const ch = cfg.achievementChannel;
  const members = Object.keys(G.live.members).filter(id => !G.live.members[id].bot);

  for (const id of members) {
    const list = forUser(id);
    e[id] = e[id] || {};
    for (const a of list) {
      if (!a.got || e[id][a.k]) continue;
      e[id][a.k] = Date.now();
      if (!ch) continue;
      let holders = 0;
      Object.keys(e).forEach(k => { if (e[k] && e[k][a.k]) holders++; });
      await D.post(ch, require('./embeds').achievement(id, a, holders)).catch(() => {});
      break;
    }
  }
  S.write('achievements', e);
  return e;
}

let timer = null;
function start() {
  if (timer) return;
  setTimeout(() => sweep().catch(() => {}), 20000);
  timer = setInterval(() => sweep().catch(() => {}), 10 * 60000);
  if (timer.unref) timer.unref();
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { LIST, forUser, rarity, sweep, earned, start, stop };
