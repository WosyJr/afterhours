const path = require('path');
const fs = require('fs');

/* A half-finished upload otherwise dies on a bare MODULE_NOT_FOUND stack that
   says nothing useful. Name the missing files instead. */
const NEEDED = ['store', 'site', 'storage', 'discord', 'gateway', 'perms', 'views', 'uploads',
  'pages', 'streams', 'streampages', 'stats', 'achievements', 'steam', 'commands', 'music'];
const gone = NEEDED.filter(n => !fs.existsSync(path.join(__dirname, 'lib', n + '.js')));
if (gone.length) {
  console.error('');
  console.error('[afterhours] This deploy is missing ' + gone.length + ' file' + (gone.length === 1 ? '' : 's') + ':');
  gone.forEach(n => console.error('[afterhours]     lib/' + n + '.js'));
  console.error('[afterhours]');
  console.error('[afterhours] Push the contents of afterhours-site.zip, which is the whole site.');
  console.error('[afterhours] The changed-files zip only carries what moved since the one before it,');
  console.error('[afterhours] so skipping one leaves holes like this.');
  console.error('');
  process.exit(1);
}

const ASSETS = ['style.css', 'app.js', 'jukecore.js', 'music.js', 'musicwin.js', 'icon.svg'];
const noAsset = ASSETS.filter(n => !fs.existsSync(path.join(__dirname, 'public', n)));
if (noAsset.length) {
  console.error('[afterhours] Missing from public/: ' + noAsset.join(', '));
  console.error('[afterhours] The site will run but parts of it will not work. Push the whole site.');
}

const express = require('express');
const cookieSession = require('cookie-session');

