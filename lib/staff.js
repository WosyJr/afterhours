const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const P = require('./perms');
const E = require('./embeds');
const Stats = require('./stats');

function log() { console.log.apply(console, ['[staff]'].concat([].slice.call(arguments))); }

const DEFS = [
  { name: 'whois', type: 1, description: 'Everything the site knows about someone',
    options: [{ name: 'person', type: 6, description: 'Who', required: true }] },
  { name: 'warn', type: 1, description: 'Log a warning against someone',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'reason', type: 3, description: 'What for', required: true }
    ] },
  { name: 'note', type: 1, description: 'Add or read staff notes on someone',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'text', type: 3, description: 'Leave empty to just read them back', required: false }
    ] },
  { name: 'role', type: 1, description: 'Give or take a role',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'role', type: 8, description: 'Which role', required: true }
    ] },
  { name: 'say', type: 1, description: 'Post as the bot',
    options: [
      { name: 'message', type: 3, description: 'What to post', required: true },
      { name: 'channel', type: 7, description: 'Where, if not here', required: false }
    ] },
  { name: 'purge', type: 1, description: 'Delete the last few messages in this channel',
    options: [{ name: 'count', type: 4, description: 'How many, up to 100', required: true }] },
  { name: 'slowmode', type: 1, description: 'Set slowmode on this channel',
    options: [{ name: 'seconds', type: 4, description: '0 turns it off', required: true }] },
  { name: 'sync', type: 1, description: 'Re-read roles and channels from Discord' }
];

const NEEDS = {
  whois: 'members', warn: 'members', note: 'members', say: 'members',
  slowmode: 'members', role: 'roles', sync: 'roles', purge: 'purge'
};

function actor(inter) {
  const u = (inter.member && inter.member.user) || inter.user || {};
  const roles = (inter.member && inter.member.roles) || [];
  return { id: u.id, name: u.global_name || u.username || 'Someone', roles: roles };
}

function allowed(inter, name) {
  const key = NEEDS[name];
  if (!key) return false;
  return P.can(actor(inter), key);
}

function opts(inter) {
  const o = {};
  ((inter.data && inter.data.options) || []).forEach(x => { o[x.name] = x.value; });
  return o;
}

function resolvedMember(inter, id) {
  const r = inter.data && inter.data.resolved;
  const m = r && r.members && r.members[id];
  const u = r && r.users && r.users[id];
  return { member: m || null, user: u || null };
}

function nameFor(id, inter) {
  const live = G.live.members[id];
  if (live) return live.nick || live.global_name || live.username;
  const { member, user } = resolvedMember(inter, id);
  if (member && member.nick) return member.nick;
  if (user) return user.global_name || user.username;
  return 'Someone';
}

function logs() { return S.read('stafflog', { warns: {}, notes: {} }); }
function saveLogs(v) { S.write('stafflog', v); }

function warnsFor(id) { return (logs().warns || {})[id] || []; }
function notesFor(id) { return (logs().notes || {})[id] || []; }

function addWarn(id, by, byName, reason) {
  const l = logs();
  l.warns = l.warns || {};
  l.warns[id] = l.warns[id] || [];
  l.warns[id].unshift({ at: Date.now(), by: by, byName: byName, reason: String(reason).slice(0, 400) });
  l.warns[id] = l.warns[id].slice(0, 50);
  saveLogs(l);
  return l.warns[id];
}

function addNote(id, by, byName, text) {
  const l = logs();
  l.notes = l.notes || {};
  l.notes[id] = l.notes[id] || [];
  l.notes[id].unshift({ at: Date.now(), by: by, byName: byName, text: String(text).slice(0, 400) });
  l.notes[id] = l.notes[id].slice(0, 50);
  saveLogs(l);
  return l.notes[id];
}

function profileOf(id, inter) {
  const live = G.live.members[id];
  const users = S.read('users', {});
  const u = users[id];
  const roleIds = (live && live.roles) || (u && u.roles) || [];
  const roles = G.live.roles || [];
  const top = P.topRole({ id: id, roles: roleIds }, roles);
  const perms = P.forUser({ id: id, roles: roleIds });
  const granted = P.KEYS.filter(k => perms[k]).length;
  const st = Stats.forUser(id) || {};
  const msgs = S.read('messages', []);
  const clips = msgs.filter(m => m.author && m.author.id === id).length;
  const w = warnsFor(id);
  const n = notesFor(id);
  const { user } = resolvedMember(inter, id);

  return {
    name: nameFor(id, inter),
    avatar: live ? D.avatarUrl(live) : (user ? D.avatarUrl(user) : null),
    rank: top ? top.name : 'no rank',
    joined: live && live.joined_at ? Date.parse(live.joined_at) : null,
    nights: st.nights || 0,
    voice: Stats.dur ? Stats.dur(st.voiceMin || 0) : String(st.voiceMin || 0),
    clips: clips,
    perms: granted + ' of ' + P.KEYS.length,
    roles: roleIds.map(rid => {
      const r = roles.find(x => x.id === rid);
      return r ? r.name : null;
    }).filter(Boolean).join(', ') || 'none',
    warns: w.length ? w.slice(0, 3).map(x => '• ' + x.reason + ' — ' + x.byName).join('\n') +
      (w.length > 3 ? '\n…and ' + (w.length - 3) + ' more' : '') : null,
    notes: n.length ? n.slice(0, 3).map(x => '• ' + x.text + ' — ' + x.byName).join('\n') +
      (n.length > 3 ? '\n…and ' + (n.length - 3) + ' more' : '') : null
  };
}

