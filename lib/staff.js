const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const P = require('./perms');
const E = require('./embeds');
const Stats = require('./stats');
const ML = require('./modlog');

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
  { name: 'sync', type: 1, description: 'Re-read roles and channels from Discord' },
  { name: 'unwarn', type: 1, description: 'Take a warning back off someone',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'which', type: 4, description: 'Which one, newest is 1. Leave empty to clear them all', required: false }
    ] },
  { name: 'delnote', type: 1, description: 'Remove a staff note',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'which', type: 4, description: 'Which one, newest is 1. Leave empty to clear them all', required: false }
    ] },
  { name: 'timeout', type: 1, description: 'Stop someone talking for a while',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'minutes', type: 4, description: 'How long, 0 lifts it', required: true },
      { name: 'reason', type: 3, description: 'What for', required: false }
    ] },
  { name: 'kick', type: 1, description: 'Remove someone from the server',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'reason', type: 3, description: 'What for', required: false }
    ] },
  { name: 'ban', type: 1, description: 'Ban someone from the server',
    options: [
      { name: 'person', type: 6, description: 'Who', required: true },
      { name: 'reason', type: 3, description: 'What for', required: false },
      { name: 'purge_days', type: 4, description: 'Also delete their last N days of messages', required: false }
    ] },
  { name: 'unban', type: 1, description: 'Lift a ban',
    options: [{ name: 'userid', type: 3, description: 'Their user ID', required: true }] },
  { name: 'lookup', type: 1, description: 'The last few staff actions, for everyone or one person',
    options: [{ name: 'person', type: 6, description: 'Narrow it to one person', required: false }] },
  { name: 'modlog', type: 1, description: 'Where staff actions are being logged' }
];

const NEEDS = {
  whois: null, warn: null, note: null, say: null, slowmode: null, lookup: null, modlog: null,
  unwarn: null, delnote: null, timeout: null,
  role: 'roles', sync: 'roles', purge: 'purge', kick: 'purge', ban: 'purge', unban: 'purge'
};

function me0(inter) { return actor(inter); }

function actor(inter) {
  const u = (inter.member && inter.member.user) || inter.user || {};
  const roles = (inter.member && inter.member.roles) || [];
  return { id: u.id, name: u.global_name || u.username || 'Someone', roles: roles };
}

function allowed(inter, name) {
  if (!(name in NEEDS)) return false;
  const me = actor(inter);
  if (!P.can(me, 'staff')) return false;
  const extra = NEEDS[name];
  return extra ? P.can(me, extra) : true;
}