const S = require('./lib/store');
const D = require('./lib/discord');
const G = require('./lib/gateway');
const P = require('./lib/perms');
const V = require('./lib/views');
const U = require('./lib/uploads');
const Pages = require('./lib/pages');
const St = require('./lib/streams');
const SP = require('./lib/streampages');
const Stats = require('./lib/stats');
const Ach = require('./lib/achievements');
const Steam = require('./lib/steam');
const Cmd = require('./lib/commands');
const Music = require('./lib/music');
const Site = require('./lib/site');
const Embeds = require('./lib/embeds');
const RR = require('./lib/reactroles');
const Greet = require('./lib/greet');
const ML = require('./lib/modlog');
const Cal = require('./lib/calendar');
const VR = require('./lib/voicerooms');
const Board = require('./lib/board');
const FM = require('./lib/fivemin');
const Fc = require('./lib/forecast');
const Ladder = require('./lib/ladder');
const Badges = require('./lib/badges');
const Staff2 = require('./lib/staff');
const SPname = id => require('./lib/streampages').memberName(id);
const Staff = require('./lib/staff');
const Storage = require('./lib/storage');
const Widget = require('./lib/widget');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use('/', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/uploads', express.static(U.DIR, { maxAge: '7d', fallthrough: true }));

app.use(cookieSession({
  name: 'ah',
  keys: [process.env.SESSION_SECRET || 'change-me-in-railway'],
  maxAge: 30 * 24 * 3600 * 1000,
  sameSite: 'lax',
  httpOnly: true,
  secure: /^https:/i.test(Site.siteUrl())
}));

function config() {
  const c = S.read('config', {});
  if (!c.siteName) c.siteName = process.env.SITE_NAME || 'Afterhours';
  if (!c.tagline) c.tagline = 'Good games. Better company.';
  if (!c.images) c.images = {};
  return c;
}

/* ---------- who is this ---------- */

function currentUser(req) {
  if (!req.session || !req.session.uid) return null;
  const users = S.read('users', {});
  const u = users[req.session.uid];
  if (!u) return null;
  const live = G.live.members[u.id];
  const roles = live ? live.roles : u.roles;
  const pres = G.live.presence[u.id];
  const rank = P.topRole({ roles: roles }, G.live.roles);
  return {
    id: u.id,
    name: (live && (live.nick || live.global_name || live.username)) || u.name,
    username: u.username,
    avatar: (live && live.avatar) || u.avatar,
    roles: roles || [],
    rank: rank,
    status: pres ? pres.status : 'offline'
  };
}

function ctxFor(req) {
  const me = currentUser(req);
  const cfg = config();
  const perms = P.forUser(me);
  /* Settings is the owner's alone unless the owner says otherwise. Managing
     members is not the same as rewiring the site. */
  perms.settings = !!me && (me.id === cfg.ownerId || (!!cfg.settingsForAdmins && !!perms.members));
  return { me: me, perms: perms, cfg: cfg };
}

function need(key) {
  return function (req, res, next) {
    const ctx = ctxFor(req);
    if (!ctx.me) return res.redirect('/');
    if (!ctx.perms.view) return res.send(V.gate(ctx.cfg, 'Your rank has no access to this site.', U.siteImage('gate-bg')));
    if (key && !ctx.perms[key]) {
      return res.status(403).send(key === 'settings'
        ? 'Settings belongs to the owner of this site.'
        : 'Your rank cannot do that.');
    }
    req.ctx = ctx;
    next();
  };
}

function render(req, res, active, title, body) {
  const ctx = req.ctx || ctxFor(req);
  res.send(V.page({
    title, active, me: ctx.me, perms: ctx.perms, cfg: ctx.cfg, body,
    liveBar: SP.liveBar(), juke: Music.tag(ctx.cfg)
  }));
}

/* ---------- auth ---------- */

app.get('/login', (req, res) => {
  if (!D.configured()) {
    return res.status(500).send('Discord is not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_GUILD_ID.');
  }
  const state = S.id();
  req.session.state = state;
  res.redirect(D.authUrl(state));
});

app.get('/auth/callback', async (req, res) => {
  const cfg = config();
  try {
    if (!req.query.code) return res.redirect('/');
    if (!req.query.state || req.query.state !== req.session.state) {
      return res.send(V.gate(cfg, 'That sign-in link expired. Try again.', U.siteImage('gate-bg')));
    }
    delete req.session.state;

    const tok = await D.exchange(req.query.code);
    const who = await D.identify(tok.access_token);
    const member = await D.guildMember(tok.access_token);

    if (!member) {
      return res.send(V.gate(cfg, 'You are not in the server, so there is nothing here for you.', U.siteImage('gate-bg')));
    }

    const users = S.read('users', {});
    const first = Object.keys(users).length === 0;
    users[who.id] = {
      id: who.id,
      username: who.username,
      name: member.nick || who.global_name || who.username,
      avatar: D.avatarUrl(who),
      banner: D.bannerUrl(who),
      accent: D.accent(who),
      roles: member.roles || [],
      joined_at: member.joined_at,
      seen: Date.now()
    };
    S.write('users', users);

    /* The very first person through the door owns the place. */
    if (first) {
      const c = S.read('config', {});
      c.ownerId = who.id;
      S.write('config', c);
      console.log('[auth] first sign-in, owner is', who.username);
    }

    req.session.uid = who.id;
    res.redirect('/');
  } catch (e) {
    console.error('[auth]', e.message);
    res.send(V.gate(cfg, 'Discord turned that sign-in down. Check the redirect URL matches exactly.', U.siteImage('gate-bg')));
  }
});

app.get('/logout', (req, res) => { req.session = null; res.redirect('/'); });

/* ---------- the five tabs ---------- */

app.get('/', (req, res) => {
  const ctx = ctxFor(req);
  if (!ctx.me) return res.send(V.gate(ctx.cfg, req.query.e, U.siteImage('gate-bg')));
  if (!ctx.perms.view) return res.send(V.gate(ctx.cfg, 'Your rank has no access to this site.', U.siteImage('gate-bg')));
  req.ctx = ctx;
  render(req, res, 'home', 'Home', Pages.home(ctx));
});

function tab(name, title, fn, gate) {
  const subs = V.NAV.filter(t => t.k === name)[0].subs.map(s => s[0]);
  app.get('/' + name, need(gate), (req, res) => res.redirect('/' + name + '/' + subs[0]));
  app.get('/' + name + '/:sub', need(gate), (req, res) => {
    const sub = subs.indexOf(req.params.sub) > -1 ? req.params.sub : subs[0];
    const body = fn(req.ctx, sub, req.query);
    if (body === null) {
      res.status(403);
      return render(req, res, name, title,
        '<section class="page wrap"><h1 class="ttl">Staff only</h1>' +
        '<p class="lede">Your rank does not have <b>Staff tools</b>. The owner can turn that on under ' +
        '<a class="lk" href="/settings/perms">Settings &rarr; Permissions</a>.</p></section>');
    }
    render(req, res, name, title, body);
  });
}

tab('crew', 'Crew', Pages.crew);
tab('clips', 'Clips', Pages.clips);
tab('play', 'Play', Pages.play);
tab('settings', 'Settings', Pages.settings, 'settings');

/* Where the old eleven tabs used to live. */
const MOVED = {
  '/profiles': '/crew/people', '/staff': '/crew/ranks', '/stats': '/crew/stats',
  '/media': '/clips/media', '/memories': '/clips/memories', '/live': '/clips/live',
  '/events': '/play/nights', '/games': '/play/library', '/deals': '/play/deals',
  '/discord': '/settings/discord', '/permissions': '/settings/perms'
};
Object.keys(MOVED).forEach(from => app.get(from, (req, res) => res.redirect(301, MOVED[from])));

/* ---------- the jukebox ---------- */

app.get('/music', need('view'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(Music.windowHtml(req.ctx.cfg));
});

app.get('/music/check', need('settings'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(Music.testHtml(req.ctx.cfg));
});

app.get('/music.json', need('view'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const c = req.ctx.cfg;
  res.json({
    list: Music.house().list,
    auto: !!c.musicAutoplay,
    shuffle: c.musicShuffle !== false,
    vol: Math.max(0, Math.min(100, Number(c.musicVolume) || 12))
  });
});

/* Pulls channels and roles again, for when a channel was made while the bot
   was offline or an event went missing. */
app.post('/settings/refresh', need('settings'), async (req, res) => {
  const got = await G.refresh().catch(() => null);
  res.redirect('/settings/site' + (got ? '?got=' + got.channels + ',' + got.roles : '?got=err'));
});

app.post('/settings/music', need('settings'), (req, res) => {
  try {
    const list = Music.setHouse(req.body.list, req.ctx.me);
    res.redirect('/settings/site?music=' + list.length);
  } catch (e) {
    res.redirect('/settings/site?musicerr=' + encodeURIComponent(e.message.slice(0, 120)));
  }
});

app.post('/games/scan', need('view'), async (req, res) => {
  const me = req.ctx.me;
  const who = String(req.body.who || me.id);
  const forSelf = who === me.id;
  if (!forSelf && !req.ctx.perms.members) {
    return res.redirect('/play/library?scanerr=' + encodeURIComponent('You can only scan your own library.'));
  }

  const profs = S.read('profiles', {});
  const typed = String(req.body.steam || '').trim();
  let id = (profs[who] || {}).steam || '';

  if (typed) {
    let resolved;
    try {
      resolved = await Steam.resolve(typed);
    } catch (e) {
      resolved = null;
    }
    if (!resolved) {
      return res.redirect('/play/library?scanerr=' + encodeURIComponent(
        'That is not a SteamID64 or a profile URL I can resolve. The ID is the 17-digit number.') + '#scan');
    }
    id = resolved;
    profs[who] = profs[who] || {};
    profs[who].steam = id;
    S.write('profiles', profs);
  }

  if (!id) {
    return res.redirect('/play/library?scanerr=' + encodeURIComponent('Put a SteamID64 in first.') + '#scan');
  }

  let r;
  try {
    r = await Steam.syncLibrary(who, id, { minMinutes: req.body.played === 'on' ? 1 : 0, limit: 300 });
  } catch (e) {
    return res.redirect('/play/library?scanerr=' + encodeURIComponent(e.message.slice(0, 140)) + '#scan');
  }
  if (!r.ok) return res.redirect('/play/library?scanerr=' + encodeURIComponent(r.why) + '#scan');

  const name = forSelf ? 'You' : (require('./lib/streampages').memberName(who) || 'They');
  if (r.empty) {
    return res.redirect('/play/library?scanerr=' + encodeURIComponent('Steam says that account owns nothing.') + '#scan');
  }

  if (r.bought && r.bought.length) {
    const cfg = config();
    const ch = cfg.dealChannel || cfg.announceChannel;
    if (ch) {
      const lib = S.read('library', []);
      const owners = {};
      r.bought.forEach(g => {
        const row = lib.find(x => String(x.appid) === String(g.appid));
        owners[g.appid] = row ? (row.owners || []).filter(o => o !== who) : [];
      });
      D.post(ch, Embeds.bought(who, r.bought.slice(0, 6), owners)).catch(() => {});
    }
  }
  const msg = 'Read ' + r.total + ' game' + (r.total === 1 ? '' : 's') + ' off Steam. ' +
    r.added + ' new to the list, and ' + (forSelf ? 'you are' : name + ' is') + ' now down as owning ' + r.joined + '.';
  res.redirect('/play/library?scan=' + encodeURIComponent(msg) + '#scan');
});

app.post('/calendar/add', need('session'), (req, res) => {
  try {
    const row = Cal.add({
      day: req.body.day, time: req.body.time, title: req.body.title,
      note: req.body.note, game: req.body.game, cap: req.body.cap,
      host: req.ctx.me.id, hostName: req.ctx.me.name
    });
    const cfg = config();
    const ch = cfg.announceChannel || cfg.liveChannel;
    if (ch) D.post(ch, Embeds.hosting(row)).catch(() => {});
  } catch (e) {
    return res.redirect('/play/calendar?e=' + encodeURIComponent(e.message.slice(0, 120)));
  }
  res.redirect('/play/calendar');
});

app.post('/calendar/rsvp', need('view'), (req, res) => {
  const r = Cal.rsvp(String(req.body.id || ''), req.ctx.me.id, req.body.on === '1');
  if (r && r.full) return res.redirect('/play/calendar?e=' + encodeURIComponent('That one is full.'));
  res.redirect('/play/calendar');
});

app.post('/calendar/remove', need('view'), (req, res) => {
  const r = Cal.remove(String(req.body.id || ''), req.ctx.me.id, !!req.ctx.perms.staff);
  if (r.denied) return res.redirect('/play/calendar?e=' + encodeURIComponent('That is not yours to remove.'));
  res.redirect('/play/calendar');
});

app.post('/events/slot/remove', need('event'), (req, res) => {
  const slots = S.read('slots', []);
  const i = slots.findIndex(x => x.id === String(req.body.slot || ''));
  if (i > -1) {
    slots.splice(i, 1);
    S.write('slots', slots);
  }
  res.redirect('/play/nights');
});

app.post('/events/clear', need('event'), (req, res) => {
  S.write('event', null);
  res.redirect('/play/nights');
});

app.post('/staff/unwarn', need('staff'), (req, res) => {
  const who = String(req.body.who || '');
  const which = req.body.which ? Number(req.body.which) : null;
  const r = Staff2.removeWarn(who, which);
  if (r.gone) {
    ML.record('unwarn', { who: who, whoName: SPname(who), by: req.ctx.me.id, byName: req.ctx.me.name,
      detail: which ? 'Removed warning ' + which + ' from the site' : 'Cleared all warnings from the site' });
  }
  res.redirect('/crew/staff?done=warn');
});

app.post('/staff/delnote', need('staff'), (req, res) => {
  const who = String(req.body.who || '');
  const which = req.body.which ? Number(req.body.which) : null;
  const r = Staff2.removeNote(who, which);
  if (r.gone) {
    ML.record('unnote', { who: who, whoName: SPname(who), by: req.ctx.me.id, byName: req.ctx.me.name,
      detail: which ? 'Removed note ' + which + ' from the site' : 'Cleared all notes from the site' });
  }
  res.redirect('/crew/staff?done=note');
});

app.post('/settings/pings', need('settings'), (req, res) => {
  const cfg = config();
  const ids = (G.live.roles || []).map(r => r.id);
  ['pingLive', 'pingNight', 'pingDeal'].forEach(k => {
    const v = String(req.body[k] || '');
    cfg[k] = ids.indexOf(v) > -1 ? v : '';
  });
  const chans = Object.values(G.live.channels).filter(c => c.type === 0).map(c => c.id);
  const lc = String(req.body.logChannel || '');
  cfg.logChannel = chans.indexOf(lc) > -1 ? lc : '';
  S.write('config', cfg);
  res.redirect('/settings/discord?saved=pings');
});

app.post('/settings/reactroles', need('settings'), async (req, res) => {
  const chans = Object.values(G.live.channels).filter(c => c.type === 0).map(c => c.id);
  const ch = chans.indexOf(String(req.body.rrChannel || '')) > -1 ? String(req.body.rrChannel) : '';
  const bad = RR.unknownIn(req.body.rrPairs);
  const badEmoji = RR.badEmojiIn(req.body.rrPairs);
  try {
    await RR.setPairs(req.body.rrPairs, ch, req.body.rrTitle, req.body.rrBlurb);
  } catch (e) {
    return res.redirect('/settings/discord?rrerr=' + encodeURIComponent(e.message.slice(0, 140)));
  }
  if (badEmoji.length) {
    return res.redirect('/settings/discord?rrerr=' + encodeURIComponent(
      'Skipped ' + badEmoji.slice(0, 5).join(', ') + ' — that name is not one Discord knows. ' +
      'Paste the emoji itself rather than its :name:.'));
  }
  if (bad.length) {
    return res.redirect('/settings/discord?rrerr=' +
      encodeURIComponent('Skipped, because no role matches: ' + bad.slice(0, 4).join(', ')));
  }
  res.redirect('/settings/discord?saved=roles');
});

app.post('/settings/reactroles/react', need('settings'), async (req, res) => {
  try {
    const bad = await RR.syncReactions();
    if (bad.length) return res.redirect('/settings/discord');
    const st = RR.read();
    st.error = '';
    RR.write(st);
    res.redirect('/settings/discord?saved=reacted');
  } catch (e) {
    res.redirect('/settings/discord?rrerr=' + encodeURIComponent(e.message.slice(0, 140)));
  }
});

app.post('/settings/ranks', need('settings'), async (req, res) => {
  const cfg = config();
  const text = Object.values(G.live.channels).filter(c => c.type === 0).map(c => c.id);
  cfg.autoRank = req.body.autoRank === 'on';
  cfg.bedRoles = req.body.bedRoles === 'on';
  cfg.rankChannel = text.indexOf(String(req.body.rankChannel || '')) > -1 ? String(req.body.rankChannel) : '';
  cfg.timezone = String(req.body.timezone || '').slice(0, 40) || 'America/New_York';
  S.write('config', cfg);

  const badRungs = Ladder.unknownRungs(req.body.rungs);
  Ladder.saveRungs(Ladder.parseRungs(req.body.rungs));
  Ladder.saveBeds(Ladder.parseBeds(req.body.beds));

  if (req.body.apply === 'now') {
    try {
      await Ladder.run(false);
    } catch (e) {
      return res.redirect('/settings/discord?rankerr=' + encodeURIComponent(e.message.slice(0, 140)));
    }
  }
  if (badRungs.length) {
    return res.redirect('/settings/discord?rankerr=' +
      encodeURIComponent('Skipped, because no role matches: ' + badRungs.slice(0, 4).join(', ')));
  }
  res.redirect('/settings/discord?saved=ranks');
});

app.post('/settings/voice', need('settings'), async (req, res) => {
  const cfg = config();
  const voice = Object.values(G.live.channels).filter(c => c.type === 2).map(c => c.id);
  const text = Object.values(G.live.channels).filter(c => c.type === 0).map(c => c.id);
  const roleIds = (G.live.roles || []).filter(r => !r.managed).map(r => r.id);
  const pick = (v, from) => (from.indexOf(String(v || '')) > -1 ? String(v) : '');

  const wasNames = !!cfg.voiceNames;
  cfg.voiceNames = req.body.voiceNames === 'on';
  cfg.lobbyChannel = pick(req.body.lobbyChannel, voice);
  cfg.tempLimit = Math.max(0, Math.min(99, Number(req.body.tempLimit) || 0));
  cfg.aloneMinutes = Math.max(0, Math.min(180, Number(req.body.aloneMinutes) || 0));
  cfg.aloneChannel = pick(req.body.aloneChannel, text);
  cfg.alonePing = pick(req.body.alonePing, roleIds);
  cfg.boardChannel = pick(req.body.boardChannel, text);
  cfg.fiveMin = req.body.fiveMin === 'on';
  cfg.fiveMinChannel = pick(req.body.fiveMinChannel, text);
  S.write('config', cfg);

  if (wasNames && !cfg.voiceNames) VR.restoreNames().catch(() => {});
  if (cfg.boardChannel) Board.refresh(true).catch(() => {});
  res.redirect('/settings/discord?saved=voice');
});

app.post('/settings/greet', need('settings'), (req, res) => {
  const cfg = config();
  const chans = Object.values(G.live.channels).filter(c => c.type === 0).map(c => c.id);
  const roleIds = (G.live.roles || []).filter(r => !r.managed).map(r => r.id);
  const ch = String(req.body.welcomeChannel || '');
  const role = String(req.body.autoRole || '');
  cfg.welcomeChannel = chans.indexOf(ch) > -1 ? ch : '';
  cfg.autoRole = roleIds.indexOf(role) > -1 ? role : '';
  cfg.welcomeText = String(req.body.welcomeText || '').slice(0, 900);
  S.write('config', cfg);
  Greet.note('');
  res.redirect('/settings/discord?saved=greet');
});

/* ---------- form actions ---------- */

app.post('/profiles/me', need('view'), (req, res) => {
  const all = S.read('profiles', {});
  const mine = all[req.ctx.me.id] || {};
  mine.bio = String(req.body.bio || '').slice(0, 240);
  mine.badges = String(req.body.badges || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
  all[req.ctx.me.id] = mine;
  S.write('profiles', all);
  res.redirect('/crew/people#me');
});

/* Twitch, YouTube and Steam in one save, from your own profile card. */
app.post('/profiles/connections', need('view'), async (req, res) => {
  const all = S.read('profiles', {});
  const mine = all[req.ctx.me.id] || {};

  mine.twitch = String(req.body.twitch || '').replace(/^@/, '').replace(/^.*twitch\.tv\//, '').trim().slice(0, 40);
  mine.youtube = String(req.body.youtube || '').replace(/^.*youtube\.com\//, '').trim().slice(0, 60);
  if (!mine.twitch) delete mine.twitch;
  if (!mine.youtube) delete mine.youtube;

  let err = '';
  const raw = String(req.body.steam || '').trim();
  if (!raw) {
    delete mine.steam;
  } else {
    const id = await Steam.resolve(raw).catch(() => null);
    if (id) mine.steam = id;
    else err = 'steam';
  }

  all[req.ctx.me.id] = mine;
  S.write('profiles', all);
  St.checkAll().catch(() => {});
  if (mine.steam) Steam.refresh().catch(() => {});
  res.redirect('/crew/people' + (err ? '?e=' + err : '') + '#me');
});

app.post('/profiles/channels', need('view'), (req, res) => res.redirect(307, '/profiles/connections'));

app.post('/permissions/toggle', need('settings'), (req, res) => {
  const m = P.matrix();
  const rid = req.body.role, key = req.body.key;
  const back = '/settings/perms?role=' + encodeURIComponent(rid || '');
  if (P.KEYS.indexOf(key) === -1) return res.redirect('/settings/perms');
  if (rid === P.topId() || P.isIgnored(rid)) return res.redirect(back);
  m[rid] = m[rid] || Object.assign({}, P.DEFAULTS.low);
  m[rid][key] = m[rid][key] ? 0 : 1;
  P.saveMatrix(m);
  res.redirect(back);
});

/* Hiding a role can change which one is top, so the whole lot is recomputed
   against the live role list rather than stored and left to drift. */
app.post('/permissions/ignore', need('settings'), (req, res) => {
  const rid = String(req.body.role || '');
  if (rid) P.toggleIgnored(rid, G.live.roles);
  res.redirect('/settings/perms?role=' + encodeURIComponent(rid));
});

app.post('/settings', need('settings'), (req, res) => {
  const c = S.read('config', {});
  ['siteName', 'tagline', 'heroTitle', 'heroSub', 'invite', 'mediaChannel', 'memoriesChannel',
    'liveChannel', 'announceChannel', 'dealChannel', 'achievementChannel'].forEach(k => {
    if (req.body[k] !== undefined) c[k] = String(req.body[k]).slice(0, 200);
  });
  c.musicAutoplay = req.body.musicAutoplay === 'on';
  c.musicShuffle = req.body.musicShuffle === 'on';
  if (req.body.scope !== undefined) c.settingsForAdmins = req.body.settingsForAdmins === 'on';
  c.musicVolume = Math.max(0, Math.min(100, Number(req.body.musicVolume) || 12));
  S.write('config', c);
  G.backfillAll();
  Cmd.register();
  res.redirect('/settings/site');
});

app.post('/memories/channel', need('settings'), (req, res) => {
  const c = S.read('config', {});
  c.memoriesChannel = String(req.body.channel || '');
  S.write('config', c);
  G.backfillAll();
  res.redirect('/clips/memories');
});

app.post('/events/slot', need('event'), (req, res) => {
  const slots = S.read('slots', []);
  slots.push({ id: S.id(), label: String(req.body.label || '').slice(0, 60), votes: [] });
  S.write('slots', slots.slice(-12));
  res.redirect('/play/nights');
});

app.post('/events/lock', need('event'), (req, res) => {
  const slots = S.read('slots', []);
  const s = slots.find(x => x.id === req.body.slot);
  if (s) {
    S.write('event', { label: s.label, going: s.votes.slice(), at: Date.now(), host: req.ctx.me.id });
    Stats.recordNight(s.votes, req.ctx.me.id);
    const cfg = config();
    const ch = cfg.announceChannel || cfg.liveChannel || cfg.memoriesChannel || cfg.mediaChannel;
    if (ch) {
      D.post(ch, Embeds.night(S.read('event', {}))).catch(() => {});
    }
    Ach.sweep().catch(() => {});
  }
  res.redirect('/play/nights');
});

app.post('/games/add', need('view'), (req, res) => {
  const lib = S.read('library', []);
  const name = String(req.body.name || '').slice(0, 60).trim();
  if (name && !lib.some(g => g.name.toLowerCase() === name.toLowerCase())) {
    lib.push({ id: S.id(), name: name, owners: [req.ctx.me.id] });
    S.write('library', lib);
  }
  res.redirect('/play/library');
});

/* ---------- json api ---------- */

app.post('/api/session', need('session'), (req, res) => {
  const list = S.read('sessions', []);
  list.unshift({
    id: S.id(),
    game: String(req.body.game || 'Something').slice(0, 50),
    when: String(req.body.when || 'Tonight').slice(0, 40),
    cap: Math.min(16, Math.max(2, Number(req.body.cap) || 4)),
    host: req.ctx.me.id,
    hostName: req.ctx.me.name,
    players: [req.ctx.me.id],
    at: Date.now()
  });
  S.write('sessions', list.slice(0, 20));
  res.json({ ok: true });
});

app.post('/api/session/:id/join', need('view'), (req, res) => {
  const list = S.read('sessions', []);
  const s = list.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false });
  const i = s.players.indexOf(req.ctx.me.id);
  if (i > -1) s.players.splice(i, 1);
  else if (s.players.length < s.cap) s.players.push(req.ctx.me.id);
  S.write('sessions', list);
  res.json({ ok: true, joined: i === -1 });
});

app.post('/api/slot/:id', need('view'), (req, res) => {
  const slots = S.read('slots', []);
  const s = slots.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false });
  const i = s.votes.indexOf(req.ctx.me.id);
  if (i > -1) s.votes.splice(i, 1); else s.votes.push(req.ctx.me.id);
  S.write('slots', slots);
  res.json({ ok: true });
});

