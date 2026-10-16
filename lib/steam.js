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

async function visibility(steamId) {
  if (!KEY) return { state: 'nokey', why: 'STEAM_API_KEY is not set on the server, so Steam cannot be asked anything.' };
  const q = new URLSearchParams({ key: KEY, steamids: steamId });
  const r = await fetch('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?' + q.toString());
  if (!r.ok) return { state: 'unknown', why: 'Steam answered ' + r.status + ' when asked about this profile.' };
  let j;
  try { j = await r.json(); } catch (e) { return { state: 'unknown', why: 'Steam sent back something unreadable.' }; }
  const p = j && j.response && j.response.players && j.response.players[0];
  if (!p) return { state: 'missing', why: 'Steam has no account with that ID.' };
  if (p.communityvisibilitystate === 3) return { state: 'public', name: p.personaname, avatar: p.avatarfull };
  return { state: 'private', name: p.personaname, avatar: p.avatarfull };
}

async function wishlistViaApi(steamId) {
  if (!KEY) return null;
  const q = new URLSearchParams({ key: KEY, steamid: steamId });
  const r = await fetch('https://api.steampowered.com/IWishlistService/GetWishlist/v1/?' + q.toString());
  if (!r.ok) return null;
  let j;
  try { j = await r.json(); } catch (e) { return null; }
  const items = j && j.response && j.response.items;
  if (!Array.isArray(items)) return null;
  return items.map(it => ({
    appid: String(it.appid),
    name: '',
    capsule: null,
    priority: it.priority || 0
  }));
}

async function wishlistViaStore(steamId) {
  const out = [];
  let answered = false;
  for (let page = 0; page < 4; page++) {
    const url = 'https://store.steampowered.com/wishlist/profiles/' + steamId + '/wishlistdata/page/' + page + '?cc=' + CC;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Afterhours/1.0)' } });
    if (!r.ok) break;
    answered = true;
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
  return answered ? out : null;
}

async function nameApps(items) {
  const need = items.filter(x => !x.name).slice(0, 60);
  for (let i = 0; i < need.length; i += 10) {
    const chunk = need.slice(i, i + 10);
    const q = 'appids=' + chunk.map(x => x.appid).join(',') + '&cc=' + CC + '&filters=basic';
    const r = await fetch('https://store.steampowered.com/api/appdetails?' + q,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Afterhours/1.0)' } }).catch(() => null);
    if (!r || !r.ok) continue;
    let j;
    try { j = await r.json(); } catch (e) { continue; }
    chunk.forEach(x => {
      const d = j[x.appid];
      if (d && d.success && d.data && d.data.name) x.name = d.data.name;
    });
    await new Promise(res => setTimeout(res, 900));
  }
  items.forEach(x => { if (!x.name) x.name = 'App ' + x.appid; });
  return items;
}

/* Steam reports visibility separately from the wishlist, so an empty wishlist
   on a public profile is no longer mistaken for a private one. */
async function wishlistFor(steamId) {
  const api = await wishlistViaApi(steamId);
  if (api) return nameApps(api);
  const store = await wishlistViaStore(steamId);
  if (store) return store;
  return null;
}

async function ownedFor(steamId) {
  if (!KEY) return null;
  const q = new URLSearchParams({
    key: KEY, steamid: steamId, include_appinfo: '1',
    include_played_free_games: '1', format: 'json'
  });
  const r = await fetch('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?' + q.toString());
  if (!r.ok) return null;
  let j;
  try { j = await r.json(); } catch (e) { return null; }
  const games = j && j.response && j.response.games;
  if (!Array.isArray(games)) return null;
  return games
    .filter(g => g.name)
    .map(g => ({ appid: String(g.appid), name: g.name, minutes: g.playtime_forever || 0 }))
    .sort((a, b) => b.minutes - a.minutes);
}

/* Folds a Steam library into the shared games list: anything already there
   gains this person as an owner, anything new is added. Nothing is removed,
   because the list also holds games nobody owns on Steam. */
