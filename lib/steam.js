const S = require('./store');
const D = require('./discord');
const G = require('./gateway');

const KEY = process.env.STEAM_API_KEY || '';
const CC = process.env.STEAM_COUNTRY || 'us';
const POLL_MS = Number(process.env.STEAM_POLL_MS || 6 * 3600000);

let timer = null;
const state = { checkedAt: 0, errors: {} };

function log() { console.log.apply(console, ['[steam]'].concat([].slice.call(arguments))); }

/* ---------- linking ---------- */

function links() {
  const profs = S.read('profiles', {});
  return Object.keys(profs)
    .filter(uid => profs[uid] && profs[uid].steam)
    .map(uid => ({ uid, id: String(profs[uid].steam) }));
}

/* Accepts a SteamID64, a /profiles/<id> URL, an /id/<vanity> URL, or a bare
   vanity name. Vanity needs an API key to resolve. */
async function resolve(input) {
  let v = String(input || '').trim();
  if (!v) return null;
  const prof = v.match(/profiles\/(\d{17})/);
  if (prof) return prof[1];
  if (/^\d{17}$/.test(v)) return v;
  const idm = v.match(/\/id\/([^\/?#]+)/);
  if (idm) v = idm[1];
  v = v.replace(/^https?:\/\/[^\/]+\/?/, '').replace(/\/$/, '');
  if (!KEY) return null;
  const q = new URLSearchParams({ key: KEY, vanityurl: v });
  const r = await fetch('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?' + q.toString());
  if (!r.ok) return null;
  const j = await r.json();
  return (j.response && j.response.success === 1) ? j.response.steamid : null;
}

/* ---------- wishlists ---------- */

/* The wishlist endpoint is not part of the documented API and only answers for
   a public profile. A private one returns an empty object, which we surface as
   a per-person note rather than a hard failure. */
async function wishlistFor(steamId) {
  const out = [];
  for (let page = 0; page < 4; page++) {
    const url = 'https://store.steampowered.com/wishlist/profiles/' + steamId + '/wishlistdata/page/' + page + '?cc=' + CC;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Afterhours/1.0)' } });
    if (!r.ok) break;
    let j;
    try { j = await r.json(); } catch (e) { break; }
    if (!j || Array.isArray(j) || !Object.keys(j).length) break;
    Object.keys(j).forEach(appid => {
      const it = j[appid];
      out.push({
        appid: appid,
        name: it.name,
        capsule: it.capsule || null,
        priority: it.priority || 0
      });
    });
    if (Object.keys(j).length < 100) break;
  }
  return out;
}

/* ---------- prices ---------- */

/* appdetails is rate limited at roughly 200 calls per five minutes, so we
   batch, pace, and cache. */
async function priceFor(appids) {
  const out = {};
  const batch = appids.slice(0, 50);
  for (let i = 0; i < batch.length; i += 10) {
    const chunk = batch.slice(i, i + 10);
    const q = 'appids=' + chunk.join(',') + '&cc=' + CC + '&filters=price_overview';
    const r = await fetch('https://store.steampowered.com/api/appdetails?' + q, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Afterhours/1.0)' }
    });
    if (r.status === 429) { log('rate limited, stopping this pass'); break; }
    if (!r.ok) continue;
    let j;
    try { j = await r.json(); } catch (e) { continue; }
    Object.keys(j).forEach(id => {
      const d = j[id];
      if (!d || !d.success || !d.data || !d.data.price_overview) return;
      const p = d.data.price_overview;
      out[id] = { initial: p.initial, final: p.final, cut: p.discount_percent, currency: p.currency };
    });
    await new Promise(res => setTimeout(res, 1200));
  }
  return out;
}

/* ---------- the pass ---------- */

async function refresh() {
  const ls = links();
  const lists = S.read('wishlists', {});

  for (const l of ls) {
    try {
      const items = await wishlistFor(l.id);
      lists[l.uid] = { id: l.id, items: items, at: Date.now(), private: items.length === 0 };
      delete state.errors[l.uid];
    } catch (e) {
      state.errors[l.uid] = e.message;
      log('wishlist', l.uid, e.message);
    }
  }
  S.write('wishlists', lists);

  /* only price what more than one person wants, plus the top of each list */
  const counts = {};
  Object.keys(lists).forEach(uid => {
    (lists[uid].items || []).forEach(it => {
      counts[it.appid] = counts[it.appid] || { n: 0, name: it.name, capsule: it.capsule, who: [] };
      counts[it.appid].n++;
      counts[it.appid].who.push(uid);
    });
  });
  const wanted = Object.keys(counts).sort((a, b) => counts[b].n - counts[a].n).slice(0, 50);

  let prices = S.read('prices', {});
  try {
    const got = await priceFor(wanted);
    prices = Object.assign(prices, got);
    S.write('prices', prices);
    delete state.errors.prices;
  } catch (e) {
    state.errors.prices = e.message;
    log('prices', e.message);
  }

  await announce(counts, prices);
  state.checkedAt = Date.now();
  return deals();
}

/* Tell the channel once per sale, not once per pass. */
async function announce(counts, prices) {
  const cfg = S.read('config', {});
  const ch = cfg.dealChannel;
  if (!ch) return;
  const told = S.read('dealstold', {});
  let posted = 0;

  for (const appid of Object.keys(counts)) {
    const c = counts[appid], p = prices[appid];
    if (!p || !p.cut || c.n < 2) continue;
    const sig = appid + ':' + p.cut;
    if (told[sig]) continue;
    told[sig] = Date.now();
    if (posted >= 3) continue;
    posted++;
    const names = c.who.map(uid => {
      const m = G.live.members[uid];
      return m ? (m.nick || m.global_name || m.username) : null;
    }).filter(Boolean);
    await D.post(ch, require('./embeds').deal(
      { appid: appid, name: c.name, price: p, who: names }, money)).catch(() => {});
  }
  S.write('dealstold', told);
}

function money(cents, cur) {
  const sym = { USD: '$', GBP: '£', EUR: '€' }[cur] || '$';
  return sym + (cents / 100).toFixed(2);
}

/* ---------- read API ---------- */

function overlap() {
  const lists = S.read('wishlists', {});
  const prices = S.read('prices', {});
  const by = {};
  Object.keys(lists).forEach(uid => {
    (lists[uid].items || []).forEach(it => {
      by[it.appid] = by[it.appid] || { appid: it.appid, name: it.name, capsule: it.capsule, who: [] };
      if (by[it.appid].who.indexOf(uid) === -1) by[it.appid].who.push(uid);
    });
  });
  return Object.values(by).map(x => Object.assign(x, { price: prices[x.appid] || null }));
}

function deals() {
  return overlap()
    .filter(x => x.who.length >= 2 && x.price && x.price.cut > 0)
    .sort((a, b) => b.price.cut - a.price.cut);
}

function status() {
  const lists = S.read('wishlists', {});
  return {
    checkedAt: state.checkedAt,
    linked: Object.keys(lists).length,
    privateOnes: Object.keys(lists).filter(k => lists[k].private).length,
    keyed: !!KEY,
    errors: state.errors
  };
}

function start() {
  if (timer) return;
  setTimeout(() => refresh().catch(e => log(e.message)), 30000);
  timer = setInterval(() => refresh().catch(e => log(e.message)), POLL_MS);
  if (timer.unref) timer.unref();
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { start, stop, refresh, resolve, links, overlap, deals, status, money, wishlistFor, priceFor };
