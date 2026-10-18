const S = require('./store');
const G = require('./gateway');
const D = require('./discord');
const TTS = require('./tts');

const GUILD = process.env.DISCORD_GUILD_ID || '';
const MAX_QUEUE = 12;

let V = null;
try { V = require('@discordjs/voice'); } catch (e) { V = null; }

let sodium = null;
try { sodium = require('libsodium-wrappers'); } catch (e) { sodium = null; }

let prepared = null;

function prepare() {
  if (prepared) return prepared;
  prepared = (sodium && sodium.ready ? sodium.ready : Promise.resolve())
    .then(() => true)
    .catch(() => true);
  return prepared;
}

const live = {
  channel: null,
  tts: false,
  conn: null,
  player: null,
  queue: [],
  speaking: false,
  error: '',
  since: 0
};

function log() { console.log.apply(console, ['[voice]'].concat([].slice.call(arguments))); }

function ready() {
  if (!V) return { ok: false, why: 'The @discordjs/voice library is not installed.' };
  const t = TTS.available();
  if (!t.ok) return { ok: false, why: t.why };
  if (!D.botConfigured()) return { ok: false, why: 'The bot is not connected.' };
  return { ok: true, why: '' };
}

function status() {
  return {
    channel: live.channel,
    channelName: live.channel ? (G.live.channels[live.channel] || {}).name || 'a room' : null,
    tts: live.tts,
    queued: live.queue.length,
    speaking: live.speaking,
    since: live.since,
    error: live.error,
    can: ready()
  };
}


function adapterFor(channelId) {
  return methods => {
    const off = G.addVoiceAdapter(methods);
    return {
      sendPayload(payload) {
        return G.raw(payload);
      },
      destroy() {
        off();
      }
    };
  };
}

async function join(channelId, second) {
  const can = ready();
  if (!can.ok) throw new Error(can.why);
  const ch = G.live.channels[channelId];
  if (!ch || ch.type !== 2) throw new Error('That is not a voice channel.');

  await prepare();

  if (live.conn && live.channel === channelId) return live;
  if (live.conn) await leave();

  const trace = { states: [], net: [], close: null, err: null };
  const watchNet = net => {
    if (!net || net.__watched) return;
    net.__watched = true;
    if (net.state && typeof net.state.code === 'number') trace.net.push(net.state.code);
    net.on('stateChange', (o, n) => {
      if (n && typeof n.code === 'number' && n.code !== (o && o.code)) trace.net.push(n.code);
    });
    net.on('error', e => { trace.err = e && e.message; });
    net.on('close', code => { trace.close = code; });
  };

  live.conn = V.joinVoiceChannel({
    channelId: channelId,
    guildId: GUILD,
    adapterCreator: adapterFor(channelId),
    selfDeaf: false,
    selfMute: false
  });
  live.conn.on('stateChange', (was, now) => {
    if (now.status !== (was && was.status)) trace.states.push(now.status);
    if (now.networking) watchNet(now.networking);
  });
  live.conn.on('error', e => { trace.err = e && e.message; live.error = e.message; });
  if (live.conn.state && live.conn.state.networking) watchNet(live.conn.state.networking);

  live.player = V.createAudioPlayer({
    behaviors: { noSubscriber: V.NoSubscriberBehavior.Play }
  });
  live.conn.subscribe(live.player);

  live.player.on('stateChange', (was, now) => {
    if (now.status === V.AudioPlayerStatus.Idle) {
      live.speaking = false;
      next();
    }
    if (now.status === V.AudioPlayerStatus.Playing) live.speaking = true;
  });
  live.player.on('error', e => {
    live.error = e.message;
    live.speaking = false;
    log('player', e.message);
    next();
  });

  try {
    await V.entersState(live.conn, V.VoiceConnectionStatus.Ready, 18000);
  } catch (e) {
    live.lastTrace = trace;
    await leave();
    if (!second) {
      await new Promise(r => setTimeout(r, 1200));
      return join(channelId, true);
    }
    throw new Error(explain(trace));
  }

  live.channel = channelId;
  live.since = Date.now();
  live.error = '';
  return live;
}

function lastTrace() {
  if (!live.lastTrace) return '';
  try { return explain(live.lastTrace); } catch (e) { return ''; }
}

async function leave() {
  live.queue.length = 0;
  live.speaking = false;
  try { if (live.player) live.player.stop(true); } catch (e) {}
  try { if (live.conn) live.conn.destroy(); } catch (e) {}
  live.conn = null;
  live.player = null;
  live.channel = null;
  live.tts = false;
  live.since = 0;
  return true;
}

const NET = ['opening the voice websocket', 'identifying', 'the UDP handshake',
  'picking an encryption mode', 'ready', 'resuming', 'closed'];


