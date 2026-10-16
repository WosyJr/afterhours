const WebSocket = require('ws');
const S = require('./store');
const D = require('./discord');

const TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GUILD = process.env.DISCORD_GUILD_ID || '';

/* GUILDS 1 | GUILD_MEMBERS 2 | GUILD_VOICE_STATES 128 | GUILD_PRESENCES 256
   | GUILD_MESSAGES 512 | GUILD_MESSAGE_REACTIONS 1024 | MESSAGE_CONTENT 32768 */
const INTENTS = 1 | 2 | 128 | 256 | 512 | 1024 | 32768;

const PIN = '\u{1F4CC}';

const live = {
  ready: false,
  since: null,
  presence: {},
  voice: {},
  channels: {},
  roles: [],
  members: {},
  lastError: null,
  botId: null,
  botRoleTop: null
};

let ws = null;
let hb = null;
let seq = null;
let sessionId = null;
let resumeUrl = null;
let backoff = 1000;

function log() {
  console.log.apply(console, ['[gateway]'].concat([].slice.call(arguments)));
}

function send(op, d) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op, d }));
}

function heartbeat(ms) {
  clearInterval(hb);
  hb = setInterval(() => send(1, seq), ms);
}

function identify() {
  send(2, {
    token: TOKEN,
    intents: INTENTS,
    properties: { os: process.platform, browser: 'afterhours', device: 'afterhours' },
    presence: { status: 'online', activities: [], afk: false, since: null }
  });
}

function resume() {
  send(6, { token: TOKEN, session_id: sessionId, seq: seq });
}

/* ---------- state handlers ---------- */

function setPresence(p) {
  if (!p || !p.user) return;
  const act = (p.activities || []).filter(a => a.type !== 4)[0] || (p.activities || [])[0] || null;
  live.presence[p.user.id] = {
    status: p.status || 'offline',
    activity: act ? {
      type: act.type,
      name: act.name,
      details: act.details || null,
      state: act.state || null
    } : null,
    at: Date.now()
  };
}

function setMember(m) {
  if (!m || !m.user) return;
  live.members[m.user.id] = {
    id: m.user.id,
    username: m.user.username,
    global_name: m.user.global_name || null,
    nick: m.nick || null,
    avatar: D.avatarUrl(m.user),
    roles: m.roles || [],
    joined_at: m.joined_at || null,
    bot: !!m.user.bot
  };
}

function setVoice(v) {
  if (!v) return;
  if (!v.channel_id) { delete live.voice[v.user_id]; return; }
  live.voice[v.user_id] = {
    channel: v.channel_id,
    mute: !!(v.self_mute || v.mute),
    deaf: !!(v.self_deaf || v.deaf),
    stream: !!v.self_stream,
    video: !!v.self_video
  };
}

/* ---------- message mirroring ---------- */

function watched() {
  const cfg = S.read('config', {});
  const out = {};
  if (cfg.memoriesChannel) out[cfg.memoriesChannel] = 'memories';
  if (cfg.mediaChannel) out[cfg.mediaChannel] = 'media';
  return out;
}

function shapeMessage(m, kind) {
  const atts = (m.attachments || []).map(a => ({
    url: a.url,
    name: a.filename,
    width: a.width || null,
    height: a.height || null,
    video: /^video\//.test(a.content_type || '') || /\.(mp4|webm|mov)$/i.test(a.filename || ''),
    image: /^image\//.test(a.content_type || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.filename || '')
  }));
  const embedImg = (m.embeds || [])
    .map(e => (e.image && e.image.url) || (e.thumbnail && e.thumbnail.url) || null)
    .filter(Boolean);
  return {
    id: m.id,
    kind: kind,
    channel: m.channel_id,
    author: {
      id: m.author.id,
      name: m.author.global_name || m.author.username,
      avatar: D.avatarUrl(m.author)
    },
    text: m.content || '',
    attachments: atts,
    embeds: embedImg,
    reactions: {},
    pinned: false,
    at: m.timestamp ? Date.parse(m.timestamp) : Date.now()
  };
}

function saveMessages(list) {
  S.write('messages', list.slice(0, 400));
}

function messages() {
  return S.read('messages', []);
}

