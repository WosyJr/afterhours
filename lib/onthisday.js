const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');
const Fc = require('./forecast');

const KEY = 'otd';
const TICK_MS = Number(process.env.OTD_TICK_MS || 30 * 60000);

let timer = null;

function log() { console.log.apply(console, ['[onthisday]'].concat([].slice.call(arguments))); }

function cfg() { return S.read('config', {}); }

function state() {
  const r = S.read(KEY, null);
  return r && typeof r === 'object' ? r : { told: {}, at: 0 };
}

function save(v) { S.write(KEY, v); }

function dayKey(at) {
  const p = Fc.localParts(at);
  const d = new Date(at);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0') + ':' + p.hour;
}

function todayStamp() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

function yearsBetween(then, now) {
  return Math.floor((now - then) / (365.25 * 86400000));
}

/* Something from roughly a year ago today, give or take a few days, so a
   quiet week does not mean nothing ever surfaces. */
function candidates(now) {
  const when = now || Date.now();
  const msgs = G.messages().filter(m => m.pinned || m.kind === 'memories');
  const out = [];
  msgs.forEach(m => {
    if (!m.at) return;
    const age = when - m.at;
    const years = age / (365.25 * 86400000);
    const nearest = Math.round(years);
    if (nearest < 1) return;
    const off = Math.abs(age - nearest * 365.25 * 86400000);
    if (off > 4 * 86400000) return;
    out.push({ m: m, years: nearest, off: off });
  });
  return out.sort((a, b) => a.off - b.off || b.years - a.years);
}

function pick(now) {
  const st = state();
  const list = candidates(now);
  for (const c of list) {
    if (st.told[c.m.id]) continue;
    return c;
  }
  return list.length ? list[0] : null;
}

function embed(c) {
  const m = c.m;
  const when = new Date(m.at);
  const e = {
    color: E.C.quote,
    author: { name: (m.author && m.author.name) || 'Someone' },
    title: c.years === 1 ? 'A year ago today' : c.years + ' years ago today',
    description: m.text ? '“' + String(m.text).slice(0, 900) + '”' : '​',
    footer: E.footer(when.toDateString()),
    timestamp: new Date(m.at).toISOString()
  };
  if (m.author && m.author.avatar) e.author.icon_url = m.author.avatar;
  const pic = (m.attachments || []).find(a => a.image);
  if (pic && pic.url) e.image = { url: pic.url };
  const counts = Object.keys(m.reactions || {}).reduce((n, k) => n + (m.reactions[k] || 0), 0);
  if (counts) e.fields = [{ name: 'At the time', value: counts + ' reaction' + (counts === 1 ? '' : 's'), inline: true }];
  const url = E.site();
  return {
    embeds: [e],
    allowed_mentions: { parse: [] },
    components: url ? [{ type: 1, components: [
      { type: 2, style: 5, label: 'Memories', url: url + '/clips/memories' }] }] : []
  };
}

async function run(force) {
  const c = cfg();
  if (!c.otdChannel || !D.botConfigured()) return null;
  const hour = Math.max(0, Math.min(23, Number(c.otdHour) === undefined ? 10 : Number(c.otdHour)));
  const st = state();
  const today = todayStamp();

  if (!force) {
    if (st.day === today) return null;
    const { hour: now } = Fc.localParts(Date.now());
    if (now < hour) return null;
  }

  const got = pick(Date.now());
  st.day = today;
  st.at = Date.now();
  if (!got) { save(st); return null; }
  st.told[got.m.id] = Date.now();
  const ids = Object.keys(st.told);
  if (ids.length > 400) {
    ids.sort((a, b) => st.told[a] - st.told[b]).slice(0, ids.length - 400).forEach(k => { delete st.told[k]; });
  }
  save(st);

  try {
    await D.post(c.otdChannel, embed(got));
  } catch (e) {
    log(e.message);
    return null;
  }
  return got;
}

function start() {
  if (timer) return;
  setTimeout(() => run(false).catch(() => {}), 90000);
  timer = setInterval(() => run(false).catch(() => {}), TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); timer = null; }

module.exports = { start, stop, run, pick, candidates, embed, state, save, dayKey, yearsBetween };
