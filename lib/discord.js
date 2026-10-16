const API = 'https://discord.com/api/v10';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';
const Site = require('./site');

const SITE_URL = Site.siteUrl();
const REDIRECT = SITE_URL + '/auth/callback';
const SCOPES = ['identify', 'guilds.members.read'];

function configured() {
  return !!(CLIENT_ID && CLIENT_SECRET && GUILD_ID);
}

function botConfigured() {
  return !!(BOT_TOKEN && GUILD_ID);
}

function authUrl(state) {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state: state,
    prompt: 'none'
  });
  return 'https://discord.com/oauth2/authorize?' + q.toString();
}

async function call(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error('Discord ' + res.status + ' on ' + url + ' ' + body.slice(0, 200));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function exchange(code) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT
  });
  return call(API + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  });
}

function bearer(token) {
  return { headers: { Authorization: 'Bearer ' + token } };
}

function bot() {
  return { headers: { Authorization: 'Bot ' + BOT_TOKEN } };
}

async function identify(token) {
  return call(API + '/users/@me', bearer(token));
}

/* Their member record in our guild: roles, nickname, joined_at.
   A 404 here means they are simply not in the server. */
async function guildMember(token) {
  try {
    return await call(API + '/users/@me/guilds/' + GUILD_ID + '/member', bearer(token));
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function guildRoles() {
  if (!botConfigured()) return [];
  const roles = await call(API + '/guilds/' + GUILD_ID + '/roles', bot());
  return roles
    .filter(r => r.name !== '@everyone')
    .map(r => ({
      id: r.id,
      name: r.name,
      position: r.position,
      colour: r.color ? '#' + r.color.toString(16).padStart(6, '0') : '#99A0BB',
      managed: !!r.managed
    }))
    .sort((a, b) => b.position - a.position);
}

async function guildChannels() {
  if (!botConfigured()) return [];
  const chans = await call(API + '/guilds/' + GUILD_ID + '/channels', bot());
  return chans
    .filter(c => c.type === 0)
    .map(c => ({ id: c.id, name: c.name, position: c.position }))
    .sort((a, b) => a.position - b.position);
}

/* Every channel, not only the text ones, because voice channels are named
   from this list too. */
async function allChannels() {
  if (!botConfigured()) return [];
  const chans = await call(API + '/guilds/' + GUILD_ID + '/channels', bot());
  return chans.map(c => ({
    id: c.id, name: c.name, type: c.type, position: c.position, parent: c.parent_id || null
  }));
}

async function channelMessages(channelId, limit) {
  if (!botConfigured()) return [];
  return call(API + '/channels/' + channelId + '/messages?limit=' + (limit || 50), bot());
}

async function post(channelId, payload) {
  if (!botConfigured()) return null;
  return call(API + '/channels/' + channelId + '/messages', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify(payload)
  });
}

/* The bot's own reaction, which is what the site adds when someone pins from
   here. It shows up in Discord exactly as if it had been clicked there. */
async function react(channelId, messageId, emoji, remove) {
  if (!botConfigured()) return null;
  const url = API + '/channels/' + channelId + '/messages/' + messageId +
    '/reactions/' + encodeURIComponent(emoji) + '/@me';
  const res = await fetch(url, { method: remove ? 'DELETE' : 'PUT', headers: bot().headers });
  if (!res.ok && res.status !== 204) throw new Error('Discord ' + res.status + ' on reaction');
  return true;
}

async function interactionReply(inter, data, ephemeral) {
  const body = typeof data === 'string' ? { content: data } : Object.assign({}, data);
  if (ephemeral) body.flags = 64;
  const res = await fetch(API + '/interactions/' + inter.id + '/' + inter.token + '/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 4, data: body })
  });
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    throw new Error('Discord ' + res.status + ' answering an interaction ' + t.slice(0, 160));
  }
  return true;
}

async function interactionDefer(inter, ephemeral) {
  await fetch(API + '/interactions/' + inter.id + '/' + inter.token + '/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5, data: { flags: ephemeral ? 64 : 0 } })
  }).catch(() => {});
}

async function interactionFollow(inter, data) {
  const id = process.env.DISCORD_CLIENT_ID || '';
  const body = typeof data === 'string' ? { content: data } : data;
  await fetch(API + '/webhooks/' + id + '/' + inter.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => {});
}

async function editMessage(channelId, messageId, payload) {
  if (!botConfigured()) return null;
  return call(API + '/channels/' + channelId + '/messages/' + messageId, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify(payload)
  });
}

async function getMessage(channelId, messageId) {
  if (!botConfigured()) return null;
  try {
    return await call(API + '/channels/' + channelId + '/messages/' + messageId, bot());
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function deleteMessages(channelId, ids) {
  if (!botConfigured() || !ids.length) return null;
  if (ids.length === 1) {
    const res = await fetch(API + '/channels/' + channelId + '/messages/' + ids[0],
      { method: 'DELETE', headers: bot().headers });
    if (!res.ok && res.status !== 204) throw new Error('Discord ' + res.status + ' deleting a message');
    return true;
  }
  const res = await fetch(API + '/channels/' + channelId + '/messages/bulk-delete', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify({ messages: ids.slice(0, 100) })
  });
  if (!res.ok && res.status !== 204) throw new Error('Discord ' + res.status + ' on bulk delete');
  return true;
}

async function addRole(userId, roleId) {
  if (!botConfigured()) return null;
  const res = await fetch(API + '/guilds/' + GUILD_ID + '/members/' + userId + '/roles/' + roleId,
    { method: 'PUT', headers: bot().headers });
  if (!res.ok && res.status !== 204) {
    const e = new Error('Discord ' + res.status + ' adding a role');
    e.status = res.status;
    throw e;
  }
  return true;
}

async function removeRole(userId, roleId) {
  if (!botConfigured()) return null;
  const res = await fetch(API + '/guilds/' + GUILD_ID + '/members/' + userId + '/roles/' + roleId,
    { method: 'DELETE', headers: bot().headers });
  if (!res.ok && res.status !== 204) {
    const e = new Error('Discord ' + res.status + ' removing a role');
    e.status = res.status;
    throw e;
  }
  return true;
}

async function addReaction(channelId, messageId, emoji) {
  if (!botConfigured()) return null;
  const res = await fetch(API + '/channels/' + channelId + '/messages/' + messageId +
    '/reactions/' + encodeURIComponent(emoji) + '/@me', { method: 'PUT', headers: bot().headers });
  if (!res.ok && res.status !== 204) {
    const e = new Error('Discord ' + res.status + ' adding a reaction');
    e.status = res.status;
    throw e;
  }
  return true;
}

async function editChannel(channelId, patch) {
  if (!botConfigured()) return null;
  return call(API + '/channels/' + channelId, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify(patch)
  });
}

