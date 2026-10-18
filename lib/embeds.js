const S = require('./store');
const G = require('./gateway');
const D = require('./discord');
const Site = require('./site');

const C = {
  twitch: 0x9146FF,
  youtube: 0xFF0000,
  night: 0x7C5CFF,
  achievement: 0xFBBF24,
  deal: 0x4ADE80,
  quote: 0x38D9F0,
  welcome: 0x7C5CFF,
  staff: 0x64647E,
  roles: 0x7C5CFF
};

function cfg() { return S.read('config', {}); }
function site() { return Site.siteUrl(); }
function brand() { return cfg().siteName || 'Afterhours'; }

function nameOf(uid) {
  const m = G.live.members[uid];
  if (m) return m.nick || m.global_name || m.username;
  const u = S.read('users', {})[uid];
  return u ? u.name : 'Someone';
}

function avatarOf(uid) {
  const m = G.live.members[uid];
  if (m) return D.avatarUrl(m);
  return null;
}

function rel(ms) { return '<t:' + Math.floor(ms / 1000) + ':R>'; }

function imageFor(slot) {
  let m = null;
  try { m = require('./uploads').siteImage(slot); } catch (e) { m = null; }
  if (!m || !m.url || m.kind !== 'img') return null;
  if (/^https?:\/\//.test(m.url)) return m.url;
  const base = site();
  if (!base) return null;
  return base.replace(/\/$/, '') + m.url;
}

function footer(text) {
  const f = { text: text };
  const icon = imageFor('icon');
  if (icon) f.icon_url = icon;
  return f;
}

function field(name, value, inline) {
  return { name: name, value: String(value == null || value === '' ? '—' : value), inline: inline !== false };
}

function link(label, url, emoji) {
  const b = { type: 2, style: 5, label: label, url: url };
  if (emoji) b.emoji = { name: emoji };
  return b;
}

function button(label, id, style, emoji) {
  const b = { type: 2, style: style || 2, label: label, custom_id: id };
  if (emoji) b.emoji = { name: emoji };
  return b;
}

function row() {
  const parts = [].slice.call(arguments).filter(Boolean);
  return parts.length ? [{ type: 1, components: parts.slice(0, 5) }] : [];
}

function pingFor(kind) {
  const c = cfg();
  const id = kind === 'live' ? c.pingLive : kind === 'night' ? c.pingNight : kind === 'deal' ? c.pingDeal : '';
  if (!id) return null;
  const roles = G.live.roles || [];
  if (roles.length && !roles.some(r => r.id === id)) return null;
  return id;
}

function withPing(kind, lead, payload) {
  const id = pingFor(kind);
  const out = Object.assign({}, payload);
  if (id) {
    out.content = '<@&' + id + '>' + (lead ? ' ' + lead : '');
    out.allowed_mentions = { parse: [], roles: [id] };
  } else if (lead) {
    out.content = lead;
    out.allowed_mentions = { parse: [] };
  } else {
    out.allowed_mentions = { parse: [] };
  }
  return out;
}

function live(uid, s) {
  const who = nameOf(uid);
  const where = s.platform === 'twitch' ? 'Twitch' : 'YouTube';
  const e = {
    color: s.platform === 'twitch' ? C.twitch : C.youtube,
    author: { name: who },
    title: (s.title || who + ' is live').slice(0, 250),
    url: s.url,
    fields: [],
    footer: footer(where + (s.handle ? ' · ' + s.handle : ''))
  };
  const av = avatarOf(uid);
  if (av) e.author.icon_url = av;
  if (s.game) e.fields.push(field('Playing', s.game));
  if (s.viewers != null) e.fields.push(field('Watching', s.viewers));
  if (s.started) e.fields.push(field('Live since', rel(s.started)));
  if (s.thumb) e.image = { url: s.thumb };
  e.timestamp = new Date(s.started || Date.now()).toISOString();

  const url = site();
  return withPing('live', who + ' just went live.', {
    embeds: [e],
    components: row(link('Watch on ' + where, s.url, '▶️'), url ? link('Who else is on', url + '/clips/live') : null)
  });
}

function night(ev) {
  const going = (ev.going || []).map(nameOf);
  const lib = S.read('library', []);
  const top = lib.slice().sort((a, b) => (b.owners || []).length - (a.owners || []).length)[0];
  const e = {
    color: C.night,
    title: 'Next night is locked in',
    description: '**' + ev.label + '** — ' + (going.length
      ? going.length + (going.length === 1 ? ' in so far.' : ' in so far.')
      : 'nobody down yet.'),
    fields: [field('Going', going.length ? going.join(', ') : 'Nobody yet', false)],
    footer: footer(brand() + ' · tap below to put your name down'),
    timestamp: new Date().toISOString()
  };
  if (top) e.fields.push(field('Most owned', top.name + ' — ' + (top.owners || []).length + ' of you'));
  const pic = imageFor('event');
  if (pic) e.image = { url: pic };
  const url = site();
  return withPing('night', null, {
    embeds: [e],
    components: row(
      button("I'm in", 'night:in', 3),
      button("Can't make it", 'night:out', 2),
      url ? link('Open the site', url + '/play/nights') : null
    )
  });
}

function hosting(row) {
  const when = '<t:' + require('./calendar').stamp(row.day, row.time) + ':F>';
  const e = {
    color: C.night,
    author: { name: (row.hostName || nameOf(row.host)) + ' is hosting' },
    title: row.title,
    description: when + '  \u00b7  ' + '<t:' + require('./calendar').stamp(row.day, row.time) + ':R>',
    fields: [],
    footer: footer(brand() + ' \u00b7 calendar'),
    timestamp: new Date().toISOString()
  };
  const av = avatarOf(row.host);
  if (av) e.author.icon_url = av;
  if (row.game) e.fields.push(field('Game', row.game));
  if (row.cap) e.fields.push(field('Spots', row.cap));
  if (row.note) e.fields.push(field('Note', row.note, false));
  const pic = imageFor('event');
  if (pic) e.thumbnail = { url: pic };
  const url = site();
  return withPing('night', null, {
    embeds: [e],
    components: row.id ? [{ type: 1, components: [
      { type: 2, style: 3, label: "I'm in", custom_id: 'cal:in:' + row.id },
      { type: 2, style: 2, label: "Can't make it", custom_id: 'cal:out:' + row.id }
    ].concat(url ? [{ type: 2, style: 5, label: 'Calendar', url: url + '/play/calendar' }] : []) }] : []
  });
}

function whatNow(res, Sg) {
  const names = res.who.map(nameOf);
  const e = {
    color: C.night,
    title: 'What you could play right now',
    description: res.who.length
      ? names.length + ' in voice: ' + names.join(', ')
      : 'Nobody is in voice.',
    fields: res.picks.map((p, i) => ({
      name: ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] + '  ' + p.name,
      value: (p.missing === 0 ? 'All ' + res.who.length + ' of you own it' :
        p.have.length + ' of ' + res.who.length + ' own it \u2014 ' + p.missing + ' missing') +
        (p.minutes === null ? '' : '  \u00b7  ' + Sg.dur(p.minutes) + ' between you') +
        (p.appid ? '\n[Store page](https://store.steampowered.com/app/' + p.appid + ')' : ''),
      inline: false
    })),
    footer: footer(brand() + (res.total ? ' \u00b7 ' + res.total + ' fit' : '')),
    timestamp: new Date().toISOString()
  };
  if (!res.picks.length) {
    e.description += '\n\nNothing in the library is owned by enough of you. Scan some Steam libraries on the site.';
  }
  return { embeds: [e], allowed_mentions: { parse: [] } };
}

