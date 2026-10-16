const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const St = require('./streams');
const Steam = require('./steam');
const Staff = require('./staff');
const E = require('./embeds');
const Sg = require('./suggest');

const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GUILD = process.env.DISCORD_GUILD_ID || '';
const SITE = require('./site').siteUrl();

let appId = null;

function log() { console.log.apply(console, ['[commands]'].concat([].slice.call(arguments))); }

const DEFS = [
  { name: 'quote', type: 1, description: 'Save a line to Memories',
    options: [
      { name: 'line', type: 3, description: 'What was said', required: true },
      { name: 'who', type: 6, description: 'Who said it', required: false }
    ] },
  { name: 'tonight', type: 1, description: 'Who is playing and what spots are left' },
  { name: 'next', type: 1, description: 'The next game night' },
  { name: 'live', type: 1, description: 'Who is streaming right now' },
  { name: 'deals', type: 1, description: 'Anything on sale that two or more of you want' },
  { name: 'Save as quote', type: 3 },
  { name: 'whatnow', type: 1, description: 'What everyone in voice right now could actually launch' },
  { name: 'shelf', type: 1, description: 'Games lots of you own and nobody has ever played' },
  { name: 'roulette', type: 1, description: 'Pick something out of the backlog at random' },
  { name: 'fivemin', type: 1, description: 'Who says five minutes and means an hour' }
].concat(Staff.DEFS);

async function whoAmI() {
  if (appId) return appId;
  if (process.env.DISCORD_CLIENT_ID) { appId = process.env.DISCORD_CLIENT_ID; return appId; }
  const r = await fetch(API + '/oauth2/applications/@me', { headers: { Authorization: 'Bot ' + TOKEN } });
  if (!r.ok) throw new Error('applications/@me ' + r.status);
  const j = await r.json();
  appId = j.id;
  return appId;
}