app.post('/api/rsvp', need('view'), (req, res) => {
  const ev = S.read('event', null);
  if (!ev) return res.status(404).json({ ok: false });
  ev.going = ev.going || [];
  const i = ev.going.indexOf(req.ctx.me.id);
  if (i > -1) ev.going.splice(i, 1); else ev.going.push(req.ctx.me.id);
  S.write('event', ev);
  res.json({ ok: true });
});

app.post('/api/own/:id', need('view'), (req, res) => {
  const lib = S.read('library', []);
  const g = lib.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false });
  const i = g.owners.indexOf(req.ctx.me.id);
  if (i > -1) g.owners.splice(i, 1); else g.owners.push(req.ctx.me.id);
  S.write('library', lib);
  res.json({ ok: true });
});

/* The site's pin button reacts as the bot, so the pin exists in Discord too
   and survives a restart of this app. */
app.post('/api/pin', need('pin'), async (req, res) => {
  const ch = String(req.body.channel || '');
  const id = String(req.body.message || '');
  const on = req.body.on !== false;
  if (!ch || !id) return res.status(400).json({ ok: false });
  try {
    await D.react(ch, id, G.PIN, !on);
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Discord would not take that: ' + e.message });
  }
  const all = G.messages();
  const m = all.find(x => x.id === id);
  if (m) {
    m.reactions = m.reactions || {};
    m.reactions[G.PIN] = Math.max(0, (m.reactions[G.PIN] || 0) + (on ? 1 : -1));
    if (!m.reactions[G.PIN]) delete m.reactions[G.PIN];
    m.pinned = on;
    S.write('messages', all);
  }
  res.json({ ok: true });
});