function shelf(rows, Sg, title, blurb) {
  const e = {
    color: C.achievement,
    title: title,
    description: rows.length ? blurb : 'Nothing qualifies yet \u2014 scan a few Steam libraries on the site first.',
    fields: rows.slice(0, 10).map(r => ({
      name: r.name,
      value: r.owners.length + ' of you own it' +
        (r.minutes ? '  \u00b7  ' + Sg.dur(r.minutes) + ' between you' : '  \u00b7  never launched') +
        (r.appid ? '  \u00b7  [Store](https://store.steampowered.com/app/' + r.appid + ')' : ''),
      inline: false
    })),
    footer: footer(brand() + (rows.length > 10 ? ' \u00b7 and ' + (rows.length - 10) + ' more' : '')),
    timestamp: new Date().toISOString()
  };
  return { embeds: [e], allowed_mentions: { parse: [] } };
}

function roulette(pick, Sg) {
  if (!pick) {
    return { embeds: [{ color: C.night, title: 'Nothing to spin', description: 'The library is empty.' }],
      allowed_mentions: { parse: [] } };
  }
  const e = {
    color: C.night,
    title: '\u{1F3B2}  ' + pick.name,
    description: 'Picked at random from ' + pick.pool + ' owned by ' + pick.scope + '.',
    fields: [
      field('Owned by', pick.owners.length + ' of you'),
      field('Played', pick.minutes === null ? 'unknown' : pick.minutes ? Sg.dur(pick.minutes) + ' between you' : 'never')
    ],
    footer: footer(brand() + ' \u00b7 backlog roulette'),
    timestamp: new Date().toISOString()
  };
  if (pick.appid) e.thumbnail = { url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + pick.appid + '/capsule_231x87.jpg' };
  return withPing('night', null, {
    embeds: [e],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: "I'm in", custom_id: 'roul:in' },
      { type: 2, style: 2, label: 'Spin again', custom_id: 'roul:spin' }
    ].concat(pick.appid ? [{ type: 2, style: 5, label: 'Store',
      url: 'https://store.steampowered.com/app/' + pick.appid }] : []) }]
  });
}

