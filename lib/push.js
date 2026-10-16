const S = require('./store');
const Site = require('./site');

let wp = null;
try { wp = require('web-push'); } catch (e) { wp = null; }

const KEY = 'pushsubs';

function log() { console.log.apply(console, ['[push]'].concat([].slice.call(arguments))); }

function keys() {
  const pub = process.env.VAPID_PUBLIC || '';
  const priv = process.env.VAPID_PRIVATE || '';
  return { pub: pub, priv: priv, on: !!(pub && priv && wp) };
}

function ready() { return keys().on; }

function why() {
  if (!wp) return 'The web-push library is not installed.';
  const k = keys();
  if (!k.pub || !k.priv) return 'VAPID_PUBLIC and VAPID_PRIVATE are not set on the server.';
  return '';
}

function configure() {
  const k = keys();
  if (!k.on) return false;
  try {
    wp.setVapidDetails(
      'mailto:' + (process.env.PUSH_CONTACT || 'nobody@example.com'),
      k.pub, k.priv
    );
    return true;
  } catch (e) {
    log('configure', e.message);
    return false;
  }
}

function all() {
  const r = S.read(KEY, null);
  return r && typeof r === 'object' ? r : {};
}

function save(v) { S.write(KEY, v); }

function forUser(uid) {
  const list = all()[uid];
  return Array.isArray(list) ? list : [];
}

function count() {
  const a = all();
  return Object.keys(a).reduce((n, k) => n + (a[k] || []).length, 0);
}

function add(uid, sub, agent) {
  if (!sub || !sub.endpoint) return false;
  const a = all();
  const list = (a[uid] || []).filter(s => s.endpoint !== sub.endpoint);
  list.push({
    endpoint: sub.endpoint,
    keys: sub.keys || {},
    agent: String(agent || '').slice(0, 120),
    at: Date.now()
  });
  a[uid] = list.slice(-6);
  save(a);
  return true;
}

function drop(uid, endpoint) {
  const a = all();
  if (!a[uid]) return false;
  a[uid] = a[uid].filter(s => s.endpoint !== endpoint);
  if (!a[uid].length) delete a[uid];
  save(a);
  return true;
}

function wants(uid, kind) {
  const prefs = S.read('pushprefs', {})[uid];
  if (!prefs) return kind === 'live' || kind === 'night';
  return prefs[kind] !== false;
}

function setPrefs(uid, prefs) {
  const all2 = S.read('pushprefs', {});
  all2[uid] = {
    live: prefs.live !== false,
    night: prefs.night !== false,
    deal: prefs.deal !== false,
    voice: prefs.voice === true
  };
  S.write('pushprefs', all2);
  return all2[uid];
}

function prefsFor(uid) {
  return S.read('pushprefs', {})[uid] || { live: true, night: true, deal: true, voice: false };
}

async function sendTo(uid, payload) {
  if (!configure()) return { sent: 0, why: why() };
  const subs = forUser(uid);
  if (!subs.length) return { sent: 0 };
  let sent = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) drop(uid, s.endpoint);
      else log('send', e.message);
    }
  }
  return { sent: sent };
}

async function broadcast(kind, payload, skip) {
  if (!ready()) return { sent: 0, people: 0 };
  const a = all();
  let sent = 0;
  let people = 0;
  for (const uid of Object.keys(a)) {
    if (skip && skip.indexOf(uid) > -1) continue;
    if (!wants(uid, kind)) continue;
    const r = await sendTo(uid, Object.assign({ kind: kind }, payload));
    if (r.sent) { sent += r.sent; people++; }
  }
  return { sent: sent, people: people };
}

function note(title, body, url, tag) {
  return {
    title: title,
    body: body,
    url: (Site.siteUrl() || '') + (url || ''),
    tag: tag || 'afterhours'
  };
}

module.exports = {
  ready, why, keys, all, forUser, count, add, drop, sendTo, broadcast,
  wants, setPrefs, prefsFor, note, configure
};