/* Pictures and video arrive as the raw request body, so nothing has to be
   base64'd into JSON and video stays a file on disk rather than a data URL. */
/* Lets the page find out whether a POST carrying a binary body reaches us at
   all, separately from whether a big one does. */
app.post('/api/upload/ping', need('view'),
  express.raw({ type: () => true, limit: '1mb' }),
  (req, res) => res.json({ ok: true, got: (req.body && req.body.length) || 0 }));

function slotAllowed(ctx, slot) {
  if (/^banner-/.test(slot)) {
    const uid = slot.slice(7);
    if (uid === String(ctx.me.id).toLowerCase() || ctx.perms.members) return '';
    return 'Not yours to change';
  }
  return ctx.perms.images ? '' : 'Your rank cannot change site pictures';
}

function land(ctx, slot, buf, ct) {
  const out = U.save(slot, buf, ct);
  if (out.error) return out;
  if (/^banner-/.test(slot)) U.setBanner(slot.slice(7), out);
  else U.setSiteImage(slot, out);
  return out;
}

/* Uploads arrive in small pieces rather than one big request. A 60MB body in
   one go has to survive every proxy between the browser and here, and when it
   does not there is nothing to see; in pieces, a stall has a chunk number and
   the log says which one never arrived. */
app.post('/api/upload/chunk', need('view'),
  express.raw({ type: () => true, limit: '8mb' }),
  (req, res) => {
    const slot = U.slotName(req.query.slot);
    const id = String(req.query.id || '');
    const i = Number(req.query.i);
    const n = Number(req.query.n);
    const ct = String(req.query.ct || '');
    const size = Number(req.query.size) || 0;

    if (!slot || !id || !isFinite(i) || !isFinite(n) || n < 1 || i < 0 || i >= n) {
      return res.status(400).json({ ok: false, error: 'Bad upload request' });
    }
    const no = slotAllowed(req.ctx, slot);
    if (no) return res.status(403).json({ ok: false, error: no });

    const cap = U.limitFor(ct);
    if (size > cap) {
      return res.status(413).json({ ok: false, error: 'That file is larger than the server will take.' });
    }

    const got = U.appendPart(id, req.body || Buffer.alloc(0), i === 0);
    if (got.error) return res.status(500).json({ ok: false, error: got.error });
    console.log('[upload] ' + slot + ' chunk ' + (i + 1) + '/' + n + ' (' + got.size + ' bytes so far)');

    if (i < n - 1) return res.json({ ok: true, got: got.size, done: false });

    const buf = U.readPart(id);
    U.dropPart(id);
    if (!buf) return res.status(500).json({ ok: false, error: 'The pieces did not come back together.' });

    const out = land(req.ctx, slot, buf, ct);
    if (out.error) return res.status(400).json({ ok: false, error: out.error });
    console.log('[upload] ' + slot + ' finished, ' + buf.length + ' bytes, ' + out.kind);
    res.json({ ok: true, done: true, url: out.url, kind: out.kind });
  });