async function createChannel(payload) {
  if (!botConfigured()) return null;
  return call(API + '/guilds/' + GUILD_ID + '/channels', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify(payload)
  });
}

async function deleteChannel(channelId) {
  if (!botConfigured()) return null;
  const res = await fetch(API + '/channels/' + channelId, { method: 'DELETE', headers: bot().headers });
  if (!res.ok && res.status !== 204) {
    const e = new Error('Discord ' + res.status + ' deleting a channel');
    e.status = res.status;
    throw e;
  }
  return true;
}

async function moveMember(userId, channelId) {
  if (!botConfigured()) return null;
  return call(API + '/guilds/' + GUILD_ID + '/members/' + userId, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify({ channel_id: channelId })
  });
}

async function timeout(userId, untilIso) {
  if (!botConfigured()) return null;
  return call(API + '/guilds/' + GUILD_ID + '/members/' + userId, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify({ communication_disabled_until: untilIso })
  });
}

async function kick(userId, reason) {
  if (!botConfigured()) return null;
  const res = await fetch(API + '/guilds/' + GUILD_ID + '/members/' + userId, {
    method: 'DELETE',
    headers: Object.assign({ 'X-Audit-Log-Reason': encodeURIComponent(String(reason || '').slice(0, 300)) }, bot().headers)
  });
  if (!res.ok && res.status !== 204) {
    const e = new Error('Discord ' + res.status + ' kicking');
    e.status = res.status;
    throw e;
  }
  return true;
}

async function ban(userId, reason, deleteSeconds) {
  if (!botConfigured()) return null;
  const res = await fetch(API + '/guilds/' + GUILD_ID + '/bans/' + userId, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json',
      'X-Audit-Log-Reason': encodeURIComponent(String(reason || '').slice(0, 300)) }, bot().headers),
    body: JSON.stringify({ delete_message_seconds: Math.max(0, Math.min(604800, deleteSeconds || 0)) })
  });
  if (!res.ok && res.status !== 204) {
    const e = new Error('Discord ' + res.status + ' banning');
    e.status = res.status;
    throw e;
  }
  return true;
}

async function unban(userId) {
  if (!botConfigured()) return null;
  const res = await fetch(API + '/guilds/' + GUILD_ID + '/bans/' + userId,
    { method: 'DELETE', headers: bot().headers });
  if (!res.ok && res.status !== 204) {
    const e = new Error('Discord ' + res.status + ' unbanning');
    e.status = res.status;
    throw e;
  }
  return true;
}

async function setSlowmode(channelId, seconds) {
  if (!botConfigured()) return null;
  return call(API + '/channels/' + channelId, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json' }, bot().headers),
    body: JSON.stringify({ rate_limit_per_user: Math.max(0, Math.min(21600, seconds)) })
  });
}

async function botMember() {
  if (!botConfigured()) return null;
  try {
    const me = await call(API + '/users/@me', bot());
    return await call(API + '/guilds/' + GUILD_ID + '/members/' + me.id, bot());
  } catch (e) {
    return null;
  }
}

function avatarUrl(u) {
  if (!u) return null;
  if (u.avatar) {
    const ext = u.avatar.startsWith('a_') ? 'gif' : 'png';
    return 'https://cdn.discordapp.com/avatars/' + u.id + '/' + u.avatar + '.' + ext + '?size=128';
  }
  let i = 0;
  try {
    i = u.discriminator && u.discriminator !== '0'
      ? Number(u.discriminator) % 5
      : Number((BigInt(u.id) >> 22n) % 6n);
  } catch (e) {
    i = 0;
  }
  return 'https://cdn.discordapp.com/embed/avatars/' + i + '.png';
}

function bannerUrl(u) {
  if (!u || !u.banner) return null;
  const ext = u.banner.startsWith('a_') ? 'gif' : 'png';
  return 'https://cdn.discordapp.com/banners/' + u.id + '/' + u.banner + '.' + ext + '?size=600';
}

function accent(u) {
  if (!u) return null;
  if (typeof u.accent_color === 'number') return '#' + u.accent_color.toString(16).padStart(6, '0');
  return null;
}

module.exports = {
  API, GUILD_ID, SITE_URL, SCOPES, configured, botConfigured, authUrl, exchange,
  identify, guildMember, guildRoles, guildChannels, allChannels, channelMessages, post, react,
  editMessage, getMessage, deleteMessages, addRole, removeRole, addReaction, setSlowmode, botMember,
  timeout, kick, ban, unban, editChannel, createChannel, deleteChannel, moveMember,
  interactionReply, interactionDefer, interactionFollow,
  avatarUrl, bannerUrl, accent
};