function bought(uid, games, owners) {
  const who = nameOf(uid);
  const e = {
    color: C.deal,
    author: { name: who },
    title: games.length === 1 ? 'Picked up ' + games[0].name : 'Picked up ' + games.length + ' games',
    fields: games.slice(0, 6).map(g => ({
      name: g.name,
      value: (owners[g.appid] && owners[g.appid].length
        ? owners[g.appid].length + ' of you already own it' : 'Nobody else owns it') +
        '  \u00b7  [Store](https://store.steampowered.com/app/' + g.appid + ')',
      inline: false
    })),
    footer: footer('Steam'),
    timestamp: new Date().toISOString()
  };
  const av = avatarOf(uid);
  if (av) e.author.icon_url = av;
  if (games.length === 1) {
    e.thumbnail = { url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + games[0].appid + '/capsule_231x87.jpg' };
  }
  return { embeds: [e], allowed_mentions: { parse: [] } };
}

function promoted(m, count) {
  const e = {
    color: C.quote,
    author: { name: (m.author && m.author.name) || 'Someone' },
    title: 'Straight into Memories',
    description: (m.text ? '\u201C' + String(m.text).slice(0, 300) + '\u201D\n\n' : '') +
      'It picked up ' + count + ' reaction' + (count === 1 ? '' : 's') + ', so it promoted itself.',
    footer: footer(brand() + ' \u00b7 nobody had to pin it'),
    timestamp: new Date().toISOString()
  };
  if (m.author && m.author.avatar) e.author.icon_url = m.author.avatar;
  const pic = (m.attachments || []).find(a => a.image);
  if (pic && pic.url) e.image = { url: pic.url };
  const url = site();
  return {
    embeds: [e],
    allowed_mentions: { parse: [] },
    components: url ? [{ type: 1, components: [
      { type: 2, style: 5, label: 'Memories', url: url + '/clips/memories' }] }] : []
  };
}

function guestPass(g, url) {
  const e = {
    color: C.night,
    title: 'Guest pass',
    description: 'Good for ' + g.hours + ' hour' + (g.hours === 1 ? '' : 's') + ' once it is used.',
    fields: [
      field('Gives', '<@&' + g.role + '>'),
      field('Uses', g.used.length + ' of ' + g.uses),
      field('Link dies', rel(g.expires))
    ],
    footer: footer(brand()),
    timestamp: new Date().toISOString()
  };
  if (g.note) e.fields.push(field('Note', g.note, false));
  return {
    embeds: [e],
    allowed_mentions: { parse: [] },
    components: url ? [{ type: 1, components: [
      { type: 2, style: 5, label: 'Open the pass', url: url }] }] : []
  };
}

function achievement(uid, a, holders) {
  const e = {
    color: C.achievement,
    author: { name: nameOf(uid) },
    title: a.ico + '  ' + a.n,
    description: a.d,
    footer: footer('Achievement' + (holders ? ' · ' + holders + ' of you have this' : '')),
    timestamp: new Date().toISOString()
  };
  const av = avatarOf(uid);
  if (av) e.author.icon_url = av;
  const url = site();
  return { embeds: [e], allowed_mentions: { parse: [] }, components: row(url ? link('See the rest', url + '/crew/stats') : null) };
}

function deal(d, money) {
  const e = {
    color: C.deal,
    title: d.name,
    url: 'https://store.steampowered.com/app/' + d.appid,
    description: '**' + money(d.price.final, d.price.currency) + '**  ~~' +
      money(d.price.initial, d.price.currency) + '~~  ·  **-' + d.price.cut + '%**',
    fields: [field(d.who.length === 1 ? 'Wishlisted by' : d.who.length + ' of you want it',
      d.who.length ? d.who.join(', ') : '—', false)],
    thumbnail: { url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + d.appid + '/capsule_231x87.jpg' },
    footer: footer('Steam'),
    timestamp: new Date().toISOString()
  };
  return withPing('deal', null, {
    embeds: [e],
    components: row(link('Open on Steam', 'https://store.steampowered.com/app/' + d.appid))
  });
}