app.post('/api/upload', need('view'),
  express.raw({ type: () => true, limit: '66mb' }),
  (req, res) => {
    const slot = U.slotName(req.query.slot);
    if (!slot) return res.status(400).json({ ok: false, error: 'No slot' });
    const ct = req.headers['content-type'] || '';

    /* Your own banner is yours whatever your rank. Everything else on the
       site is a site image and needs that permission. */
    const no = slotAllowed(req.ctx, slot);
    if (no) return res.status(403).json({ ok: false, error: no });

    const out = land(req.ctx, slot, req.body, ct);
    if (out.error) return res.status(400).json({ ok: false, error: out.error });
    res.json({ ok: true, url: out.url, kind: out.kind });
  });

app.get('/api/live', (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ ok: false });
  res.json({
    ok: true,
    status: G.status(),
    roster: G.roster().map(m => {
      const rank = Pages.rankOf(m);
      const live = St.liveFor(m.id);
      return {
        id: m.id,
        name: m.nick || m.global_name || m.username,
        avatar: m.avatar,
        tint: V.tint(m),
        status: m.presence.status || 'offline',
        doing: live ? 'Streaming · ' + (live.game || live.title) : Pages.activityLine(m.presence),
        rank: rank.name,
        colour: rank.colour,
        live: live ? live.platform : null,
        liveUrl: live ? live.url : null
      };
    }),
    voice: G.voiceRooms(),
    live: St.liveList().map(s => ({
      uid: s.uid, platform: s.platform, title: s.title, game: s.game,
      viewers: s.viewers, started: s.started, url: s.url
    })),
    streams: St.status(),
    steam: Steam.status()
  });
});