function explain(trace) {
  const states = trace.states || [];
  const net = (trace.net || []).filter(c => c !== 6);
  const far = net.length ? Math.max.apply(null, net) : -1;
  const tail = ' (voice stages: ' + (states.join(' \u2192 ') || 'none') +
    (net.length ? ' | network: ' + net.map(c => NET[c] || c).join(' \u2192 ') : '') +
    (trace.close != null ? ' | closed with ' + trace.close : '') +
    (trace.err ? ' | ' + trace.err : '') + ')';

  if (trace.close === 4017) {
    return 'Discord now requires end to end encryption on voice (the DAVE protocol) and the bot told it ' +
      'it does not support it. That happens when the @snazzah/davey package is missing, which makes ' +
      '@discordjs/voice advertise version 0 and Discord hangs up. Run npm install @snazzah/davey, ' +
      'redeploy, and it connects.' + tail;
  }

  if (trace.close === 4016) {
    return 'Discord refused every encryption mode the bot offered. The crypto library is missing or too old ' +
      'on the server.' + tail;
  }

  if (trace.close === 4006 || trace.close === 4009) {
    return 'Discord invalidated the voice session. The bot is probably already sitting in another channel \u2014 ' +
      'drag it out, or run **/tts off**, and try again.' + tail;
  }
  if (trace.close === 4003 || trace.close === 4004) {
    return 'Discord refused the voice token. Restart the bot so it gets a fresh session.' + tail;
  }
  if (trace.close === 4016 || trace.close === 4015) {
    return 'The voice server went away mid-handshake. Usually transient \u2014 try again.' + tail;
  }

  if (far === -1) {
    return 'Discord never sent the voice server details, so nothing was even attempted. Check the bot has ' +
      '**Connect** on that channel and the channel is not full.' + tail;
  }
  if (far === 0) {
    return 'The voice websocket would not open. Outbound TLS to Discord\u2019s voice servers is being blocked.' + tail;
  }
  if (far === 1) {
    return 'The voice server accepted the connection but never answered the identify. Restarting the bot ' +
      'usually clears it.' + tail;
  }
  if (far === 2) {
    return 'It got to the UDP handshake and stopped there. That means **outbound UDP is blocked by the host** \u2014 ' +
      'the websocket works, the audio socket does not. On Railway this is the usual answer, and no code change ' +
      'fixes it; the bot has to run somewhere that allows UDP.' + tail;
  }
  if (far === 3) {
    return 'It got as far as picking an encryption mode and failed. The encryption library is present, so this is ' +
      'usually Discord rejecting the selection \u2014 try again, and tell me if it keeps happening.' + tail;
  }
  return 'The voice connection did not come up.' + tail;
}


function next() {
  if (!live.player || live.speaking) return;
  const job = live.queue.shift();
  if (!job) return;
  try {
    const pcm = TTS.say(job.text);
    const res = V.createAudioResource(pcm, { inputType: V.StreamType.Raw });
    live.speaking = true;
    live.player.play(res);
  } catch (e) {
    live.error = e.message;
    live.speaking = false;
    log('say', e.message);
    setTimeout(next, 50);
  }
}

function speak(text, who) {
  if (!live.conn || !live.player) return false;
  const line = who ? TTS.prefix(who, text) : TTS.clean(text);
  if (!line) return false;
  if (live.queue.length >= MAX_QUEUE) return false;
  live.queue.push({ text: line, at: Date.now() });
  if (!live.speaking) next();
  return true;
}

function setTts(on) {
  live.tts = !!on;
  return live.tts;
}


function onChat(m) {
  if (!live.tts || !live.channel) return false;
  if (!m || !m.author || m.author.bot) return false;
  if (m.channel_id !== live.channel) return false;
  const text = String(m.content || '');
  if (!text.trim()) return false;
  if (text.startsWith('!') || text.startsWith('/')) return false;
  const member = G.live.members[m.author.id];
  const name = member ? (member.nick || member.global_name || member.username) : null;
  return speak(text, name);
}

function start() {
  G.on('chat', m => {
    try { onChat(m); } catch (e) { log('chat', e.message); }
  });
  G.on('voice', (uid, before, after) => {
    if (!live.channel) return;
    const me = G.live.botId;
    if (uid === me) return;
    const left = Object.keys(G.live.voice || {}).filter(id => {
      const mem = G.live.members[id];
      return mem && !mem.bot && (G.live.voice[id] || {}).channel === live.channel;
    });
    if (!left.length) setTimeout(() => {
      const still = Object.keys(G.live.voice || {}).filter(id => {
        const mem = G.live.members[id];
        return mem && !mem.bot && (G.live.voice[id] || {}).channel === live.channel;
      });
      if (!still.length) leave().catch(() => {});
    }, 60000);
  });
}

async function warm() {
  await prepare();
  return true;
}

module.exports = {
  join, leave, speak, setTts, onChat, status, ready, start, warm, prepare, lastTrace,
  explain, live
};