function why(inter, name) {
  const me = actor(inter);
  if (!P.can(me, 'staff')) {
    return 'That one is staff only. Turn on **Staff tools** for your rank on the site, under Settings \u2192 Permissions.';
  }
  const extra = NEEDS[name];
  const label = (P.PERMS.find(x => x.k === extra) || {}).n || extra;
  return 'You have staff tools, but **/' + name + '** also needs **' + label + '**, which your rank does not have.';
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

function removeWarn(id, which) {
  const l = logs();
  l.warns = l.warns || {};
  const list = l.warns[id] || [];
  if (!list.length) return { gone: 0, left: 0 };
  let gone;
  if (which == null) { gone = list.length; l.warns[id] = []; }
  else {
    const i = Number(which) - 1;
    if (i < 0 || i >= list.length) return { gone: 0, left: list.length, bad: true };
    gone = 1;
    l.warns[id] = list.slice(0, i).concat(list.slice(i + 1));
  }
  if (!l.warns[id].length) delete l.warns[id];
  saveLogs(l);
  return { gone: gone, left: (l.warns[id] || []).length };
}

function removeNote(id, which) {
  const l = logs();
  l.notes = l.notes || {};
  const list = l.notes[id] || [];
  if (!list.length) return { gone: 0, left: 0 };
  let gone;
  if (which == null) { gone = list.length; l.notes[id] = []; }
  else {
    const i = Number(which) - 1;
    if (i < 0 || i >= list.length) return { gone: 0, left: list.length, bad: true };
    gone = 1;
    l.notes[id] = list.slice(0, i).concat(list.slice(i + 1));
  }
  if (!l.notes[id].length) delete l.notes[id];
  saveLogs(l);
  return { gone: gone, left: (l.notes[id] || []).length };
}

function everyone() {
  const l = logs();
  const ids = {};
  Object.keys(l.warns || {}).forEach(k => { ids[k] = 1; });
  Object.keys(l.notes || {}).forEach(k => { ids[k] = 1; });
  return Object.keys(ids).map(id => ({
    id: id,
    warns: (l.warns || {})[id] || [],
    notes: (l.notes || {})[id] || []
  })).sort((a, b) => {
    const at = Math.max((a.warns[0] || {}).at || 0, (a.notes[0] || {}).at || 0);
    const bt = Math.max((b.warns[0] || {}).at || 0, (b.notes[0] || {}).at || 0);
    return bt - at;
  });
}

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
  ML.record('warn', { who: o.person, whoName: nameFor(o.person, inter), by: me.id, byName: me.name,
    detail: o.reason + ' · warning ' + list.length });
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
    ML.record('note', { who: o.person, whoName: who, by: me.id, byName: me.name, detail: o.text });
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
  ML.record('role', { who: o.person, whoName: nameFor(o.person, inter), by: me0(inter).id, byName: me0(inter).name,
    detail: (has ? 'Took ' : 'Gave ') + role.name });
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
  ML.record('say', { by: me0(inter).id, byName: me0(inter).name, where: ch,
    detail: String(o.message).slice(0, 200) });
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
    ML.record('purge', { by: me0(inter).id, byName: me0(inter).name, where: inter.channel_id,
      detail: ids.length + ' messages' });
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
  ML.record('slowmode', { by: me0(inter).id, byName: me0(inter).name, where: inter.channel_id,
    detail: n ? n + ' seconds' : 'off' });
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

async function doUnwarn(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const who = nameFor(o.person, inter);
  const r = removeWarn(o.person, o.which == null ? null : o.which);
  if (r.bad) return D.interactionReply(inter, 'There is no warning number ' + o.which + ' on **' + who + '**.', true);
  if (!r.gone) return D.interactionReply(inter, '**' + who + '** has no warnings to take off.', true);
  ML.record('unwarn', { who: o.person, whoName: who, by: me.id, byName: me.name,
    detail: r.gone === 1 ? 'Removed warning ' + o.which : 'Cleared all ' + r.gone + ' warnings' });
  await D.interactionReply(inter, E.plain('Warning removed',
    [r.gone === 1 ? 'Took one warning off **' + who + '**. ' + r.left + ' left.'
      : 'Cleared all ' + r.gone + ' warnings on **' + who + '**.'], E.C.staff), true);
}

async function doDelnote(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const who = nameFor(o.person, inter);
  const r = removeNote(o.person, o.which == null ? null : o.which);
  if (r.bad) return D.interactionReply(inter, 'There is no note number ' + o.which + ' on **' + who + '**.', true);
  if (!r.gone) return D.interactionReply(inter, 'There are no notes on **' + who + '**.', true);
  ML.record('unnote', { who: o.person, whoName: who, by: me.id, byName: me.name,
    detail: r.gone === 1 ? 'Removed note ' + o.which : 'Cleared all ' + r.gone + ' notes' });
  await D.interactionReply(inter, E.plain('Note removed',
    [r.gone === 1 ? 'Took one note off **' + who + '**. ' + r.left + ' left.'
      : 'Cleared all ' + r.gone + ' notes on **' + who + '**.'], E.C.staff), true);
}

async function doTimeout(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const who = nameFor(o.person, inter);
  const mins = Math.max(0, Math.min(40320, Number(o.minutes) || 0));
  const until = mins ? new Date(Date.now() + mins * 60000).toISOString() : null;
  try {
    await D.timeout(o.person, until);
  } catch (e) {
    return D.interactionReply(inter, e.status === 403
      ? 'Discord refused. The bot needs **Timeout Members**, and its own role must sit above theirs.'
      : 'That did not work: ' + e.message, true);
  }
  ML.record(mins ? 'timeout' : 'untimeout', { who: o.person, whoName: who, by: me.id, byName: me.name,
    detail: mins ? mins + ' minutes' + (o.reason ? ' — ' + o.reason : '') : 'Lifted' });
  await D.interactionReply(inter, E.plain(mins ? 'Timed out' : 'Timeout lifted',
    [mins ? '**' + who + '** cannot talk for ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.'
      : '**' + who + '** can talk again.'], E.C.staff), true);
}

async function doKick(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const who = nameFor(o.person, inter);
  try {
    await D.kick(o.person, (o.reason || 'No reason given') + ' — ' + me.name);
  } catch (e) {
    return D.interactionReply(inter, e.status === 403
      ? 'Discord refused. The bot needs **Kick Members**, and its own role must sit above theirs.'
      : 'That did not work: ' + e.message, true);
  }
  ML.record('kick', { who: o.person, whoName: who, by: me.id, byName: me.name, detail: o.reason || 'No reason given' });
  await D.interactionReply(inter, E.plain('Kicked', ['**' + who + '** has been removed from the server.'], E.C.staff), true);
}

async function doBan(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const who = nameFor(o.person, inter);
  const days = Math.max(0, Math.min(7, Number(o.purge_days) || 0));
  try {
    await D.ban(o.person, (o.reason || 'No reason given') + ' — ' + me.name, days * 86400);
  } catch (e) {
    return D.interactionReply(inter, e.status === 403
      ? 'Discord refused. The bot needs **Ban Members**, and its own role must sit above theirs.'
      : 'That did not work: ' + e.message, true);
  }
  ML.record('ban', { who: o.person, whoName: who, by: me.id, byName: me.name,
    detail: (o.reason || 'No reason given') + (days ? ' · cleared ' + days + ' day(s) of messages' : '') });
  await D.interactionReply(inter, E.plain('Banned', ['**' + who + '** is banned.'], E.C.staff), true);
}

async function doUnban(inter) {
  const o = opts(inter);
  const me = actor(inter);
  const id = String(o.userid || '').replace(/\D/g, '');
  if (!/^\d{15,25}$/.test(id)) return D.interactionReply(inter, 'That does not look like a user ID.', true);
  try {
    await D.unban(id);
  } catch (e) {
    return D.interactionReply(inter, e.status === 404
      ? 'There is no ban on that ID.'
      : 'That did not work: ' + e.message, true);
  }
  ML.record('unban', { who: id, whoName: nameFor(id, inter), by: me.id, byName: me.name });
  await D.interactionReply(inter, E.plain('Unbanned', ['That ID can join again.'], E.C.staff), true);
}

async function doLookup(inter) {
  const o = opts(inter);
  const rows = o.person ? ML.forUser(o.person) : ML.recent(12);
  if (!rows.length) {
    return D.interactionReply(inter, o.person
      ? 'Nothing logged against **' + nameFor(o.person, inter) + '**.'
      : 'Nothing has been logged yet.', true);
  }
  const lines = rows.slice(0, 12).map(x => {
    const k = ML.KINDS[x.kind] || { word: x.kind, icon: '\u2022' };
    const who = x.whoName || (x.who ? nameFor(x.who, inter) : '');
    return k.icon + '  **' + k.word + '**' + (who ? ' — ' + who : '') +
      (x.byName ? ' · by ' + x.byName : '') + ' · ' + E.rel(x.at) +
      (x.detail ? '\n\u2002\u2002' + String(x.detail).slice(0, 120) : '');
  });
  await D.interactionReply(inter, E.plain(o.person ? 'On ' + nameFor(o.person, inter) : 'Last staff actions',
    lines, E.C.staff), true);
}

async function doModlog(inter) {
  const ch = ML.channel();
  const url = E.site();
  await D.interactionReply(inter, E.plain('Staff log',
    [ch ? 'Everything staff do is posted in <#' + ch + '>.' : 'No log channel is set. Pick one in Settings \u2192 Discord.',
      ML.all().length + ' action' + (ML.all().length === 1 ? '' : 's') + ' recorded.',
      url ? 'The full list is at ' + url + '/crew/staff' : ''].filter(Boolean), E.C.staff), true);
}

const RUN = {
  whois: doWhois, warn: doWarn, note: doNote, role: doRole,
  say: doSay, purge: doPurge, slowmode: doSlowmode, sync: doSync,
  unwarn: doUnwarn, delnote: doDelnote, timeout: doTimeout,
  kick: doKick, ban: doBan, unban: doUnban, lookup: doLookup, modlog: doModlog
};

function handles(name) { return !!RUN[name]; }

async function handle(inter, name) {
  if (!allowed(inter, name)) {
    await D.interactionReply(inter, why(inter, name), true).catch(() => {});
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

module.exports = {
  DEFS, NEEDS, handles, handle, allowed, why, profileOf,
  warnsFor, notesFor, addWarn, addNote, removeWarn, removeNote, everyone, logs
};