async function doWhois(inter) {
  const o = opts(inter);
  await D.interactionReply(inter, E.whois(o.person, profileOf(o.person, inter)), true);
}

async function doWarn(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const list = addWarn(o.person, me.id, me.name, o.reason);
  await D.interactionReply(inter, E.plain('Warning logged',
    ['**' + nameFor(o.person, inter) + '** — ' + o.reason,
      'That is warning ' + list.length + '. It shows on their profile on the site.'], E.C.staff), true);
}

async function doNote(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const who = nameFor(o.person, inter);
  if (o.text) {
    const list = addNote(o.person, me.id, me.name, o.text);
    return D.interactionReply(inter, E.plain('Note added',
      ['**' + who + '** now has ' + list.length + ' note' + (list.length === 1 ? '' : 's') + '.'], E.C.staff), true);
  }
  const list = notesFor(o.person);
  if (!list.length) return D.interactionReply(inter, E.plain('No notes', ['Nothing written down about **' + who + '**.'], E.C.staff), true);
  await D.interactionReply(inter, E.plain('Notes on ' + who,
    list.slice(0, 10).map(x => '• ' + x.text + ' — ' + x.byName + ', ' + E.rel(x.at)), E.C.staff), true);
}

async function doRole(inter) {
  const o = opts(inter);
  const roles = G.live.roles || [];
  const role = roles.find(r => r.id === o.role);
  if (!role) return D.interactionReply(inter, 'That role is not one I can see.', true);
  if (role.managed) return D.interactionReply(inter, 'That role belongs to an integration, so Discord will not let me hand it out.', true);
  if (G.live.botRoleTop != null && role.position >= G.live.botRoleTop) {
    return D.interactionReply(inter,
      'I cannot touch **' + role.name + '** — my own role sits below it. Drag Afterhours above it in Server Settings → Roles.', true);
  }
  const live = G.live.members[o.person];
  const has = live && (live.roles || []).indexOf(o.role) > -1;
  try {
    if (has) await D.removeRole(o.person, o.role);
    else await D.addRole(o.person, o.role);
  } catch (e) {
    return D.interactionReply(inter, 'Discord refused that: ' + e.message, true);
  }
  await D.interactionReply(inter, E.plain(has ? 'Role taken' : 'Role given',
    [(has ? 'Took ' : 'Gave ') + '**' + role.name + '** ' + (has ? 'from' : 'to') + ' **' + nameFor(o.person, inter) + '**.'],
    E.C.staff), true);
}

async function doSay(inter) {
  const o = opts(inter);
  const ch = o.channel || inter.channel_id;
  try {
    await D.post(ch, { content: String(o.message).slice(0, 1800), allowed_mentions: { parse: [] } });
  } catch (e) {
    return D.interactionReply(inter, 'Could not post there: ' + e.message, true);
  }
  await D.interactionReply(inter, 'Posted.', true);
}

async function doPurge(inter) {
  const o = opts(inter);
  const n = Math.max(1, Math.min(100, Number(o.count) || 0));
  try {
    const msgs = await D.channelMessages(inter.channel_id, n);
    const cutoff = Date.now() - 13 * 24 * 3600000;
    const ids = msgs.filter(m => Date.parse(m.timestamp) > cutoff).map(m => m.id);
    if (!ids.length) return D.interactionReply(inter, 'Nothing recent enough to delete — Discord will not bulk-delete anything over two weeks old.', true);
    await D.deleteMessages(inter.channel_id, ids);
    await D.interactionReply(inter, E.plain('Cleared',
      [ids.length + ' message' + (ids.length === 1 ? '' : 's') + ' deleted.' +
        (ids.length < n ? ' The rest were over two weeks old, which Discord will not bulk-delete.' : '')], E.C.staff), true);
  } catch (e) {
    await D.interactionReply(inter, 'That did not work: ' + e.message, true);
  }
}

async function doSlowmode(inter) {
  const o = opts(inter);
  const n = Math.max(0, Math.min(21600, Number(o.seconds) || 0));
  try {
    await D.setSlowmode(inter.channel_id, n);
  } catch (e) {
    return D.interactionReply(inter, 'Could not set that: ' + e.message, true);
  }
  await D.interactionReply(inter, n
    ? 'Slowmode is now ' + n + ' second' + (n === 1 ? '' : 's') + ' here.'
    : 'Slowmode is off here.', true);
}

async function doSync(inter) {
  try {
    const r = await G.refresh();
    await D.interactionReply(inter, E.plain('Re-read from Discord',
      ['Channels: ' + (r && r.channels != null ? r.channels : '?'),
        'Roles: ' + (r && r.roles != null ? r.roles : '?')], E.C.staff), true);
  } catch (e) {
    await D.interactionReply(inter, 'Could not re-read: ' + e.message, true);
  }
}

const RUN = {
  whois: doWhois, warn: doWarn, note: doNote, role: doRole,
  say: doSay, purge: doPurge, slowmode: doSlowmode, sync: doSync
};

function handles(name) { return !!RUN[name]; }

async function handle(inter, name) {
  if (!allowed(inter, name)) {
    await D.interactionReply(inter,
      'That one is staff only. Your rank does not have it on the site.', true).catch(() => {});
    return true;
  }
  try {
    await RUN[name](inter);
  } catch (e) {
    log(name, e.message);
    await D.interactionReply(inter, 'That did not work: ' + e.message, true).catch(() => {});
  }
  return true;
}

module.exports = { DEFS, NEEDS, handles, handle, allowed, profileOf, warnsFor, notesFor, addWarn, addNote, logs };