async function register() {
  if (!TOKEN || !GUILD) return;
  try {
    const id = await whoAmI();
    const r = await fetch(API + '/applications/' + id + '/guilds/' + GUILD + '/commands', {
      method: 'PUT',
      headers: { Authorization: 'Bot ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(DEFS)
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      log('register failed', r.status, t.slice(0, 160));
      return;
    }
    log('registered', DEFS.length, 'commands');
  } catch (e) {
    log('register error', e.message);
  }
}

async function reply(inter, content, ephemeral) {
  await fetch(API + '/interactions/' + inter.id + '/' + inter.token + '/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 4, data: { content: content, flags: ephemeral ? 64 : 0 } })
  }).catch(() => {});
}

function nameOf(uid) {
  const m = G.live.members[uid];
  if (m) return m.nick || m.global_name || m.username;
  const u = S.read('users', {})[uid];
  return u ? u.name : 'Someone';
}

function optionMap(opts) {
  const o = {};
  (opts || []).forEach(x => { o[x.name] = x.value; });
  return o;
}


async function doQuote(inter) {
  const o = optionMap(inter.data.options);
  const line = String(o.line || '').slice(0, 400);
  const said = o.who ? nameOf(o.who) : null;
  const by = inter.member && inter.member.user ? inter.member.user : (inter.user || {});

  const msgs = S.read('messages', []);
  msgs.unshift({
    id: 'cmd' + Date.now(),
    kind: 'memories',
    channel: inter.channel_id,
    author: { id: by.id, name: by.global_name || by.username, avatar: D.avatarUrl(by) },
    text: said ? '“' + line + '” — ' + said : '“' + line + '”',
    attachments: [], embeds: [], reactions: { '\u{1F4CC}': 1 }, pinned: true,
    at: Date.now()
  });
  S.write('messages', msgs.slice(0, 400));
  await reply(inter, '\u{1F4CC}  Saved to Memories.' + (SITE ? ' ' + SITE + '/clips' : ''));
}

async function doContextQuote(inter) {
  const id = inter.data.target_id;
  const res = inter.data.resolved && inter.data.resolved.messages;
  const m = res && res[id];
  if (!m) return reply(inter, 'Could not read that message.', true);

  const msgs = S.read('messages', []);
  const already = msgs.find(x => x.id === m.id);
  if (already) {
    already.kind = 'memories';
    already.pinned = true;
  } else {
    msgs.unshift({
      id: m.id, kind: 'memories', channel: inter.channel_id,
      author: { id: m.author.id, name: m.author.global_name || m.author.username, avatar: D.avatarUrl(m.author) },
      text: m.content || '',
      attachments: (m.attachments || []).map(a => ({
        url: a.url, name: a.filename,
        image: /^image\//.test(a.content_type || ''), video: /^video\//.test(a.content_type || '')
      })),
      embeds: [], reactions: { '\u{1F4CC}': 1 }, pinned: true,
      at: m.timestamp ? Date.parse(m.timestamp) : Date.now()
    });
  }
  S.write('messages', msgs.slice(0, 400));
  await reply(inter, '\u{1F4CC}  Pinned to Memories.' + (SITE ? ' ' + SITE + '/clips' : ''), true);
}

async function doTonight(inter) {
  const list = S.read('sessions', []).filter(s => s.at > Date.now() - 20 * 3600000);
  if (!list.length) return reply(inter, 'Nothing on yet. Open one at ' + (SITE || 'the site') + '.');
  const lines = list.map(s =>
    '• **' + s.game + '** — ' + s.when + ', ' + s.hostName +
    ' — ' + s.players.length + '/' + s.cap + (s.players.length >= s.cap ? ' (full)' : ' (' + (s.cap - s.players.length) + ' free)'));
  await reply(inter, '**Playing tonight**\n' + lines.join('\n') + (SITE ? '\n' + SITE : ''));
}

async function doNext(inter) {
  const ev = S.read('event', null);
  if (!ev) return reply(inter, 'Nothing locked in yet. Vote on a time at ' + (SITE || 'the site') + '/play.');
  const who = (ev.going || []).map(nameOf);
  await reply(inter, '**' + ev.label + '**\n' +
    (who.length ? who.length + ' going: ' + who.join(', ') : 'Nobody has RSVPd yet') +
    (SITE ? '\n' + SITE + '/play' : ''));
}

async function doLive(inter) {
  const ls = St.liveList();
  if (!ls.length) return reply(inter, 'Nobody is live right now.');
  const lines = ls.map(s =>
    '• **' + nameOf(s.uid) + '** on ' + (s.platform === 'twitch' ? 'Twitch' : 'YouTube') +
    (s.game ? ' — ' + s.game : '') + (s.viewers != null ? ' (' + s.viewers + ' watching)' : '') + '\n  ' + s.url);
  await reply(inter, '**Live now**\n' + lines.join('\n'));
}

async function doDeals(inter) {
  const ds = Steam.deals().slice(0, 5);
  if (!ds.length) return reply(inter, 'Nothing you both want is on sale.');
  const lines = ds.map(d =>
    '• **' + d.name + '** — ' + d.price.cut + '% off, ' +
    Steam.money(d.price.final, d.price.currency) +
    ' — ' + d.who.length + ' want it\n  https://store.steampowered.com/app/' + d.appid);
  await reply(inter, '**On sale**\n' + lines.join('\n'));
}

async function doButton(inter) {
  const id = (inter.data && inter.data.custom_id) || '';
  if (id.indexOf('cal:') === 0) return doCalButton(inter, id);
  if (id.indexOf('roul:') === 0) return doRoulButton(inter, id);
  if (id.indexOf('app:') === 0) return doAppButton(inter, id);
  if (id.indexOf('radio:') === 0) return doRadioButton(inter, id);
  if (id !== 'night:in' && id !== 'night:out') return;
  const who = (inter.member && inter.member.user) || inter.user || {};
  const ev = S.read('event', null);
  if (!ev) return reply(inter, 'There is no night locked in right now.', true);
  ev.going = ev.going || [];
  const at = ev.going.indexOf(who.id);
  if (id === 'night:in' && at === -1) ev.going.push(who.id);
  if (id === 'night:out' && at > -1) ev.going.splice(at, 1);
  S.write('event', ev);
  try {
    require('./stats').recordNight(ev.going, ev.host);
  } catch (e) {}
  await fetch(API + '/interactions/' + inter.id + '/' + inter.token + '/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 7, data: E.night(ev) })
  }).catch(() => {});
}

async function doRadioButton(inter, id) {
  const P = require('./perms');
  const Voice = require('./voice');
  const Radio = require('./radio');
  const who = (inter.member && inter.member.user) || inter.user || {};
  const roles = (inter.member && inter.member.roles) || [];
  if (!P.can({ id: who.id, roles: roles }, 'staff')) {
    return reply(inter, 'Only staff drive the radio.', true);
  }
  if (id === 'radio:stop') {
    Radio.stop(Voice);
    await Voice.leave();
  } else {
    Radio.skip(Voice);
  }
  await fetch(API + '/interactions/' + inter.id + '/' + inter.token + '/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 7, data: Radio.embed() })
  }).catch(() => {});
}

