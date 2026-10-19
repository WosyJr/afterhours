const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');
const S = require('./store');

const MAX_CHARS = 280;

const VENDOR = path.join(__dirname, '..', 'vendor');
const PIPER_BIN = path.join(VENDOR, 'piper', 'piper');
const PIPER_DATA = path.join(VENDOR, 'piper', 'espeak-ng-data');
const VOICE_DIR = path.join(VENDOR, 'voices');

const VOICES = [
  { id: 'piper-amy', name: 'Amy', note: 'Real neural speech. The best one by a mile.', piper: 'en-us-amy-low' },
  { id: 'mb-us1', name: 'Natural, American', note: 'Clearest of the lot. Needs mbrola.', mb: true },
  { id: 'mb-en1', name: 'Natural, British', note: 'Same engine, British. Needs mbrola.', mb: true },
  { id: 'en-us', name: 'Robotic, American', note: 'The old default.' },
  { id: 'en-gb', name: 'Robotic, British', note: 'What it was set to before.' },
  { id: 'en-gb-x-rp', name: 'Robotic, well spoken', note: 'Received pronunciation.' },
  { id: 'en-us+Alex', name: 'Robotic, deeper', note: 'Lower male timbre.' },
  { id: 'en-us+f3', name: 'Robotic, female', note: 'Higher voice.' }
];

function cfg() { return S.read('config', {}); }

let moved = false;

function upgrade(have) {
  if (moved) return;
  moved = true;
  if (!have.piper) return;
  const c = cfg();
  if (c.ttsPiper) return;
  c.ttsPiper = 1;
  const old = c.ttsVoice;
  if (!old || !VOICES.find(v => v.id === old && v.piper)) c.ttsVoice = 'piper-amy';
  S.write('config', c);
  log('switched the voice to Amy');
}

function settings() {
  const have = available();
  upgrade(have);
  const c = cfg();
  const best = have.piper ? 'piper-amy' : have.mbrola ? 'mb-us1' : 'en-us';
  let voice = c.ttsVoice || process.env.TTS_VOICE || best;
  let pick = VOICES.find(v => v.id === voice);
  if (pick && pick.piper && !modelFor(pick.piper)) { voice = have.mbrola ? 'mb-us1' : 'en-us'; pick = VOICES.find(v => v.id === voice); }
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

function modelFor(slug) {
  if (!slug) return null;
  const m = path.join(VOICE_DIR, slug + '.onnx');
  try {
    if (!fs.existsSync(m) || !fs.existsSync(m + '.json')) return null;
  } catch (e) { return null; }
  return m;
}

function rateOf(model) {
  try {
    const j = JSON.parse(fs.readFileSync(model + '.json', 'utf8'));
    const r = j && j.audio && Number(j.audio.sample_rate);
    return r > 0 ? r : 16000;
  } catch (e) { return 16000; }
}

function piperReady() {
  try {
    if (!fs.existsSync(PIPER_BIN)) return false;
  } catch (e) { return false; }
  return VOICES.some(v => v.piper && modelFor(v.piper));
}

function available() {
  if (checked) return checked;
  const speak = which('espeak-ng') || which('espeak');
  const ff = which('ffmpeg');
  const pp = piperReady();
  checked = {
    ok: !!(ff && (speak || pp)),
    speak: speak,
    ffmpeg: ff,
    mbrola: !!which('mbrola'),
    piper: pp,
    why: !ff ? 'ffmpeg is not installed on the server.'
      : !speak && !pp ? 'No speech engine is installed on the server.' : ''
  };
  return checked;
}

function toStereo(have, feed) {
  const ff = spawn(have.ffmpeg, [
    '-hide_banner', '-loglevel', 'error'
  ].concat(feed.input).concat([
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    '-af', feed.filter || 'highpass=f=90,dynaudnorm=f=200:g=5,volume=1.25',
    'pipe:1'
  ]), { stdio: ['pipe', 'pipe', 'ignore'] });
  ff.on('error', () => {});
  return ff;
}

function sayPiper(have, cur, words) {
  const pick = VOICES.find(v => v.id === cur.voice);
  const model = modelFor(pick && pick.piper);
  const rate = rateOf(model);
  const args = ['--model', model, '--output_raw'];
  try {
    if (fs.existsSync(PIPER_DATA)) { args.push('--espeak_data', PIPER_DATA); }
  } catch (e) {}
  const scale = Math.max(0.5, Math.min(2, 165 / cur.wpm));
  args.push('--length_scale', scale.toFixed(2));

  const env = Object.assign({}, process.env);
  const libs = path.join(VENDOR, 'piper');
  env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? libs + ':' + env.LD_LIBRARY_PATH : libs;

  const sp = spawn(PIPER_BIN, args, { stdio: ['pipe', 'pipe', 'ignore'], env: env, cwd: libs });
  const ff = toStereo(have, {
    input: ['-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0'],
    filter: 'aresample=48000,highpass=f=70,dynaudnorm=f=250:g=5,volume=1.15'
  });

  sp.stdout.pipe(ff.stdin);
  sp.on('error', () => { try { ff.stdin.end(); } catch (e) {} });
  try {
    sp.stdin.end(words.replace(/[\r\n]+/g, ' ') + '\n');
  } catch (e) {}
  return { sp, ff };
}

function sayEspeak(have, cur, words) {
  const sp = spawn(have.speak, [
    '-v', cur.voice, '-s', String(cur.wpm), '-p', String(cur.pitch), '--stdout', words
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  const ff = toStereo(have, { input: ['-i', 'pipe:0'] });
  sp.stdout.pipe(ff.stdin);
  sp.on('error', () => { try { ff.stdin.end(); } catch (e) {} });
  return { sp, ff };
}

function say(text) {
  const have = available();
  if (!have.ok) throw new Error(have.why);
  const words = clean(text);
  if (!words) throw new Error('Nothing to say.');

  const cur = settings();
  const pick = VOICES.find(v => v.id === cur.voice);
  const usePiper = !!(pick && pick.piper && have.piper && modelFor(pick.piper));
  if (!usePiper && !have.speak) throw new Error('That voice is not installed on the server.');

  const pair = usePiper ? sayPiper(have, cur, words) : sayEspeak(have, cur, words);

  const out = new PassThrough();
  pair.ff.stdout.pipe(out);
  out.on('close', () => {
    try { pair.sp.kill(); } catch (e) {}
    try { pair.ff.kill(); } catch (e) {}
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

module.exports = { say, clean, prefix, available, reset, MAX_CHARS, VOICES, settings, setVoice, modelFor };
