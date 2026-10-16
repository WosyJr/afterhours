const S = require('./store');
const D = require('./discord');

const TW_ID = process.env.TWITCH_CLIENT_ID || '';
const TW_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const YT_KEY = process.env.YOUTUBE_API_KEY || '';
const POLL_MS = Number(process.env.STREAM_POLL_MS || 60000);

let twToken = null;
let twExpires = 0;
let timer = null;

const state = { live: {}, checkedAt: 0, errors: {} };

function log() {
  console.log.apply(console, ['[streams]'].concat([].slice.call(arguments)));
}

const siteHost = require('./site').siteHost;

function twitchConfigured() { return !!(TW_ID && TW_SECRET); }

/* ---------- channel links ---------- */

function links() {
  const profs = S.read('profiles', {});
  const out = [];
  Object.keys(profs).forEach(uid => {
    const p = profs[uid] || {};
    if (p.twitch) out.push({ uid, platform: 'twitch', handle: String(p.twitch).replace(/^@/, '').trim() });
    if (p.youtube) out.push({ uid, platform: 'youtube', handle: String(p.youtube).trim() });
  });
  return out;
}

/* ---------- twitch ---------- */

async function twitchToken() {
  if (twToken && Date.now() < twExpires - 60000) return twToken;
  const q = new URLSearchParams({
    client_id: TW_ID, client_secret: TW_SECRET, grant_type: 'client_credentials'
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token?' + q.toString(), { method: 'POST' });
  if (!res.ok) throw new Error('twitch token ' + res.status);
  const j = await res.json();
  twToken = j.access_token;
  twExpires = Date.now() + (j.expires_in || 3600) * 1000;
  return twToken;
}

async function checkTwitch(handles) {
  if (!handles.length || !twitchConfigured()) return [];
  const token = await twitchToken();
  const out = [];
  for (let i = 0; i < handles.length; i += 100) {
    const batch = handles.slice(i, i + 100);
    const q = batch.map(h => 'user_login=' + encodeURIComponent(h.toLowerCase())).join('&');
    const res = await fetch('https://api.twitch.tv/helix/streams?' + q, {
      headers: { 'Client-Id': TW_ID, Authorization: 'Bearer ' + token }
    });
    if (res.status === 401) { twToken = null; throw new Error('twitch token rejected'); }
    if (!res.ok) throw new Error('twitch streams ' + res.status);
    const j = await res.json();
    (j.data || []).forEach(s => {
      out.push({
        platform: 'twitch',
        handle: s.user_login,
        name: s.user_name,
        title: s.title,
        game: s.game_name || '',
        viewers: s.viewer_count,
        started: Date.parse(s.started_at),
        thumb: (s.thumbnail_url || '').replace('{width}', '640').replace('{height}', '360'),
        url: 'https://twitch.tv/' + s.user_login,
        embed: 'https://player.twitch.tv/?channel=' + encodeURIComponent(s.user_login) +
          '&parent=' + encodeURIComponent(siteHost()) + '&muted=true'
      });
    });
  }
  return out;
}

/* ---------- youtube ---------- */

/* The Data API costs 100 quota units per live search against a 10,000/day
   budget, which is about 100 checks a day in total. So by default we read the
   channel's own /live page, which is free and unmetered. Set YOUTUBE_API_KEY
   to use the official route instead. */

function ytUrl(handle) {
  const h = String(handle).trim();
  if (/^UC[\w-]{20,}$/.test(h)) return 'https://www.youtube.com/channel/' + h + '/live';
  if (h.startsWith('@')) return 'https://www.youtube.com/' + h + '/live';
  return 'https://www.youtube.com/@' + h + '/live';
}

async function checkYoutubeScrape(handle) {
  const res = await fetch(ytUrl(handle), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Afterhours/1.0)',
      'Accept-Language': 'en-GB,en;q=0.9'
    },
    redirect: 'follow'
  });
  if (!res.ok) return null;
  const html = await res.text();

  const isLive = /"isLiveBroadcast"\s*:\s*true/.test(html) ||
    /"isLive"\s*:\s*true/.test(html) ||
    /hlsManifestUrl/.test(html);
  if (!isLive) return null;

  const vid = (html.match(/"videoId"\s*:\s*"([\w-]{11})"/) || [])[1] || null;
  const title = decodeEntities(
    (html.match(/<meta\s+name="title"\s+content="([^"]+)"/) || [])[1] ||
    (html.match(/<title>([^<]+)<\/title>/) || [])[1] || 'Live now'
  ).replace(/\s*-\s*YouTube\s*$/, '');

  return {
    platform: 'youtube',
    handle: handle,
    name: handle,
    title: title,
    game: '',
    viewers: null,
    started: null,
    thumb: vid ? 'https://i.ytimg.com/vi/' + vid + '/hqdefault_live.jpg' : null,
    url: vid ? 'https://www.youtube.com/watch?v=' + vid : ytUrl(handle),
    embed: vid ? 'https://www.youtube.com/embed/' + vid : null
  };
}

