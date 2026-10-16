const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');

const KEY = 'reactroles';

function log() { console.log.apply(console, ['[reactroles]'].concat([].slice.call(arguments))); }

function read() {
  const r = S.read(KEY, null);
  if (r && Array.isArray(r.pairs)) return r;
  return { pairs: [], channel: '', message: '', title: '', blurb: '', at: 0, error: '' };
}

function write(v) { S.write(KEY, v); return v; }

function emojiKey(e) {
  if (!e) return '';
  if (typeof e === 'string') return norm(e).key;
  if (e.id) return e.name + ':' + e.id;
  return (e.name || '').trim();
}

function norm(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^<(a?):([A-Za-z0-9_]+):(\d+)>$/);
  if (m) return { key: m[2] + ':' + m[3], display: s, custom: true, animated: m[1] === 'a' };
  const bare = s.match(/^(a?):?([A-Za-z0-9_]+):(\d+)$/);
  if (bare) {
    const d = '<' + (bare[1] ? 'a' : '') + ':' + bare[2] + ':' + bare[3] + '>';
    return { key: bare[2] + ':' + bare[3], display: d, custom: true, animated: !!bare[1] };
  }
  return { key: s, display: s, custom: false, animated: false };
}

function parse(text) {
  const out = [];
  const seenEmoji = {};
  const seenRole = {};
  String(text || '').split('\n').forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split('|').map(x => x.trim());
    if (parts.length < 2) return;
    const em = norm(parts[0]);
    const emoji = em.key;
    const roleRef = parts[1];
    const note = parts.slice(2).join(' | ').slice(0, 90);
    if (!emoji || !roleRef) return;
    const roles = G.live.roles || [];
    let role = roles.find(r => r.id === roleRef);
    if (!role) {
      const want = roleRef.replace(/^@/, '').toLowerCase();
      role = roles.find(r => r.name.toLowerCase() === want);
    }
    if (!role) return;
    if (seenEmoji[emoji] || seenRole[role.id]) return;
    seenEmoji[emoji] = 1;
    seenRole[role.id] = 1;
    out.push({ emoji: emoji, show: em.display, role: role.id, note: note });
  });
  return out.slice(0, 20);
}

function asText() {
  const st = read();
  const roles = G.live.roles || [];
  return (st.pairs || []).map(p => {
    const r = roles.find(x => x.id === p.role);
    return [p.show || p.emoji, r ? '@' + r.name : p.role, p.note].filter(Boolean).join(' | ');
  }).join('\n');
}

function unknownIn(text) {
  const roles = G.live.roles || [];
  const bad = [];
  String(text || '').split('\n').forEach(line => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split('|').map(x => x.trim());
    if (parts.length < 2) { bad.push(raw.slice(0, 40)); return; }
    const ref = parts[1];
    const want = ref.replace(/^@/, '').toLowerCase();
    if (!roles.some(r => r.id === ref || r.name.toLowerCase() === want)) bad.push(ref.slice(0, 40));
  });
  return bad;
}

function belowBot() {
  const roles = G.live.roles || [];
  const bot = G.live.botRoleTop;
  if (bot == null) return [];
  return (read().pairs || []).map(p => roles.find(r => r.id === p.role))
    .filter(r => r && r.position >= bot)
    .map(r => r.name);
}

async function publish() {
  const st = read();
  if (!st.channel) { st.error = 'No channel picked.'; return write(st); }
  if (!D.botConfigured()) { st.error = 'The bot is not connected.'; return write(st); }

  const body = E.rolePost();
  try {
    let msg = null;
    if (st.message) msg = await D.getMessage(st.channel, st.message).catch(() => null);
    if (msg) {
      await D.editMessage(st.channel, st.message, body);
    } else {
      const made = await D.post(st.channel, body);
      st.message = made && made.id ? made.id : '';
    }
    st.error = '';
    st.at = Date.now();
    write(st);
    await syncReactions();
  } catch (e) {
    st.error = e.message;
    write(st);
    log('publish', e.message);
  }
  return read();
}

async function syncReactions() {
  const st = read();
  if (!st.channel || !st.message) return [];
  const bad = [];
  for (const p of st.pairs) {
    try {
      await D.addReaction(st.channel, st.message, p.emoji);
    } catch (e) {
      bad.push((p.show || p.emoji) + (e.status === 400 ? ' (Discord does not know that emoji)' : ''));
    }
  }
  if (bad.length) {
    const cur = read();
    cur.error = 'Could not react with ' + bad.join(', ') +
      '. A custom emoji has to be from this server, and the bot needs Add Reactions here.';
    write(cur);
  }
  return bad;
}

async function setPairs(text, channel, title, blurb) {
  const st = read();
  const before = st.message;
  st.pairs = parse(text);
  st.title = String(title || '').slice(0, 120);
  st.blurb = String(blurb || '').slice(0, 900);
  if (channel && channel !== st.channel) { st.channel = channel; st.message = ''; }
  if (!channel) st.channel = '';
  write(st);
  if (st.channel) await publish();
  else if (before) write(Object.assign(read(), { message: '' }));
  return read();
}

function pairFor(emoji) {
  const key = emojiKey(emoji);
  if (!key) return null;
  const st = read();
  const pairs = st.pairs || [];
  let hit = pairs.find(p => p.emoji === key);
  if (hit) return hit;
  hit = pairs.find(p => norm(p.emoji).key === key || norm(p.show || '').key === key);
  if (hit) return hit;
  const id = key.indexOf(':') > -1 ? key.split(':')[1] : '';
  if (id) hit = pairs.find(p => String(p.emoji).split(':')[1] === id);
  return hit || null;
}

function watches(d) {
  const st = read();
  return !!(st.message && d && d.message_id === st.message);
}

async function onReaction(d, up) {
  if (!watches(d)) return false;
  if (!d.user_id) return false;
  const me = G.live.botId;
  if (me && d.user_id === me) return false;
  const pair = pairFor(d.emoji);
  if (!pair) return false;
  try {
    if (up) await D.addRole(d.user_id, pair.role);
    else await D.removeRole(d.user_id, pair.role);
    return true;
  } catch (e) {
    const st = read();
    st.error = e.status === 403
      ? 'Discord refused: the bot needs Manage Roles, and its own role must sit above the roles it hands out.'
      : e.message;
    write(st);
    log('role change failed', e.message);
    return false;
  }
}

module.exports = {
  read, write, parse, asText, unknownIn, belowBot, publish, syncReactions,
  setPairs, pairFor, watches, onReaction, norm, emojiKey
};