function upsertMessage(msg) {
  const all = messages();
  const i = all.findIndex(x => x.id === msg.id);
  if (i > -1) all[i] = Object.assign(all[i], msg);
  else all.unshift(msg);
  all.sort((a, b) => b.at - a.at);
  saveMessages(all);
}

const voiceAdapters = new Set();

function addVoiceAdapter(methods) {
  voiceAdapters.add(methods);
  return () => voiceAdapters.delete(methods);
}

function raw(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

const hooks = {};

function on(name, fn) {
  hooks[name] = hooks[name] || [];
  hooks[name].push(fn);
}

function hook(name) {
  const args = [].slice.call(arguments, 1);
  (hooks[name] || []).forEach(fn => {
    try {
      const r = fn.apply(null, args);
      if (r && typeof r.catch === 'function') r.catch(e => log(name + ' hook', e.message));
    } catch (e) {
      log(name + ' hook', e.message);
    }
  });
}

function recomputeBotTop() {
  if (!live.botId) return;
  const me = live.members[live.botId];
  if (!me || !me.roles) return;
  let top = null;
  me.roles.forEach(id => {
    const r = live.roles.find(x => x.id === id);
    if (r && (top == null || r.position > top)) top = r.position;
  });
  live.botRoleTop = top;
}

function reactionChange(d, delta) {
  const emoji = d.emoji && (d.emoji.name || d.emoji.id);
  if (!emoji) return;
  const all = messages();
  const m = all.find(x => x.id === d.message_id);
  if (!m) return;
  m.reactions[emoji] = Math.max(0, (m.reactions[emoji] || 0) + delta);
  if (!m.reactions[emoji]) delete m.reactions[emoji];
  if (emoji === PIN) m.pinned = (m.reactions[PIN] || 0) > 0;

  const was = m.kind;
  const promoted = autoPromote(m);
  saveMessages(all);
  if (promoted && was !== m.kind) hook('promoted', m);
}

/* A clip everyone piles onto belongs in Memories without anyone pinning it. */
function autoPromote(m) {
  const cfg = require('./store').read('config', {});
  const need = Math.max(0, Number(cfg.promoteAt) || 0);
  if (!need || m.kind !== 'media' || m.pinned) return false;
  const total = Object.keys(m.reactions || {})
    .reduce((n, k) => n + (m.reactions[k] || 0), 0);
  if (total < need) return false;
  m.kind = 'memories';
  m.pinned = true;
  m.autoPinned = Date.now();
  return true;
}

/* Pull recent history for a channel so the page is not empty on first run. */
async function backfill(channelId, kind) {
  if (!channelId) return;
  try {
    const raw = await D.channelMessages(channelId, 50);
    const all = messages();
    raw.forEach(m => {
      if (m.author && m.author.bot) return;
      const shaped = shapeMessage(m, kind);
      (m.reactions || []).forEach(r => {
        const name = r.emoji.name || r.emoji.id;
        shaped.reactions[name] = r.count;
        if (name === PIN) shaped.pinned = true;
      });
      if (!all.some(x => x.id === shaped.id)) all.push(shaped);
    });
    all.sort((a, b) => b.at - a.at);
    saveMessages(all);
    log('backfilled', kind, raw.length, 'messages');
  } catch (e) {
    log('backfill failed for', kind, e.message);
  }
}

async function backfillAll() {
  const cfg = S.read('config', {});
  await backfill(cfg.memoriesChannel, 'memories');
  await backfill(cfg.mediaChannel, 'media');
}

/* ---------- dispatch ---------- */

function dispatch(t, d) {
  if (t === 'READY') {
    live.ready = true;
    live.since = Date.now();
    live.lastError = null;
    sessionId = d.session_id;
    resumeUrl = d.resume_gateway_url;
    backoff = 1000;
    live.botId = d.user && d.user.id;
    log('ready as', d.user && d.user.username);
    recomputeBotTop();
    return;
  }

  if (t === 'GUILD_CREATE' && d.id === GUILD) {
    (d.members || []).forEach(setMember);
    (d.presences || []).forEach(setPresence);
    (d.voice_states || []).forEach(v => setVoice(Object.assign({ user_id: v.user_id }, v)));
    (d.channels || []).forEach(c => {
      live.channels[c.id] = { id: c.id, name: c.name, type: c.type, parent: c.parent_id || null };
    });
    live.roles = (d.roles || [])
      .filter(r => r.name !== '@everyone')
      .map(r => ({
        id: r.id, name: r.name, position: r.position,
        colour: r.color ? '#' + r.color.toString(16).padStart(6, '0') : '#99A0BB',
        managed: !!r.managed
      }))
      .sort((a, b) => b.position - a.position);
    require('./perms').seed(live.roles);
    recomputeBotTop();
    log('guild loaded:', Object.keys(live.members).length, 'members,', live.roles.length, 'roles');
    backfillAll();
    hook('guild');
    return;
  }

  /* Without these, a channel made after the bot connected never shows up in
     the dropdowns until the whole app restarts. */
  if (t === 'CHANNEL_CREATE' || t === 'CHANNEL_UPDATE') {
    if (d.guild_id && GUILD && d.guild_id !== GUILD) return;
    live.channels[d.id] = { id: d.id, name: d.name, type: d.type, parent: d.parent_id || null };
    log('channel ' + (t === 'CHANNEL_CREATE' ? 'added' : 'renamed') + ': ' + d.name);
    return;
  }
  if (t === 'CHANNEL_DELETE') { delete live.channels[d.id]; return; }

  if (t === 'PRESENCE_UPDATE') return setPresence(d);
  if (t === 'VOICE_SERVER_UPDATE') {
    voiceAdapters.forEach(a => { try { a.onVoiceServerUpdate(d); } catch (e) {} });
    return;
  }

  if (t === 'VOICE_STATE_UPDATE') {
    if (d.user_id === live.botId) {
      voiceAdapters.forEach(a => { try { a.onVoiceStateUpdate(d); } catch (e) {} });
    }
    const uid = d.user_id;
    const was = (live.voice[uid] || {}).channel || null;
    setVoice(d);
    const nowCh = (live.voice[uid] || {}).channel || null;
    const me = live.members[uid];
    if (was !== nowCh && !(me && me.bot)) hook('voice', uid, was, nowCh);
    return;
  }
  if (t === 'GUILD_MEMBER_ADD') {
    setMember(d);
    hook('join', d);
    return;
  }
  if (t === 'GUILD_MEMBER_UPDATE') {
    const was = live.members[d.user && d.user.id];
    const before = was ? (was.roles || []).slice() : [];
    setMember(d);
    hook('memberroles', before, d.roles || [], d.user && d.user.id);
    if (d.user && live.botId && d.user.id === live.botId) recomputeBotTop();
    return;
  }
  if (t === 'GUILD_MEMBER_REMOVE') {
    /* Presence and voice have to go with them, or someone who left the server
       keeps being counted as online for as long as the bot stays up. */
    const id = d.user && d.user.id;
    const was = id ? live.members[id] : null;
    if (id) { delete live.members[id]; delete live.presence[id]; delete live.voice[id]; }
    if (id && !(was && was.bot)) hook('leave', id, was);
    return;
  }

  if (t === 'GUILD_ROLE_CREATE' || t === 'GUILD_ROLE_UPDATE' || t === 'GUILD_ROLE_DELETE') {
    D.guildRoles().then(rs => { live.roles = rs; require('./perms').seed(rs); recomputeBotTop(); }).catch(() => {});
    return;
  }

  /* With no Interactions Endpoint URL set in the Developer Portal, slash
     commands arrive down this same socket, so there is no second webhook to
     host and nothing to verify. */
  if (t === 'INTERACTION_CREATE') {
    require('./commands').handle(d);
    return;
  }

  if (t === 'MESSAGE_CREATE') {
    if (!(d.author && d.author.bot)) hook('chat', d);
    const kind = watched()[d.channel_id];
    if (!kind || (d.author && d.author.bot)) return;
    upsertMessage(shapeMessage(d, kind));
    if (kind === 'media' && d.author) require('./stats').bump(d.author.id, 'clips');
    return;
  }

  if (t === 'MESSAGE_UPDATE') {
    const kind = watched()[d.channel_id];
    if (!kind || !d.id) return;
    const all = messages();
    const m = all.find(x => x.id === d.id);
    if (m && typeof d.content === 'string') { m.text = d.content; saveMessages(all); }
    return;
  }

  if (t === 'MESSAGE_DELETE') {
    const all = messages().filter(x => x.id !== d.id);
    saveMessages(all);
    return;
  }

  if (t === 'MESSAGE_REACTION_ADD') {
    hook('reaction', d, true);
    return reactionChange(d, 1);
  }
  if (t === 'MESSAGE_REACTION_REMOVE') {
    hook('reaction', d, false);
    return reactionChange(d, -1);
  }
}

/* ---------- connection ---------- */

function connect() {
  if (!TOKEN || !GUILD) {
    log('no bot token or guild id, running without live Discord data');
    return;
  }
  const url = (resumeUrl || 'wss://gateway.discord.gg') + '/?v=10&encoding=json';
  ws = new WebSocket(url);

  ws.on('open', () => log('socket open'));

  ws.on('message', raw => {
    let p;
    try { p = JSON.parse(raw); } catch (e) { return; }
    if (p.s) seq = p.s;

    if (p.op === 10) {
      heartbeat(p.d.heartbeat_interval);
      if (sessionId && seq) resume(); else identify();
      return;
    }
    if (p.op === 1) return send(1, seq);
    if (p.op === 7) { ws.close(4000); return; }
    if (p.op === 9) { sessionId = null; seq = null; setTimeout(identify, 2000); return; }
    if (p.op === 0) dispatch(p.t, p.d);
  });

  ws.on('close', code => {
    live.ready = false;
    clearInterval(hb);
    log('closed', code);
    if (code === 4004) { live.lastError = 'Bad bot token'; return; }
    if (code === 4014) {
      live.lastError = 'Privileged intents are off. Turn on Presence and Server Members in the Developer Portal.';
      log(live.lastError);
      return;
    }
    if (code === 4013 || code === 4012) { live.lastError = 'Gateway rejected the intents value'; return; }
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 60000);
  });

  ws.on('error', e => { live.lastError = e.message; log('error', e.message); });
}