async function checkYoutubeApi(handle) {
  let channelId = handle;
  if (!/^UC[\w-]{20,}$/.test(handle)) {
    const q = new URLSearchParams({ part: 'snippet', type: 'channel', q: handle, maxResults: '1', key: YT_KEY });
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + q.toString());
    if (!r.ok) throw new Error('youtube search ' + r.status);
    const j = await r.json();
    const item = (j.items || [])[0];
    if (!item) return null;
    channelId = item.snippet.channelId;
  }
  const q2 = new URLSearchParams({
    part: 'snippet', channelId: channelId, eventType: 'live', type: 'video', maxResults: '1', key: YT_KEY
  });
  const r2 = await fetch('https://www.googleapis.com/youtube/v3/search?' + q2.toString());
  if (!r2.ok) throw new Error('youtube live ' + r2.status);
  const j2 = await r2.json();
  const v = (j2.items || [])[0];
  if (!v) return null;
  return {
    platform: 'youtube',
    handle: handle,
    name: v.snippet.channelTitle,
    title: v.snippet.title,
    game: '',
    viewers: null,
    started: Date.parse(v.snippet.publishedAt),
    thumb: (v.snippet.thumbnails && (v.snippet.thumbnails.high || v.snippet.thumbnails.medium) || {}).url || null,
    url: 'https://www.youtube.com/watch?v=' + v.id.videoId,
    embed: 'https://www.youtube.com/embed/' + v.id.videoId
  };
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\\u0026/g, '&');
}

/* ---------- announce ---------- */

async function announce(uid, s) {
  const cfg = S.read('config', {});
  const ch = cfg.liveChannel || cfg.announceChannel;
  if (!ch) return;
  await D.post(ch, require('./embeds').live(uid, s)).catch(() => {});
}

/* ---------- the loop ---------- */

async function checkAll() {
  const all = links();
  const next = {};

  const tw = all.filter(l => l.platform === 'twitch');
  if (tw.length && twitchConfigured()) {
    try {
      const found = await checkTwitch(tw.map(l => l.handle));
      found.forEach(s => {
        const owner = tw.find(l => l.handle.toLowerCase() === s.handle.toLowerCase());
        if (owner) next[owner.uid] = s;
      });
      delete state.errors.twitch;
    } catch (e) {
      state.errors.twitch = e.message;
      log('twitch:', e.message);
    }
  }

  const yt = all.filter(l => l.platform === 'youtube');
  for (const l of yt) {
    try {
      const s = YT_KEY ? await checkYoutubeApi(l.handle) : await checkYoutubeScrape(l.handle);
      if (s) next[l.uid] = s;
      delete state.errors.youtube;
    } catch (e) {
      state.errors.youtube = e.message;
      log('youtube ' + l.handle + ':', e.message);
    }
  }

  Object.keys(next).forEach(uid => {
    if (state.live[uid]) return;
    announce(uid, next[uid]);
    require('./stats').bump(uid, 'streams');
  });

  const seen = S.read('lastlive', {});
  Object.keys(state.live).forEach(uid => { if (!next[uid]) seen[uid] = Date.now(); });
  S.write('lastlive', seen);

  state.live = next;
  state.checkedAt = Date.now();
  return next;
}

function start() {
  if (timer) return;
  if (!twitchConfigured() && !YT_KEY) log('no Twitch credentials; YouTube will use the free page check');
  checkAll().catch(e => log(e.message));
  timer = setInterval(() => checkAll().catch(e => log(e.message)), POLL_MS);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); timer = null; }

/* ---------- read API ---------- */

function liveFor(uid) { return state.live[uid] || null; }
function liveList() {
  return Object.keys(state.live).map(uid => Object.assign({ uid }, state.live[uid]));
}
function lastLive(uid) { return S.read('lastlive', {})[uid] || null; }
function status() {
  return {
    checkedAt: state.checkedAt,
    count: Object.keys(state.live).length,
    twitch: twitchConfigured(),
    youtube: YT_KEY ? 'api' : 'page check',
    errors: state.errors
  };
}

module.exports = {
  start, stop, checkAll, announce, liveFor, liveList, lastLive, links, status, state,
  checkTwitch, checkYoutubeScrape, ytUrl, siteHost, twitchConfigured
};
