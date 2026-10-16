const path = require('path');
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
const Storage = require('./lib/storage');

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
  return { me: me, perms: P.forUser(me), cfg: config() };
}

function need(key) {
  return function (req, res, next) {
    const ctx = ctxFor(req);
    if (!ctx.me) return res.redirect('/');
    if (!ctx.perms.view) return res.send(V.gate(ctx.cfg, 'Your rank has no access to this site.', U.siteImage('gate-bg')));
    if (key && !ctx.perms[key]) return res.status(403).send('Your rank cannot do that.');
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
    render(req, res, name, title, fn(req.ctx, sub, req.query));
  });
}

tab('crew', 'Crew', Pages.crew);
tab('clips', 'Clips', Pages.clips);
tab('play', 'Play', Pages.play);
tab('settings', 'Settings', Pages.settings, 'members');

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

app.get('/music.json', need('view'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const c = req.ctx.cfg;
  res.json({
    list: Music.house().list,
    auto: !!c.musicAutoplay,
    vol: Math.max(0, Math.min(100, Number(c.musicVolume) || 12))
  });
});

app.post('/settings/music', need('members'), (req, res) => {
  try {
    const list = Music.setHouse(req.body.list, req.ctx.me);
    res.redirect('/settings/site?music=' + list.length);
  } catch (e) {
    res.redirect('/settings/site?musicerr=' + encodeURIComponent(e.message.slice(0, 120)));
  }
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

app.post('/permissions/toggle', need('roles'), (req, res) => {
  const roles = G.live.roles;
  const top = roles[0];
  const m = P.matrix();
  const rid = req.body.role, key = req.body.key;
  if (!m[rid] || P.KEYS.indexOf(key) === -1) return res.redirect('/settings/perms');
  if (top && rid === top.id) return res.redirect('/settings/perms?role=' + encodeURIComponent(rid));
  m[rid][key] = m[rid][key] ? 0 : 1;
  P.saveMatrix(m);
  res.redirect('/settings/perms?role=' + encodeURIComponent(rid));
});

app.post('/settings', need('members'), (req, res) => {
  const c = S.read('config', {});
  ['siteName', 'tagline', 'heroTitle', 'heroSub', 'invite', 'mediaChannel', 'memoriesChannel',
    'liveChannel', 'announceChannel', 'dealChannel', 'achievementChannel'].forEach(k => {
    if (req.body[k] !== undefined) c[k] = String(req.body[k]).slice(0, 200);
  });
  c.musicAutoplay = req.body.musicAutoplay === 'on';
  c.musicVolume = Math.max(0, Math.min(100, Number(req.body.musicVolume) || 12));
  S.write('config', c);
  G.backfillAll();
  Cmd.register();
  res.redirect('/settings/site');
});

app.post('/memories/channel', need('members'), (req, res) => {
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
      D.post(ch, {
        content: '**' + (cfg.siteName || 'Afterhours') + '** — next night locked in: **' + s.label +
          '**. ' + Site.siteUrl()
      }).catch(() => {});
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
app.post('/api/upload', need('view'),
  express.raw({ type: () => true, limit: '66mb' }),
  (req, res) => {
    const slot = U.slotName(req.query.slot);
    if (!slot) return res.status(400).json({ ok: false, error: 'No slot' });
    const ct = req.headers['content-type'] || '';

    /* Your own banner is yours whatever your rank. Everything else on the
       site is a site image and needs that permission. */
    if (/^banner-/.test(slot)) {
      const uid = slot.slice(7);
      const mine = uid === String(req.ctx.me.id).toLowerCase();
      if (!mine && !req.ctx.perms.members) {
        return res.status(403).json({ ok: false, error: 'Not yours to change' });
      }
    } else if (!req.ctx.perms.images) {
      return res.status(403).json({ ok: false, error: 'Your rank cannot change site pictures' });
    }

    const out = U.save(slot, req.body, ct);
    if (out.error) return res.status(400).json({ ok: false, error: out.error });

    if (/^banner-/.test(slot)) U.setBanner(slot.slice(7), out);
    else U.setSiteImage(slot, out);
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
  });
}

module.exports = app;