function quote(text, saidBy, savedBy, when) {
  const e = {
    color: C.quote,
    description: text,
    footer: footer([saidBy, savedBy ? 'saved by ' + savedBy : null].filter(Boolean).join(' · ') || brand()),
    timestamp: new Date(when || Date.now()).toISOString()
  };
  const url = site();
  return { embeds: [e], allowed_mentions: { parse: [] }, components: row(url ? link('Memories', url + '/clips/memories') : null) };
}

function welcome(member) {
  const c = cfg();
  const who = member.nick || (member.user && (member.user.global_name || member.user.username)) || 'someone new';
  const e = {
    color: C.welcome,
    title: 'Welcome to ' + brand(),
    description: (c.welcomeText || 'Glad you made it. Have a look around, grab the pings you want, and put your name down for the next night.').slice(0, 1800),
    fields: [],
    footer: footer(brand()),
    timestamp: new Date().toISOString()
  };
  if (member.user) {
    e.author = { name: who };
    const av = D.avatarUrl(member.user);
    if (av) e.author.icon_url = av;
    e.thumbnail = { url: av };
  }
  const rr = S.read('reactroles', { pairs: [] });
  if ((rr.pairs || []).length && rr.channel) e.fields.push(field('Pings', 'Pick what you want notified for in <#' + rr.channel + '>', false));
  const pic = imageFor('welcome');
  if (pic) e.image = { url: pic };
  const url = site();
  if (url) e.fields.push(field('The site', url, false));
  return {
    content: member.user ? '<@' + member.user.id + '>' : '',
    allowed_mentions: { parse: [], users: member.user ? [member.user.id] : [] },
    embeds: [e],
    components: row(url ? link('Open the site', url) : null)
  };
}

function rolePost() {
  const store = S.read('reactroles', { pairs: [] });
  const pairs = (store.pairs || []).slice(0, 20);
  const roles = G.live.roles || [];
  const members = Object.values(G.live.members || {}).filter(m => !m.bot);

  const lines = pairs.map(p => {
    const r = roles.find(x => x.id === p.role);
    const show = p.show || p.emoji;
    if (!r) return show + '  a role that no longer exists';
    const held = members.filter(m => (m.roles || []).indexOf(p.role) > -1).length;
    const tail = p.note ? '\n\u2002\u2002\u2002' + p.note : '';
    const count = held ? '  \u00b7  `' + held + '`' : '';
    return show + '  <@&' + r.id + '>' + count + tail;
  });

  const top = pairs.map(p => roles.find(x => x.id === p.role)).filter(Boolean)
    .sort((a, b) => b.position - a.position)[0];
  const colour = top && /^#[0-9a-f]{6}$/i.test(top.colour) && top.colour.toLowerCase() !== '#99a0bb'
    ? parseInt(top.colour.slice(1), 16)
    : C.roles;

  const e = {
    color: colour,
    title: store.title || 'Pick what you want pinged for',
    description: pairs.length
      ? (store.blurb || 'React below to give yourself a role. Take the reaction off to drop it again \u2014 change your mind as often as you like.') +
        '\n\n' + lines.join('\n\n')
      : 'No roles have been set up yet.',
    footer: footer(brand() + (pairs.length ? ' \u00b7 ' + pairs.length + ' to choose from' : '')),
    timestamp: new Date().toISOString()
  };

  const pic = imageFor('roles') || imageFor('dc-2');
  if (pic) e.thumbnail = { url: pic };

  return { embeds: [e], allowed_mentions: { parse: [] } };
}

function whois(uid, info) {
  const e = {
    color: C.staff,
    author: { name: info.name },
    fields: [
      field('Rank', info.rank),
      field('Joined', info.joined ? rel(info.joined) : '—'),
      field('Nights', info.nights),
      field('In voice', info.voice),
      field('Clips', info.clips),
      field('Site perms', info.perms)
    ],
    footer: footer('Staff only · nobody else sees this'),
    timestamp: new Date().toISOString()
  };
  if (info.avatar) e.author.icon_url = info.avatar;
  if (info.roles) e.fields.push(field('Roles', info.roles, false));
  if (info.warns) e.fields.push(field('Warnings', info.warns, false));
  if (info.notes) e.fields.push(field('Notes', info.notes, false));
  return { embeds: [e] };
}

function plain(title, lines, colour) {
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      color: colour || C.night,
      title: title,
      description: lines.join('\n').slice(0, 3800),
      footer: footer(brand()),
      timestamp: new Date().toISOString()
    }]
  };
}

module.exports = {
  C, live, night, hosting, whatNow, shelf, roulette, bought, promoted, guestPass,
  achievement, deal, quote, welcome, rolePost, whois, plain, imageFor,
  nameOf, field, link, button, row, footer, pingFor, withPing, rel, site, brand
};
