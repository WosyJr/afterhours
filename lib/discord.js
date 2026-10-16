const API = 'https://discord.com/api/v10';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

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
  identify, guildMember, guildRoles, guildChannels, channelMessages, post, react,
  avatarUrl, bannerUrl, accent
};
