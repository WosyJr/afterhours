const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');

function log() { console.log.apply(console, ['[greet]'].concat([].slice.call(arguments))); }

function state() {
  const st = S.read('greet', null);
  if (st && typeof st === 'object') return st;
  return { greeted: {}, error: '' };
}

function note(err) {
  const st = state();
  st.error = err || '';
  S.write('greet', st);
}

function autoRoleProblem() {
  const cfg = S.read('config', {});
  if (!cfg.autoRole) return '';
  const role = (G.live.roles || []).find(r => r.id === cfg.autoRole);
  if (!role) return 'The role picked for new joiners no longer exists.';
  if (role.managed) return 'That role belongs to an integration, so Discord will not let the bot hand it out.';
  if (G.live.botRoleTop != null && role.position >= G.live.botRoleTop) {
    return 'The bot cannot hand out ' + role.name + ' because its own role sits below it. Drag the bot above that role in Server Settings.';
  }
  return '';
}

async function onJoin(member) {
  const cfg = S.read('config', {});
  const user = member && member.user;
  if (!user || user.bot) return;

  const st = state();
  if (st.greeted[user.id] && Date.now() - st.greeted[user.id] < 12 * 3600000) return;
  st.greeted[user.id] = Date.now();
  const ids = Object.keys(st.greeted);
  if (ids.length > 400) {
    ids.sort((a, b) => st.greeted[a] - st.greeted[b]).slice(0, ids.length - 400)
      .forEach(k => { delete st.greeted[k]; });
  }
  S.write('greet', st);

  if (cfg.autoRole) {
    try {
      await D.addRole(user.id, cfg.autoRole);
    } catch (e) {
      note(e.status === 403
        ? 'Discord refused the joiner role: the bot needs Manage Roles, and its own role must sit above it.'
        : e.message);
      log('autorole', e.message);
    }
  }

  const ch = cfg.welcomeChannel;
  if (!ch || cfg.welcomeOff) return;
  try {
    await D.post(ch, E.welcome(member));
  } catch (e) {
    note(e.message);
    log('welcome', e.message);
  }
}

function start() {
  G.on('join', m => onJoin(m));
}

module.exports = { start, onJoin, state, note, autoRoleProblem };
