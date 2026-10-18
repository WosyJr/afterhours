const S = require('./store');
const St = require('./streams');

const KEY = 'twitchclips';
const IDS = 'twitchids';
const MAX = 120;
const LOOKBACK_DAYS = 14;

const TW_ID = process.env.TWITCH_CLIENT_ID || '';

function log() { console.log('[clips]', Array.prototype.join.call(arguments, ' ')); }

function stored() { return S.read(KEY, []); }

function configured() { return St.twitchConfigured(); }

async function helix(path, token) {
  const res = await fetch('https://api.twitch.tv/helix/' + path, {
    headers: { 'Client-Id': TW_ID, Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('twitch ' + path.split('?')[0] + ' ' + res.status);
  return res.json();
}

async function idsFor(logins, token) {
  const have = S.read(IDS, {});
  const need = logins.filter(l => !have[l.toLowerCase()]);
  for (let i = 0; i < need.length; i += 100) {
    const batch = need.slice(i, i + 100);
    const q = batch.map(l => 'login=' + encodeURIComponent(l.toLowerCase())).join('&');
    const j = await helix('users?' + q, token);
    (j.data || []).forEach(u => { have[u.login.toLowerCase()] = u.id; });
  }
  S.write(IDS, have);
  return have;
}

function shape(c, uid) {
  return {
    id: c.id,
    uid: String(uid),
    title: c.title || 'Clip',
    url: c.url,
    embed: c.embed_url || '',
    thumb: c.thumbnail_url || '',
    creator: c.creator_name || '',
    game: c.game_id || '',
    views: Number(c.view_count) || 0,
    seconds: Math.round(Number(c.duration) || 0),
    at: Date.parse(c.created_at) || Date.now()
  };
}

async function collect() {
  if (!configured()) return { ok: false, why: 'Twitch is not configured.' };
  const links = St.links().filter(l => l.platform === 'twitch');
  if (!links.length) return { ok: true, added: 0, checked: 0 };

  const token = await St.twitchToken();
  const map = await idsFor(links.map(l => l.handle), token);

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const have = stored();
  const seen = {};
  have.forEach(c => { seen[c.id] = true; });

  let added = 0;
  let checked = 0;

  for (const l of links) {
    const bid = map[String(l.handle).toLowerCase()];
    if (!bid) continue;
    checked++;
    try {
      const j = await helix('clips?broadcaster_id=' + encodeURIComponent(bid) +
        '&first=20&started_at=' + encodeURIComponent(since), token);
      (j.data || []).forEach(c => {
        if (seen[c.id]) return;
        seen[c.id] = true;
        have.unshift(shape(c, l.uid));
        added++;
      });
    } catch (e) {
      log(l.handle, e.message);
    }
  }

  have.sort((a, b) => b.at - a.at);
  S.write(KEY, have.slice(0, MAX));
  return { ok: true, added: added, checked: checked, total: Math.min(have.length, MAX) };
}

function list(n) { return stored().slice(0, n || 24); }

function forUser(uid, n) {
  return stored().filter(c => String(c.uid) === String(uid)).slice(0, n || 12);
}

function thumbOf(c) {
  return (c.thumb || '').replace('%{width}x%{height}', '480x272')
    .replace('{width}x{height}', '480x272');
}

let timer = null;

function start(ms) {
  if (timer) return;
  if (!configured()) return;
  const every = ms || 15 * 60 * 1000;
  collect().catch(e => log(e.message));
  timer = setInterval(() => collect().catch(e => log(e.message)), every);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); timer = null; }

module.exports = { collect, list, forUser, thumbOf, start, stop, configured, stored };
