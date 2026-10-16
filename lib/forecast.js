const S = require('./store');
const G = require('./gateway');

const KEY = 'voicehist';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HALF_LIFE_DAYS = 56;

function zone() { return S.read('config', {}).timezone || 'America/New_York'; }

function localParts(at) {
  const d = new Date(at);
  let f;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone(), weekday: 'short', hour: 'numeric', hour12: false
    }).formatToParts(d);
  } catch (e) {
    return { dow: d.getDay(), hour: d.getHours() };
  }
  const wd = (f.find(p => p.type === 'weekday') || {}).value || 'Sun';
  const hr = Number((f.find(p => p.type === 'hour') || {}).value || 0);
  const dow = Math.max(0, SHORT.indexOf(wd));
  return { dow: dow, hour: hr % 24 };
}

function read() {
  const r = S.read(KEY, null);
  return r && typeof r === 'object' && r.slots ? r : { slots: {}, at: 0 };
}

function write(v) { S.write(KEY, v); }

function slotKey(dow, hour) { return dow + '-' + hour; }

function inVoiceNow() {
  const out = [];
  Object.keys(G.live.voice || {}).forEach(uid => {
    const m = G.live.members[uid];
    if (!m || m.bot) return;
    if ((G.live.voice[uid] || {}).channel) out.push(uid);
  });
  return out;
}

function sample(when, who) {
  const at = when || Date.now();
  const list = who || inVoiceNow();
  const { dow, hour } = localParts(at);
  const st = read();
  const k = slotKey(dow, hour);
  const slot = st.slots[k] || { n: 0, people: 0, best: 0, who: {}, last: 0 };
  slot.n += 1;
  slot.people += list.length;
  if (list.length > slot.best) slot.best = list.length;
  list.forEach(uid => { slot.who[uid] = (slot.who[uid] || 0) + 1; });
  slot.last = at;
  st.slots[k] = slot;
  st.at = at;
  write(st);
  return slot;
}

function weightFor(slot, now) {
  if (!slot.last) return 1;
  const days = (now - slot.last) / 86400000;
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

function slotStat(dow, hour) {
  const st = read();
  const slot = st.slots[slotKey(dow, hour)];
  if (!slot || !slot.n) return null;
  const now = Date.now();
  const w = weightFor(slot, now);
  const avg = slot.people / slot.n;
  const regulars = Object.keys(slot.who)
    .filter(uid => slot.who[uid] / slot.n >= 0.4)
    .filter(uid => G.live.members[uid] && !G.live.members[uid].bot);
  return {
    dow: dow,
    hour: hour,
    samples: slot.n,
    avg: avg,
    best: slot.best,
    typical: Math.round(avg),
    regulars: regulars,
    confidence: Math.min(1, (slot.n / 40) * w)
  };
}

function ranked(minSamples) {
  const need = Math.max(1, Number(minSamples) || 4);
  const out = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const s = slotStat(d, h);
      if (s && s.samples >= need) out.push(s);
    }
  }
  return out.sort((a, b) => b.avg - a.avg || b.samples - a.samples);
}

function evenings(minSamples) {
  return ranked(minSamples).filter(s => s.hour >= 17 || s.hour <= 2);
}

function best(n, minSamples) {
  const list = evenings(minSamples);
  const seen = {};
  const out = [];
  for (const s of list) {
    if (seen[s.dow] && out.length >= 3) continue;
    seen[s.dow] = (seen[s.dow] || 0) + 1;
    if (seen[s.dow] > 2) continue;
    out.push(s);
    if (out.length >= (n || 3)) break;
  }
  return out;
}

function label(s) {
  const h = s.hour % 12 === 0 ? 12 : s.hour % 12;
  const ap = s.hour >= 12 ? 'PM' : 'AM';
  return DAYS[s.dow] + ' ' + h + ' ' + ap;
}

function shortLabel(s) {
  const h = s.hour % 12 === 0 ? 12 : s.hour % 12;
  const ap = s.hour >= 12 ? 'pm' : 'am';
  return SHORT[s.dow] + ' ' + h + ap;
}

function coverage() {
  const st = read();
  const keys = Object.keys(st.slots);
  const total = keys.reduce((n, k) => n + st.slots[k].n, 0);
  return { slots: keys.length, samples: total, since: st.at };
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => {
    try {
      const who = inVoiceNow();
      if (who.length) sample(Date.now(), who);
    } catch (e) {}
  }, Number(process.env.FORECAST_MS || 10 * 60000));
  if (timer.unref) timer.unref();
}
function stop() { clearInterval(timer); timer = null; }

module.exports = {
  start, stop, sample, slotStat, ranked, evenings, best, label, shortLabel,
  coverage, read, write, localParts, inVoiceNow, DAYS, SHORT
};
