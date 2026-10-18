const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const S = require('./store');
const G = require('./gateway');
const D = require('./discord');
const E = require('./embeds');
const U = require('./uploads');
const TTS = require('./tts');

let V = null;
try { V = require('@discordjs/voice'); } catch (e) { V = null; }

const KEY = 'radio';

const live = { playing: null, order: [], at: 0, stopped: true, deck: 'crew' };

const DECKS = {
  crew: { id: 'crew', name: 'Crew', note: 'Discord voice only. Anything goes.' },
  safe: { id: 'safe', name: 'Stream safe', note: 'Licensed tracks only. Safe to broadcast.' }
};

function deckOf(t) { return t && t.deck === 'safe' ? 'safe' : 'crew'; }

function deck() { return live.deck === 'safe' ? 'safe' : 'crew'; }

function setDeck(d) {
  const next = d === 'safe' ? 'safe' : 'crew';
  if (next === live.deck) return next;
  live.deck = next;
  live.order = [];
  return next;
}

function inDeck(d) {
  const want = d || deck();
  return tracks().filter(t => deckOf(t) === want);
}

function counts() {
  const all = tracks();
  return {
    crew: all.filter(t => deckOf(t) === 'crew').length,
    safe: all.filter(t => deckOf(t) === 'safe').length
  };
}

function queue() {
  const q = S.read('radioqueue', []);
  return Array.isArray(q) ? q : [];
}

function saveQueue(q) { S.write('radioqueue', q.slice(0, 30)); return q; }

function request(trackId, who) {
  const t = tracks().find(x => x.id === trackId);
  if (!t) return { error: 'No such track.' };
  if (deckOf(t) !== deck()) return { error: 'That track is not on the deck that is playing.' };
  const q = queue();
  if (q.some(x => x.id === trackId)) return { error: 'That is already in the queue.' };
  const mine = q.filter(x => x.by === (who && who.id)).length;
  if (mine >= 3) return { error: 'You already have three in the queue. Wait for one to play.' };
  q.push({ id: trackId, name: t.name, by: who ? who.id : '', byName: who ? who.name : '', at: Date.now() });
  saveQueue(q);
  return { ok: true, at: q.length };
}

function unrequest(trackId, who, force) {
  const q = queue();
  const i = q.findIndex(x => x.id === trackId && (force || x.by === (who && who.id)));
  if (i === -1) return { error: 'Not yours to pull.' };
  q.splice(i, 1);
  saveQueue(q);
  return { ok: true };
}

function queueView() {
  const all = tracks();
  return queue().map(q => {
    const t = all.find(x => x.id === q.id);
    return { id: q.id, name: t ? t.name : q.name, byName: q.byName, missing: !t };
  });
}

function log() { console.log.apply(console, ['[radio]'].concat([].slice.call(arguments))); }

function tracks() {
  const r = S.read(KEY, null);
  return Array.isArray(r) ? r : [];
}

function save(v) { S.write(KEY, v); return v; }

function add(file, who) {
  const list = tracks();
  const row = {
    id: S.id(),
    name: String(file.name || 'Untitled').slice(0, 80),
    artist: String(file.artist || '').slice(0, 80),
    deck: file.deck === 'safe' ? 'safe' : 'crew',
    url: file.url,
    by: who ? who.id : '',
    byName: who ? who.name : '',
    at: Date.now(),
    plays: 0
  };
  list.push(row);
  save(list.slice(0, 200));
  return row;
}