/* Pulled straight from the REST API rather than waiting on an event, for the
   refresh button and for anything the socket may have missed. */
async function refresh() {
  if (!D.botConfigured()) return { channels: 0, roles: 0 };
  const [chans, roles] = await Promise.all([
    D.allChannels().catch(() => []),
    D.guildRoles().catch(() => [])
  ]);
  chans.forEach(c => {
    live.channels[c.id] = { id: c.id, name: c.name, type: c.type, parent: c.parent || c.parent_id || null };
  });
  if (roles.length) {
    live.roles = roles;
    require('./perms').seed(roles);
  }
  log('refreshed: ' + chans.length + ' channels, ' + roles.length + ' roles');
  return { channels: chans.length, roles: roles.length };
}

/* ---------- read API for the site ---------- */

function presenceOf(id) {
  return live.presence[id] || { status: 'offline', activity: null };
}

function voiceRooms() {
  const rooms = {};
  Object.keys(live.voice).forEach(uid => {
    const v = live.voice[uid];
    const ch = live.channels[v.channel] || { id: v.channel, name: 'voice' };
    if (!rooms[v.channel]) rooms[v.channel] = { id: v.channel, name: ch.name, people: [] };
    const m = live.members[uid];
    rooms[v.channel].people.push({
      id: uid,
      name: m ? (m.nick || m.global_name || m.username) : 'Someone',
      avatar: m ? m.avatar : null,
      mute: v.mute, deaf: v.deaf, stream: v.stream
    });
  });
  return Object.values(rooms);
}

function roster() {
  return Object.values(live.members)
    .filter(m => !m.bot)
    .map(m => Object.assign({}, m, { presence: presenceOf(m.id) }));
}

/* Counted off the member list rather than off presence, and without bots, so
   the numbers match what a person sees in their own member list. Presence on
   its own includes apps and anyone who has since left. */
function status() {
  const people = Object.values(live.members).filter(m => !m.bot);
  return {
    ready: live.ready,
    since: live.since,
    members: people.length,
    online: people.filter(m => {
      const p = live.presence[m.id];
      return p && p.status && p.status !== 'offline';
    }).length,
    bots: Object.values(live.members).length - people.length,
    roles: live.roles.length,
    error: live.lastError
  };
}

module.exports = {
  connect, live, roster, voiceRooms, presenceOf, status, messages, backfillAll, refresh,
  on, hook, recomputeBotTop, autoPromote, addVoiceAdapter, raw, send, PIN
};