app.use((req, res) => res.status(404).send('Not found'));

/* Without this an oversized upload falls through to Express's own handler and
   answers with HTML, which the page cannot read, so it looks like a hang. */
app.use((err, req, res, next) => {
  const big = err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413);
  if (!big) console.error('[afterhours]', (err && err.message) || err);
  if (res.headersSent) return next(err);
  res.status(big ? 413 : 500).json({
    ok: false,
    error: big
      ? 'That file is larger than the server will take. Keep video under 64MB.'
      : 'Something went wrong on the server.'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('[afterhours] listening on ' + PORT);
    Storage.report();
    if (!D.configured()) console.log('[afterhours] Discord OAuth not configured yet');
    console.log('[afterhours] site url ' + Site.siteUrl());
    console.log('[afterhours] Discord redirect must be exactly ' + Site.siteUrl() + '/auth/callback');
    G.connect();
    St.start();
    Stats.start();
    Ach.start();
    Steam.start();
    Cmd.register();
    Widget.start();
    Greet.start();
    RR.start();
    ML.start();
    VR.start();
    Board.start();
    FM.start();
    Fc.start();
    Ladder.start();
    G.on('reaction', (d, up) => RR.onReaction(d, up));
    U.sweepParts();
    setInterval(() => U.sweepParts(), 3600000).unref();
  });
}

module.exports = app;
