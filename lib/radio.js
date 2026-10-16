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

const live = { playing: null, order: [], at: 0, stopped: true };

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

/* Everything gets pushed through ffmpeg to 48kHz stereo PCM, so an mp3, a
   wav and an opus file all behave the same once they reach the player. */
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
  const list = tracks();
  const order = list.map((t, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  return order;
}

function status() {
  const t = live.playing ? tracks().find(x => x.id === live.playing) : null;
  return {
    on: !live.stopped,
    track: t ? { id: t.id, name: t.name, byName: t.byName } : null,
    left: live.order.length,
    total: tracks().length,
    can: ready()
  };
}

function playNext(Voice) {
  if (live.stopped) return;
  const list = tracks();
  if (!list.length) { stop(Voice); return; }
  if (!live.order.length) live.order = shuffleOrder();
  const idx = live.order.shift();
  const t = list[idx] || list[0];
  if (!t) { stop(Voice); return; }
  try {
    const pcm = stream(t);
    const res = V.createAudioResource(pcm, { inputType: V.StreamType.Raw });
    live.playing = t.id;
    live.at = Date.now();
    t.plays = (t.plays || 0) + 1;
    save(list);
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

module.exports = { tracks, add, remove, pathFor, ready, status, start, stop, skip, embed, stream, live };
