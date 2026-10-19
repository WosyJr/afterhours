const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const S = require('./store');

const MAX_CHARS = 280;

const VOICES = [
  { id: 'mb-us1', name: 'Natural, American', note: 'Clearest of the lot. Needs mbrola.', mb: true },
  { id: 'mb-en1', name: 'Natural, British', note: 'Same engine, British. Needs mbrola.', mb: true },
  { id: 'en-us', name: 'Robotic, American', note: 'The old default.' },
  { id: 'en-gb', name: 'Robotic, British', note: 'What it was set to before.' },
  { id: 'en-gb-x-rp', name: 'Robotic, well spoken', note: 'Received pronunciation.' },
  { id: 'en-us+Alex', name: 'Robotic, deeper', note: 'Lower male timbre.' },
  { id: 'en-us+f3', name: 'Robotic, female', note: 'Higher voice.' }
];

function cfg() { return S.read('config', {}); }

function settings() {
  const c = cfg();
  const have = available();
  let voice = c.ttsVoice || process.env.TTS_VOICE || (have.mbrola ? 'mb-us1' : 'en-us');
  const pick = VOICES.find(v => v.id === voice);
  if (pick && pick.mb && !have.mbrola) voice = 'en-us';
  return {
    voice: voice,
    wpm: Math.max(80, Math.min(260, Number(c.ttsWpm || process.env.TTS_WPM || 150))),
    pitch: Math.max(0, Math.min(99, Number(c.ttsPitch === undefined ? (process.env.TTS_PITCH || 45) : c.ttsPitch)))
  };
}

function setVoice(v) {
  const c = cfg();
  if (v.voice !== undefined) c.ttsVoice = String(v.voice).slice(0, 40);
  if (v.wpm !== undefined) c.ttsWpm = Math.max(80, Math.min(260, Number(v.wpm) || 150));
  if (v.pitch !== undefined) c.ttsPitch = Math.max(0, Math.min(99, Number(v.pitch)));
  S.write('config', c);
  return settings();
}

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
    mbrola: !!which('mbrola'),
    why: !speak ? 'espeak-ng is not installed on the server.'
      : !ff ? 'ffmpeg is not installed on the server.' : ''
  };
  return checked;
}

function say(text) {
  const have = available();
  if (!have.ok) throw new Error(have.why);
  const words = clean(text);
  if (!words) throw new Error('Nothing to say.');

  const cur = settings();
  const sp = spawn(have.speak, [
    '-v', cur.voice, '-s', String(cur.wpm), '-p', String(cur.pitch), '--stdout', words
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  const ff = spawn(have.ffmpeg, [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    '-af', 'highpass=f=90,dynaudnorm=f=200:g=5,volume=1.25',
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

module.exports = { say, clean, prefix, available, reset, MAX_CHARS, VOICES, settings, setVoice };