function remove(id) {
  const list = tracks();
  const i = list.findIndex(t => t.id === id);
  if (i === -1) return false;
  const gone = list.splice(i, 1)[0];
  save(list);
  try {
    const p = path.join(U.DIR, path.basename(gone.url));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {}
  return true;
}

function pathFor(t) {
  return path.join(U.DIR, path.basename(t.url));
}

function ready() {
  if (!V) return { ok: false, why: 'The @discordjs/voice library is not installed.' };
  const t = TTS.available();
  if (!t.ffmpeg) return { ok: false, why: 'ffmpeg is not installed on the server.' };
  if (!tracks().length) return { ok: false, why: 'Nothing has been uploaded to the radio yet.' };
  return { ok: true, why: '' };
}

function stream(t) {
  const have = TTS.available();
  const file = pathFor(t);
  if (!fs.existsSync(file)) throw new Error('That file is missing from storage.');
  const ff = spawn(have.ffmpeg, [
    '-hide_banner', '-loglevel', 'error',
    '-i', file,
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    '-af', 'loudnorm=I=-18:TP=-2',
    'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  ff.on('error', () => {});
  ff.stdout.on('close', () => { try { ff.kill(); } catch (e) {} });
  return ff.stdout;
}

function shuffleOrder() {
  const list = inDeck();
  const order = list.map((t, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  return order;
}

function status() {
  const t = live.playing ? tracks().find(x => x.id === live.playing) : null;
  const c = counts();
  return {
    on: !live.stopped,
    track: t ? { id: t.id, name: t.name, byName: t.byName, artist: t.artist || '', deck: deckOf(t) } : null,
    since: live.at || 0,
    left: live.order.length,
    deck: deck(),
    deckName: DECKS[deck()].name,
    counts: c,
    total: c[deck()],
    queue: queueView(),
    can: ready()
  };
}

function playNext(Voice) {
  if (live.stopped) return;
  const list = inDeck();
  if (!list.length) { stop(Voice); return; }

  let t = null;
  const q = queue();
  while (q.length && !t) {
    const want = q.shift();
    const hit = list.find(x => x.id === want.id);
    if (hit) t = hit;
  }
  if (t) saveQueue(q);

  if (!t) {
    if (!live.order.length) live.order = shuffleOrder();
    const idx = live.order.shift();
    t = list[idx] || list[0];
  }
  if (!t) { stop(Voice); return; }
  try {
    const pcm = stream(t);
    const res = V.createAudioResource(pcm, { inputType: V.StreamType.Raw });
    live.playing = t.id;
    live.at = Date.now();
    const all = tracks();
    const row = all.find(x => x.id === t.id);
    if (row) { row.plays = (row.plays || 0) + 1; save(all); }
    Voice.live.player.play(res);
  } catch (e) {
    log('play', e.message);
    setTimeout(() => playNext(Voice), 200);
  }
}

async function start(Voice, channelId) {
  const can = ready();
  if (!can.ok) throw new Error(can.why);
  await Voice.join(channelId);
  live.stopped = false;
  live.order = shuffleOrder();

  if (!Voice.live.player.listenerCount('radio-hook')) {
    Voice.live.player.on('stateChange', (was, now) => {
      if (live.stopped) return;
      if (now.status === V.AudioPlayerStatus.Idle && was.status !== V.AudioPlayerStatus.Idle) {
        if (!Voice.live.queue.length && !Voice.live.speaking) setTimeout(() => playNext(Voice), 120);
      }
    });
    Voice.live.player.emit('radio-hook');
  }

  playNext(Voice);
  return status();
}

function stop(Voice) {
  live.stopped = true;
  live.playing = null;
  live.order = [];
  try { if (Voice && Voice.live.player) Voice.live.player.stop(true); } catch (e) {}
  return status();
}

function skip(Voice) {
  if (live.stopped) return status();
  try { if (Voice && Voice.live.player) Voice.live.player.stop(true); } catch (e) {}
  return status();
}

function embed() {
  const st = status();
  const list = tracks();
  const e = {
    color: E.C.night,
    title: st.on && st.track ? '♪  ' + st.track.name : 'The radio',
    description: st.on
      ? (st.track && st.track.byName ? 'Uploaded by ' + st.track.byName + '.' : '') +
        '\n' + st.left + ' more before it shuffles again.'
      : list.length
        ? list.length + ' track' + (list.length === 1 ? '' : 's') + ' uploaded. Run **/radio** in a voice channel.'
        : 'Nothing uploaded yet. Put some files on the site, under Settings.',
    footer: E.footer(E.brand() + ' · radio'),
    timestamp: new Date().toISOString()
  };
  if (st.on) {
    return {
      embeds: [e],
      allowed_mentions: { parse: [] },
      components: [{ type: 1, components: [
        { type: 2, style: 2, label: 'Skip', custom_id: 'radio:skip' },
        { type: 2, style: 4, label: 'Stop', custom_id: 'radio:stop' }
      ] }]
    };
  }
  return { embeds: [e], allowed_mentions: { parse: [] } };
}

module.exports = { tracks, add, remove, pathFor, ready, status, start, stop, skip, embed, stream, live,
  DECKS, deck, setDeck, deckOf, inDeck, counts, queue, queueView, request, unrequest, saveQueue };
