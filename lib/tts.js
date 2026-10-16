const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const S = require('./store');

const VOICE = process.env.TTS_VOICE || 'en-gb';
const WPM = Number(process.env.TTS_WPM || 165);
const PITCH = Number(process.env.TTS_PITCH || 48);
const MAX_CHARS = 280;

let checked = null;

function log() { console.log.apply(console, ['[tts]'].concat([].slice.call(arguments))); }

function which(bin) {
  try {
    const r = require('child_process').spawnSync('sh', ['-c', 'command -v ' + bin]);
    return r.status === 0 && String(r.stdout).trim() ? String(r.stdout).trim() : null;
  } catch (e) {
    return null;
  }
}

function available() {
  if (checked) return checked;
  const speak = which('espeak-ng') || which('espeak');
  const ff = which('ffmpeg');
  checked = {
    ok: !!(speak && ff),
    speak: speak,
    ffmpeg: ff,
    why: !speak ? 'espeak-ng is not installed on the server.'
      : !ff ? 'ffmpeg is not installed on the server.' : ''
  };
  return checked;
}

/* Discord wants 48kHz stereo signed 16-bit. espeak gives mono at its own
   rate, so ffmpeg sits in the middle doing the conversion. */
function say(text) {
  const have = available();
  if (!have.ok) throw new Error(have.why);
  const words = clean(text);
  if (!words) throw new Error('Nothing to say.');

  const sp = spawn(have.speak, [
    '-v', VOICE, '-s', String(WPM), '-p', String(PITCH), '--stdout', words
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  const ff = spawn(have.ffmpeg, [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    '-af', 'volume=1.4',
    'pipe:1'
  ], { stdio: ['pipe', 'pipe', 'ignore'] });

  sp.stdout.pipe(ff.stdin);
  sp.on('error', () => { try { ff.stdin.end(); } catch (e) {} });
  ff.on('error', () => {});

  const out = new PassThrough();
  ff.stdout.pipe(out);
  out.on('close', () => {
    try { sp.kill(); } catch (e) {}
    try { ff.kill(); } catch (e) {}
  });
  return out;
}

/* Spoken aloud, a wall of emoji and a raw URL are both noise. */
function clean(text) {
  let t = String(text || '');
  t = t.replace(/```[\s\S]*?```/g, ' code block ');
  t = t.replace(/<a?:(\w+):\d+>/g, ' $1 ');
  t = t.replace(/<@!?(\d+)>/g, ' someone ');
  t = t.replace(/<@&(\d+)>/g, ' a role ');
  t = t.replace(/<#(\d+)>/g, ' a channel ');
  t = t.replace(/https?:\/\/\S+/g, ' a link ');
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, ' ');
  t = t.replace(/[*_~`|>]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS) + ', and so on';
  return t;
}

function prefix(name, text) {
  const who = String(name || '').replace(/[^\w' -]/g, '').trim();
  const body = clean(text);
  if (!body) return '';
  return (who ? who + ' says, ' : '') + body;
}

function reset() { checked = null; }

module.exports = { say, clean, prefix, available, reset, MAX_CHARS };