async function syncLibrary(uid, steamId, opts) {
  const o = opts || {};
  const vis = await visibility(steamId);
  if (vis.state === 'nokey') return { ok: false, why: 'STEAM_API_KEY is not set on the server.' };
  if (vis.state === 'private') return { ok: false, why: 'That Steam profile is set to private.' };
  if (vis.state === 'missing') return { ok: false, why: 'Steam has no account with that ID.' };

  const owned = await ownedFor(steamId);
  if (owned === null) {
    return { ok: false, why: 'Steam would not hand the library over. Game details has to be public too, not just the profile.' };
  }
  if (!owned.length) return { ok: true, added: 0, joined: 0, total: 0, empty: true };

  const minMinutes = Math.max(0, Number(o.minMinutes) || 0);
  const take = owned.filter(g => g.minutes >= minMinutes).slice(0, Math.max(1, Number(o.limit) || 200));

  const lib = S.read('library', []);
  const times = S.read('playtimes', {});
  const prevTimes = times[uid] || {};
  const fresh = {};
  const bought = [];
  const byName = {};
  const byApp = {};
  lib.forEach(g => {
    byName[String(g.name).toLowerCase()] = g;
    if (g.appid) byApp[String(g.appid)] = g;
  });

  let added = 0;
  let joined = 0;
  owned.forEach(g => { fresh[g.appid] = g.minutes; });

  take.forEach(g => {
    const had = Object.prototype.hasOwnProperty.call(prevTimes, g.appid);
    if (!had && Object.keys(prevTimes).length) bought.push({ appid: g.appid, name: g.name });
    let row = byApp[g.appid] || byName[g.name.toLowerCase()];
    if (!row) {
      row = { id: S.id(), name: g.name, appid: g.appid, owners: [] };
      lib.push(row);
      byName[g.name.toLowerCase()] = row;
      byApp[g.appid] = row;
      added++;
    }
    if (!row.appid) row.appid = g.appid;
    row.owners = row.owners || [];
    if (row.owners.indexOf(uid) === -1) { row.owners.push(uid); joined++; }
  });

  S.write('library', lib);
  times[uid] = fresh;
  S.write('playtimes', times);
  const scans = S.read('libscans', {});
  const first = !scans[uid];
  scans[uid] = { at: Date.now(), total: owned.length, used: take.length, added: added, joined: joined };
  S.write('libscans', scans);
  return {
    ok: true, added: added, joined: joined, total: owned.length, used: take.length,
    bought: first ? [] : bought
  };
}

function lastScan(uid) { return S.read('libscans', {})[uid] || null; }

function playtimes() { return S.read('playtimes', {}); }

function minutesFor(uid, appid) {
  const t = S.read('playtimes', {})[uid];
  if (!t) return null;
  const v = t[String(appid)];
  return v === undefined ? null : v;
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
      const vis = await visibility(l.id);
      const prev = lists[l.uid] || {};
      if (vis.state === 'unknown' || vis.state === 'nokey') {
        lists[l.uid] = {
          id: l.id, items: prev.items || [], at: Date.now(),
          visible: vis.state, why: vis.why || ''
        };
        delete state.errors[l.uid];
        continue;
      }
      if (vis.state === 'private' || vis.state === 'missing') {
        lists[l.uid] = { id: l.id, items: [], at: Date.now(), visible: vis.state, why: vis.why || '' };
        delete state.errors[l.uid];
        continue;
      }
      const items = await wishlistFor(l.id);
      if (items === null) {
        lists[l.uid] = {
          id: l.id, items: prev.items || [], at: Date.now(),
          visible: vis.state, why: 'Steam would not hand over the wishlist just now.'
        };
      } else {
        lists[l.uid] = { id: l.id, items: items, at: Date.now(), visible: vis.state, why: '' };
      }
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
    const need = Math.max(1, Number(S.read('config', {}).dealMinWanters) || 1);
    if (!p || !p.cut || c.n < need) continue;
    const sig = appid + ':' + p.cut;
    if (told[sig]) continue;
    told[sig] = Date.now();
    if (posted >= 6) continue;
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
  const need = Math.max(1, Number(S.read('config', {}).dealMinWanters) || 1);
  return overlap()
    .filter(x => x.who.length >= need && x.price && x.price.cut > 0)
    .sort((a, b) => b.who.length - a.who.length || b.price.cut - a.price.cut);
}

function status() {
  const lists = S.read('wishlists', {});
  return {
    checkedAt: state.checkedAt,
    linked: Object.keys(lists).length,
    privateOnes: Object.keys(lists).filter(k => lists[k].visible === 'private' || lists[k].visible === 'missing').length,
    emptyOnes: Object.keys(lists).filter(k => lists[k].visible === 'public' && !(lists[k].items || []).length).length,
    unreadable: Object.keys(lists).filter(k => lists[k].visible === 'public' && lists[k].why).length,
    uncheckable: Object.keys(lists).filter(k => lists[k].visible === 'unknown').length,
    nokey: Object.keys(lists).filter(k => lists[k].visible === 'nokey').length,
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

function stateFor(uid) {
  const l = S.read('wishlists', {})[uid];
  if (!l) return { visible: 'unchecked', items: 0, why: '' };
  return { visible: l.visible || 'unchecked', items: (l.items || []).length, why: l.why || '', at: l.at };
}

module.exports = {
  start, stop, refresh, resolve, links, overlap, deals, status, money,
  wishlistFor, wishlistViaApi, wishlistViaStore, visibility, stateFor, priceFor,
  ownedFor, syncLibrary, lastScan, playtimes, minutesFor
};