async function doAppButton(inter, id) {
  const Apply = require('./apply');
  const P = require('./perms');
  const who = (inter.member && inter.member.user) || inter.user || {};
  const roles = (inter.member && inter.member.roles) || [];
  if (!P.can({ id: who.id, roles: roles }, 'staff')) {
    return reply(inter, 'Only staff vote on these.', true);
  }
  const bits = id.split(':');
  const r = await Apply.vote(bits[2], who.id, who.global_name || who.username, bits[1] === 'yes');
  if (!r.ok) return reply(inter, r.why, true);
  await reply(inter, r.state === 'open'
    ? 'Noted. ' + r.tally.yes + ' yes, ' + r.tally.no + ' no \u2014 ' + r.tally.need + ' needed either way.'
    : r.state === 'approved'
      ? 'Approved' + (r.gave ? ' and given their rank.' : ', but no rank is set to give them.')
      : 'Turned down.', true);
}

async function doRoulButton(inter, id) {
  if (id === 'roul:spin') {
    await fetch(API + '/interactions/' + inter.id + '/' + inter.token + '/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 7, data: E.roulette(Sg.roulette(Sg.inVoice()), Sg) })
    }).catch(() => {});
    return;
  }
  const who = (inter.member && inter.member.user) || inter.user || {};
  await reply(inter, 'Noted \u2014 tell the others.', true);
  const cfg = S.read('config', {});
  const ch = cfg.announceChannel || inter.channel_id;
  if (ch) {
    await D.post(ch, {
      content: '<@' + who.id + '> is in.',
      allowed_mentions: { parse: [] }
    }).catch(() => {});
  }
}

async function doCalButton(inter, id) {
  const parts = id.split(':');
  const who = (inter.member && inter.member.user) || inter.user || {};
  const Cal = require('./calendar');
  const r = Cal.rsvp(parts[2], who.id, parts[1] === 'in');
  if (!r) return reply(inter, 'That one is no longer on the calendar.', true);
  if (r.full) return reply(inter, 'That one is full.', true);
  await fetch(API + '/interactions/' + inter.id + '/' + inter.token + '/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 7, data: E.hosting(r.row) })
  }).catch(() => {});
}

async function doWhatNow(inter) {
  const res = Sg.whatNow(null, 3);
  await D.interactionReply(inter, E.whatNow(res, Sg));
}

async function doShelf(inter) {
  const never = Sg.neverPlayed(3);
  if (never.length) {
    return D.interactionReply(inter, E.shelf(never, Sg, 'Never once launched',
      never.length + ' game' + (never.length === 1 ? '' : 's') + ' three or more of you own and not one of you has started.'));
  }
  const barely = Sg.barelyPlayed(3, 60);
  return D.interactionReply(inter, E.shelf(barely, Sg, 'Barely touched',
    'Nothing is completely untouched, so here is what you all gave up on fastest.'));
}

async function doRoulette(inter) {
  await D.interactionReply(inter, E.roulette(Sg.roulette(Sg.inVoice()), Sg));
}

async function doFiveMin(inter) {
  const FM = require('./fivemin');
  const rows = FM.board();
  if (!rows.length) {
    return D.interactionReply(inter, E.plain('Five-minute watch',
      ['Nothing tracked yet. Somebody has to say it in chat while they are in voice first.'], E.C.staff));
  }
  const lines = rows.slice(0, 10).map((r, i) => {
    const medal = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || '\u2002\u2002';
    return medal + '  **' + E.nameOf(r.uid) + '** \u2014 ' + r.claims + ' claim' + (r.claims === 1 ? '' : 's') +
      ', ' + FM.dur(r.avgMs) + ' on average, worst ' + FM.dur(r.worstMs) +
      (r.overMs ? '\n\u2002\u2002\u2002' + FM.dur(r.overMs) + ' owed in total' : '');
  });
  await D.interactionReply(inter, E.plain('Five-minute watch', lines, 0xFBBF24));
}

async function handle(inter) {
  try {
    if (inter.type === 3) return doButton(inter);
    if (inter.type !== 2) return;
    const name = inter.data && inter.data.name;
    if (inter.data.type === 3) return doContextQuote(inter);
    if (Staff.handles(name)) return Staff.handle(inter, name);
    if (name === 'quote') return doQuote(inter);
    if (name === 'tonight') return doTonight(inter);
    if (name === 'next') return doNext(inter);
    if (name === 'live') return doLive(inter);
    if (name === 'deals') return doDeals(inter);
    if (name === 'whatnow') return doWhatNow(inter);
    if (name === 'shelf') return doShelf(inter);
    if (name === 'roulette') return doRoulette(inter);
    if (name === 'fivemin') return doFiveMin(inter);
  } catch (e) {
    log('handle', e.message);
    reply(inter, 'That did not work: ' + e.message, true).catch(() => {});
  }
}

module.exports = { register, handle, DEFS };
