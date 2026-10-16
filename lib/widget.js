const S = require('./store');


const GUILD = process.env.DISCORD_GUILD_ID || '';
const TTL = Number(process.env.WIDGET_TTL_MS || 10 * 60000);

const state = { at: 0, data: null, error: null, enabled: null };

function log() { console.log.apply(console, ['[widget]'].concat([].slice.call(arguments))); }

async function fetchWidget() {
  if (!GUILD) return null;
  const url = 'https://discord.com/api/guilds/' + GUILD + '/widget.json';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 403) {
    state.enabled = false;
    state.error = 'The server widget is switched off in Discord.';
    return null;
  }
  if (!res.ok) {
    state.error = 'Discord answered ' + res.status;
    return null;
  }
  state.enabled = true;
  state.error = null;
  return res.json();
}

async function refresh() {
  if (Date.now() - state.at < TTL && state.data) return state.data;
  state.at = Date.now();
  try {
    state.data = await fetchWidget();
  } catch (e) {
    state.error = e.message;
    state.data = null;
  }
  return state.data;
}


function invite() {
  const set = (S.read('config', {}).invite || '').trim();
  if (set) return { url: set, from: 'settings' };
  const auto = state.data && state.data.instant_invite;
  return auto ? { url: auto, from: 'widget' } : null;
}

function status() {
  return {
    guild: GUILD,
    enabled: state.enabled,
    error: state.error,
    checkedAt: state.at,
    name: state.data && state.data.name,
    online: state.data ? (state.data.presence_count || 0) : null,
    invite: state.data && state.data.instant_invite ? state.data.instant_invite : null
  };
}

let timer = null;
function start() {
  if (timer || !GUILD) return;
  refresh().catch(() => {});
  timer = setInterval(() => refresh().catch(() => {}), TTL);
  if (timer.unref) timer.unref();
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { refresh, invite, status, start, stop, state };
