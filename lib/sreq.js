const S = require('./store');

const KEY = 'sreq';
const HIST = 'sreqlog';
const MAX_QUEUE = 40;
const PER_PERSON = 3;
const MAX_HIST = 60;

const state = { playing: null, at: 0, beat: 0, paused: false };
const ALIVE_MS = 25000;

function cfg() { return S.read('config', {}); }

function on() { return cfg().srOn !== false; }

function setOn(v) {
  const c = cfg();
  c.srOn = !!v;
  S.write('config', c);
  return !!v;
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

function save(q) { S.write(KEY, q.slice(0, MAX_QUEUE)); return q; }

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
  if (!id) return { error: 'That is not a YouTube link.' };
  const q = queue();
  if (q.length >= MAX_QUEUE) return { error: 'The queue is full. Try again in a bit.' };
  if (q.some(x => x.id === id)) return { error: 'That is already in the queue.' };
  if (state.playing && state.playing.id === id) return { error: 'That is playing right now.' };
  const uid = who && who.id ? String(who.id) : '';
  const mine = q.filter(x => x.by === uid).length;
  if (uid && mine >= PER_PERSON) {
    return { error: 'You already have ' + PER_PERSON + ' in the queue. Wait for one to play.' };
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
    history: history().slice(0, 8)
  };
}

module.exports = {
  parse, add, remove, clear, advance, skip, stop, beat, live, status,
  queue, history, on, setOn, MAX_QUEUE, PER_PERSON, lookup
};
