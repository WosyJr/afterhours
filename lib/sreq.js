const S = require('./store');

const KEY = 'sreq';
const HIST = 'sreqlog';
const MAX_QUEUE_DEFAULT = 80;
const PER_PERSON_DEFAULT = 10;
const MAX_HIST = 60;

const state = { playing: null, at: 0, beat: 0, paused: false };
const ALIVE_MS = 25000;

function cfg() { return S.read('config', {}); }

function on() { return cfg().srOn !== false; }

function maxQueue() {
  const n = Number(cfg().srMaxQueue);
  return n > 0 ? Math.min(300, Math.round(n)) : MAX_QUEUE_DEFAULT;
}

function perPerson() {
  const n = Number(cfg().srPerPerson);
  if (n === 0) return Infinity;
  return n > 0 ? Math.min(100, Math.round(n)) : PER_PERSON_DEFAULT;
}

function setOn(v) {
  const c = cfg();
  c.srOn = !!v;
  S.write('config', c);
  return !!v;
}

function parseList(raw) {
  const str = String(raw || '').trim();
  if (!str) return null;
  if (/^(PL|UU|OLAK5uy_|RD|FL|LL)[\w-]{10,}$/.test(str)) return str;
  let u;
  try { u = new URL(str); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return null;
  const id = u.searchParams.get('list');
  if (!id) return null;
  if (id === 'WL' || id === 'LL') return null;
  return /^[\w-]{12,}$/.test(id) ? id : null;
}

function fallback() {
  const c = cfg();
  return c.srPlaylist ? { id: c.srPlaylist, name: c.srPlaylistName || '' } : null;
}

function setFallback(id, name) {
  const c = cfg();
  if (id) {
    c.srPlaylist = String(id).slice(0, 60);
    c.srPlaylistName = String(name || '').slice(0, 120);
  } else {
    delete c.srPlaylist;
    delete c.srPlaylistName;
  }
  S.write('config', c);
  return fallback();
}

async function lookupList(id) {
  const url = 'https://www.youtube.com/oembed?url=' +
    encodeURIComponent('https://www.youtube.com/playlist?list=' + id) + '&format=json';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    return String(j.title || '').slice(0, 120);
  } catch (e) { return null; }
}

function parse(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0] || '';
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') &&
      /^[\w-]{11}$/.test(parts[1] || '')) return parts[1];
  }
  return null;
}

function queue() {
  const q = S.read(KEY, []);
  return Array.isArray(q) ? q : [];
}

function save(q) { S.write(KEY, q.slice(0, maxQueue())); return q; }

function history() {
  const h = S.read(HIST, []);
  return Array.isArray(h) ? h : [];
}

async function lookup(id) {
  const url = 'https://www.youtube.com/oembed?url=' +
    encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&format=json';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.status === 401 || res.status === 403 || res.status === 404) return { gone: true };
    if (!res.ok) return { down: true };
    const j = await res.json();
    return { title: String(j.title || '').slice(0, 140), author: String(j.author_name || '').slice(0, 80) };
  } catch (e) {
    return { down: true };
  }
}

async function add(raw, who) {
  if (!on()) return { error: 'Requests are closed right now.' };
  const id = parse(raw);
  if (!id) {
    const list = parseList(raw);
    if (list) {
      const name = await lookupList(list);
      setFallback(list, name || '');
      return { ok: true, playlist: true, name: name || 'that playlist' };
    }
    return { error: 'That is not a YouTube link.' };
  }
  const q = queue();
  if (q.length >= maxQueue()) return { error: 'The queue is full (' + maxQueue() + '). Try again in a bit.' };
  if (q.some(x => x.id === id)) return { error: 'That is already in the queue.' };
  if (state.playing && state.playing.id === id) return { error: 'That is playing right now.' };
  const uid = who && who.id ? String(who.id) : '';
  const cap = perPerson();
  const mine = q.filter(x => x.by === uid).length;
  if (uid && mine >= cap) {
    return { error: 'You already have ' + cap + ' in the queue. Wait for one to play.' };
  }
  const meta = await lookup(id);
  if (!meta || meta.gone) {
    return { error: 'YouTube will not serve that one. It is private, deleted, or blocked from embedding.' };
  }
  if (meta.down) {
    return { error: 'Could not reach YouTube to check that link. Try again in a moment.' };
  }
  const row = {
    id: id,
    title: meta.title || id,
    author: meta.author || '',
    by: uid,
    byName: who && who.name ? String(who.name).slice(0, 40) : '',
    at: Date.now()
  };
  q.push(row);
  save(q);
  return { ok: true, at: q.length, track: row };
}

function remove(id, who, force) {
  const q = queue();
  const i = q.findIndex(x => x.id === id && (force || x.by === String((who && who.id) || '')));
  if (i === -1) return { error: 'Not yours to pull.' };
  q.splice(i, 1);
  save(q);
  return { ok: true };
}

function clear() { save([]); return { ok: true }; }

function advance() {
  const q = queue();
  const nextUp = q.shift() || null;
  save(q);
  if (state.playing) {
    const h = history();
    h.unshift(Object.assign({}, state.playing, { ended: Date.now() }));
    S.write(HIST, h.slice(0, MAX_HIST));
  }
  state.playing = nextUp;
  state.at = nextUp ? Date.now() : 0;
  state.beat = Date.now();
  return nextUp;
}

function skip() { return advance(); }

function stop() {
  state.playing = null;
  state.at = 0;
  state.beat = 0;
  state.paused = false;
}

function beat(info) {
  state.beat = Date.now();
  if (info && typeof info.paused === 'boolean') state.paused = info.paused;
  return true;
}

function live() { return !!(state.beat && Date.now() - state.beat < ALIVE_MS); }

function status() {
  return {
    on: on(),
    live: live(),
    paused: state.paused,
    playing: state.playing,
    since: state.at,
    queue: queue(),
    playlist: fallback(),
    history: history().slice(0, 8)
  };
}

module.exports = {
  parse, parseList, add, remove, clear, advance, skip, stop, beat, live, status,
  queue, history, on, setOn, maxQueue, perPerson, lookup, fallback, setFallback, lookupList
};
