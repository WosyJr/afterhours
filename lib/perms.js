const S = require('./store');

const PERMS = [
  { k: 'view', n: 'Open the site', d: 'See anything at all. Turn this off and the role is locked out.' },
  { k: 'react', n: 'React to media', d: 'Add reactions to clips and screenshots.' },
  { k: 'post', n: 'Post clips', d: 'Upload to Media, or have their mirrored posts kept.' },
  { k: 'session', n: 'Start a session', d: 'Open a looking-to-play slot on the home page.' },
  { k: 'event', n: 'Create and lock events', d: 'Set a game night and post it to Discord.' },
  { k: 'pin', n: 'Pin to Memories', d: 'Promote a post to the Memories page.' },
  { k: 'images', n: 'Change site images', d: 'Replace the hero, banners and card artwork.' },
  { k: 'members', n: 'Manage members', d: 'Edit profiles, set the mirrored channels.' },
  { k: 'purge', n: 'Delete anyone’s content', d: 'Remove clips, memories and events they did not post.' },
  { k: 'roles', n: 'Manage permissions', d: 'Open the permissions page and change what every role can do.' },
  { k: 'staff', n: 'Staff tools', d: 'Use the bot\u2019s staff commands and open the Staff page here.' }
];

const KEYS = PERMS.map(p => p.k);

const DEFAULTS = {
  high: { view: 1, react: 1, post: 1, session: 1, event: 1, pin: 1, images: 1, members: 1, purge: 1, roles: 1, staff: 1 },
  mid: { view: 1, react: 1, post: 1, session: 1, event: 1, pin: 1, images: 0, members: 0, purge: 0, roles: 0 },
  low: { view: 1, react: 1, post: 1, session: 1, event: 0, pin: 0, images: 0, members: 0, purge: 0, roles: 0 }
};

function matrix() {
  return S.read('perms', {});
}

/* Roles the site pretends do not exist: a bot's own integration role, colour
   roles, ping roles, leftovers. They never become anyone's rank, never appear
   on Ranks, and grant nothing here however they are ordered in Discord. */
function ignored() {
  const v = S.read('config', {}).ignoredRoles;
  return Array.isArray(v) ? v : [];
}

function isIgnored(id) { return ignored().indexOf(id) > -1; }

function visible(roles) {
  const ig = ignored();
  return (roles || []).filter(r => ig.indexOf(r.id) === -1);
}

/* The highest role that is NOT ignored. It keeps every permission and cannot
   have any switched off, so nobody can lock the place up by accident. Stored
   rather than worked out on demand, because resolving permissions must not
   need the live role list. */
function topId() { return S.read('config', {}).topRoleId || null; }

function recompute(roles, ig) {
  const vis = (roles || []).filter(r => ig.indexOf(r.id) === -1)
    .slice().sort((a, b) => b.position - a.position);
  return vis[0] ? vis[0].id : null;
}

function setIgnored(ids, roles) {
  const c = S.read('config', {});
  c.ignoredRoles = Array.from(new Set(ids || []));
  c.topRoleId = recompute(roles, c.ignoredRoles);
  S.write('config', c);
  return c.ignoredRoles;
}

function toggleIgnored(id, roles) {
  const ig = ignored().slice();
  const i = ig.indexOf(id);
  if (i > -1) ig.splice(i, 1); else ig.push(id);
  return setIgnored(ig, roles);
}

function saveMatrix(m) {
  return S.write('perms', m);
}

/* Give any role we have not seen before a sensible starting point based on
   where it sits in the Discord hierarchy. Nothing is granted silently that
   touches other people's content. */
function seed(roles) {
  const c = S.read('config', {});
  const ig = Array.isArray(c.ignoredRoles) ? c.ignoredRoles.slice() : [];

  /* A bot's integration role is managed by Discord, sits wherever Discord puts
     it, and belongs to no person. Left alone it lands at the top and takes
     every permission with it. */
  (roles || []).forEach(r => { if (r.managed && ig.indexOf(r.id) === -1) ig.push(r.id); });

  c.ignoredRoles = ig;
  c.topRoleId = recompute(roles, ig);
  S.write('config', c);

  const m = matrix();
  let changed = false;
  const sorted = (roles || []).filter(r => ig.indexOf(r.id) === -1)
    .slice().sort((a, b) => b.position - a.position);
  sorted.forEach((r, i) => {
    if (m[r.id]) return;
    changed = true;
    m[r.id] = Object.assign({}, i === 0 ? DEFAULTS.high : i < 3 ? DEFAULTS.mid : DEFAULTS.low);
  });
  if (changed) saveMatrix(m);
  return m;
}

function ownerRoleId() {
  return S.read('config', {}).ownerRole || null;
}

/* Union of every role the member holds, exactly how Discord treats its own.
   Ignored roles contribute nothing; the top role contributes everything. */
function forRoles(roleIds) {
  const m = matrix();
  const ig = ignored();
  const top = topId();
  const out = {};
  KEYS.forEach(k => { out[k] = false; });
  (roleIds || []).forEach(id => {
    if (ig.indexOf(id) > -1) return;
    if (top && id === top) { KEYS.forEach(k => { out[k] = true; }); return; }
    const row = m[id];
    if (!row) return;
    KEYS.forEach(k => { if (row[k]) out[k] = true; });
  });
  return out;
}

function forUser(user) {
  if (!user) return forRoles([]);
  if (user.id && user.id === S.read('config', {}).ownerId) {
    const all = {};
    KEYS.forEach(k => { all[k] = true; });
    return all;
  }
  return forRoles(user.roles);
}

function can(user, key) {
  return !!forUser(user)[key];
}

function topRole(user, roles) {
  if (!user || !user.roles || !user.roles.length) return null;
  const ig = ignored();
  const mine = (roles || []).filter(r =>
    user.roles.indexOf(r.id) > -1 && r.name !== '@everyone' && ig.indexOf(r.id) === -1);
  if (!mine.length) return null;
  return mine.slice().sort((a, b) => b.position - a.position)[0];
}

module.exports = {
  PERMS, KEYS, DEFAULTS, matrix, saveMatrix, seed, forRoles, forUser, can, topRole, ownerRoleId,
  ignored, isIgnored, visible, setIgnored, toggleIgnored, topId, recompute
};
