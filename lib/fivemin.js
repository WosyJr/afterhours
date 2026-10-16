const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');

const KEY = 'fivemin';
const MAX_WAIT = 6 * 3600000;

const PHRASES = [
  { re: /\b(?:in\s+)?(?:like\s+)?(\d{1,3})\s*(?:more\s+)?min(?:ute)?s?\b/i, kind: 'minutes' },
  { re: /\bfive\s+min(?:ute)?s?\b/i, kind: 'minutes', fixed: 5 },
  { re: /\btwo\s+min(?:ute)?s?\b/i, kind: 'minutes', fixed: 2 },
  { re: /\bten\s+min(?:ute)?s?\b/i, kind: 'minutes', fixed: 10 },
  { re: /\bone\s+more\s+(?:game|round|match|run|match|one)\b/i, kind: 'one more' },
  { re: /\blast\s+(?:one|game|round|match|run)\b/i, kind: 'last one' },
  { re: /\bjust\s+one\s+more\b/i, kind: 'one more' },
  { re: /\bafter\s+this\s+(?:one|game|round|match)\b/i, kind: 'after this one' },
  { re: /\bbrb\b/i, kind: 'brb' },
  { re: /\bsec(?:ond)?s?\b.{0,6}$/i, kind: 'a sec' },
  { re: /\b(?:almost|nearly)\s+done\b/i, kind: 'almost done' },
  { re: /\bheading\s+(?:off|out)\s+(?:soon|now)\b/i, kind: 'heading off' },
  { re: /\bgoing\s+to\s+bed\s+(?:soon|after)\b/i, kind: 'going to bed' }
];

function log() { console.log.apply(console, ['[fivemin]'].concat([].slice.call(arguments))); }

function cfg() { return S.read('config', {}); }

function read() {
  const r = S.read(KEY, null);
  if (r && typeof r === 'object' && r.pending && r.tally) return r;
  return { pending: {}, tally: {}, log: [] };
}

function write(v) { S.write(KEY, v); }

function claimIn(text) {
  const t = String(text || '');
  if (t.length > 300) return null;
  for (const p of PHRASES) {
    const m = t.match(p.re);
    if (!m) continue;
    let said = p.fixed || null;
    if (!said && p.kind === 'minutes' && m[1]) {
      const n = Number(m[1]);
      if (!(n > 0 && n <= 180)) continue;
      said = n;
    }
    return { kind: p.kind, minutes: said, phrase: m[0].trim().slice(0, 40) };
  }
  return null;
}

function inVoice(uid) {
  const v = G.live.voice[uid];
  return !!(v && v.channel);
}

function onMessage(m) {
  if (!cfg().fiveMin) return null;
  if (!m || !m.author || m.author.bot) return null;
  const uid = m.author.id;
  if (!inVoice(uid)) return null;

  const claim = claimIn(m.content);
  if (!claim) return null;

  const st = read();
  const have = st.pending[uid];
  if (have && Date.now() - have.at < 90000) return null;

  st.pending[uid] = {
    at: Date.now(),
    kind: claim.kind,
    minutes: claim.minutes,
    phrase: claim.phrase,
    channel: m.channel_id
  };
  write(st);
  return st.pending[uid];
}

function settle(uid) {
  const st = read();
  const p = st.pending[uid];
  if (!p) return null;
  delete st.pending[uid];

  const took = Date.now() - p.at;
  if (took > MAX_WAIT) { write(st); return null; }

  const claimed = (p.minutes || 0) * 60000;
  const over = claimed ? took - claimed : null;

  const t = st.tally[uid] || { claims: 0, totalMs: 0, worstMs: 0, overMs: 0 };
  t.claims += 1;
  t.totalMs += took;
  if (took > t.worstMs) t.worstMs = took;
  if (over && over > 0) t.overMs += over;
  st.tally[uid] = t;

  st.log = st.log || [];
  st.log.unshift({ uid: uid, at: Date.now(), took: took, kind: p.kind, minutes: p.minutes, phrase: p.phrase });
  st.log = st.log.slice(0, 200);
  write(st);

  return { uid: uid, took: took, claim: p, over: over, tally: t };
}

function dur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return s + ' seconds';
  const m = Math.round(s / 60);
  if (m < 90) return m + ' minutes';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h + 'h' + (rest ? ' ' + rest + 'm' : '');
}

function verdict(r) {
  if (!r.claim.minutes) {
    if (r.took < 5 * 60000) return 'Actually quick. Noted.';
    return 'That was ' + dur(r.took) + '.';
  }
  if (r.over === null) return dur(r.took) + '.';
  if (r.over <= 60000) return 'Bang on, somehow.';
  const mult = r.took / (r.claim.minutes * 60000);
  if (mult >= 10) return dur(r.took) + '. That is ' + Math.round(mult) + ' times what they said.';
  if (mult >= 3) return 'Said ' + r.claim.minutes + ', took ' + dur(r.took) + '.';
  return 'Said ' + r.claim.minutes + ' minutes, took ' + dur(r.took) + '.';
}

async function announce(r) {
  const c = cfg();
  const ch = c.fiveMinChannel || r.claim.channel;
  if (!ch || !D.botConfigured()) return;
  const name = E.nameOf(r.uid);
  const e = {
    color: r.over && r.over > 60000 ? 0xFBBF24 : 0x4ADE80,
    author: { name: name },
    title: '“' + r.claim.phrase + '”',
    description: verdict(r),
    fields: [
      { name: 'Claimed', value: r.claim.minutes ? r.claim.minutes + ' minutes' : r.claim.kind, inline: true },
      { name: 'Took', value: dur(r.took), inline: true },
      { name: 'Record', value: r.tally.claims + ' tracked · worst ' + dur(r.tally.worstMs), inline: true }
    ],
    footer: E.footer(E.brand() + ' · five-minute watch'),
    timestamp: new Date().toISOString()
  };
  const av = G.live.members[r.uid] ? D.avatarUrl(G.live.members[r.uid]) : null;
  if (av) e.author.icon_url = av;
  await D.post(ch, { embeds: [e], allowed_mentions: { parse: [] } }).catch(err => log(err.message));
}

function board() {
  const st = read();
  return Object.keys(st.tally).map(uid => {
    const t = st.tally[uid];
    return {
      uid: uid,
      claims: t.claims,
      avgMs: Math.round(t.totalMs / Math.max(1, t.claims)),
      worstMs: t.worstMs,
      overMs: t.overMs || 0
    };
  }).sort((a, b) => b.overMs - a.overMs || b.avgMs - a.avgMs);
}

function reset() { write({ pending: {}, tally: {}, log: [] }); }

function start() {
  G.on('chat', m => { onMessage(m); });
  G.on('voice', (uid, before, after) => {
    if (before && !after) {
      const r = settle(uid);
      if (r) announce(r).catch(e => log(e.message));
    }
  });
}

module.exports = { start, onMessage, settle, announce, board, read, write, reset, claimIn, dur, verdict, PHRASES };
