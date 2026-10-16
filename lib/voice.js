const S = require('./store');
const G = require('./gateway');
const D = require('./discord');
const TTS = require('./tts');

const GUILD = process.env.DISCORD_GUILD_ID || '';
const MAX_QUEUE = 12;

let V = null;
try { V = require('@discordjs/voice'); } catch (e) { V = null; }

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

/* @discordjs/voice normally drives discord.js. We only have a raw socket, so
   this hands it the two things it needs: a way to send op 4, and the voice
   payloads as they arrive. */
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

async function join(channelId) {
  const can = ready();
  if (!can.ok) throw new Error(can.why);
  const ch = G.live.channels[channelId];
  if (!ch || ch.type !== 2) throw new Error('That is not a voice channel.');

  if (live.conn && live.channel === channelId) return live;
  if (live.conn) await leave();

  live.conn = V.joinVoiceChannel({
    channelId: channelId,
    guildId: GUILD,
    adapterCreator: adapterFor(channelId),
    selfDeaf: false,
    selfMute: false
  });

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
    await V.entersState(live.conn, V.VoiceConnectionStatus.Ready, 20000);
  } catch (e) {
    await leave();
    throw new Error('Could not get into that channel: ' + e.message);
  }

  live.channel = channelId;
  live.since = Date.now();
  live.error = '';
  return live;
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

/* Discord gives every voice channel its own text chat, and that chat's
   id is the channel id, so a message from there is one to read out. */
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

module.exports = { join, leave, speak, setTts, onChat, status, ready, start, live };
