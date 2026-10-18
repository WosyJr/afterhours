const V = require('./views');
const P = require('./perms');
const S = require('./store');
const G = require('./gateway');
const U = require('./uploads');
const SP = require('./streampages');
const St = require('./streams');
const Stats = require('./stats');
const Ach = require('./achievements');
const Steam = require('./steam');
const Cmd = require('./commands');
const Music = require('./music');
const Storage = require('./storage');
const Widget = require('./widget');
const RR = require('./reactroles');
const Greet = require('./greet');
const Staff = require('./staff');
const ML = require('./modlog');
const Cal = require('./calendar');
const Sg = require('./suggest');
const Badges = require('./badges');
const Fc = require('./forecast');
const Ladder = require('./ladder');
const Guests = require('./guests');
const Site = require('./site');
const Push = require('./push');
const Hero = require('./hero');
const Overlay = require('./overlay');
const Voice = require('./voice');
const Radio = require('./radio');
const FA = require('./featart');
const SS = require('./streamstats');
const TC = require('./twitchclips');

const esc = V.esc;

function since(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return 'up ' + m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return 'up ' + h + 'h ' + (m % 60) + 'm';
  return 'up ' + Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

function when(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  const dt = new Date(ts);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function activityLine(pres) {
  if (!pres) return 'Offline';
  const a = pres.activity;
  if (!a) {
    return { online: 'Online', idle: 'Away', dnd: 'Do not disturb', offline: 'Offline' }[pres.status] || 'Offline';
  }
  if (a.type === 4) {
    if (a.state) return a.state;
    return { online: 'Online', idle: 'Away', dnd: 'Do not disturb', offline: 'Offline' }[pres.status] || 'Online';
  }
  const verb = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' }[a.type] || '';
  return (verb ? verb + ' ' : '') + a.name + (a.details ? ' — ' + a.details : '');
}

function rolesOf(member, roles) {
  if (!member || !member.roles || !member.roles.length) return [];
  const P2 = require('./perms');
  const ig = P2.ignored();
  return (roles || G.live.roles || [])
    .filter(r => member.roles.indexOf(r.id) > -1 && r.name !== '@everyone' && ig.indexOf(r.id) === -1)
    .slice()
    .sort((a, b) => b.position - a.position);
}

function rankColour(list, fallback) {
  const hit = list.find(r => r.tinted);
  return (hit && hit.colour) || (fallback && fallback.colour) || '#99A0BB';
}

function rankOf(member, roles) {
  const r = P.topRole({ roles: member.roles }, roles || G.live.roles);
  return r || { name: 'Member', colour: '#9B9BB2', id: null, position: 0 };
}

function profileOf(id) {
  return S.read('profiles', {})[id] || {};
}

function nameOf(uid) { return SP.memberName(uid); }

function shell(tab, title, lede, sub, body, perms) {
  return `<section class="page wrap"><h1 class="ttl">${esc(title)}</h1>
    <p class="lede">${lede}</p>${V.subnav(tab, sub, perms)}${body}</section>`;
}


function home(ctx) {
  const { cfg, perms, me } = ctx;
  const hero = Hero.forHero(cfg, me.id);
  const roster = G.roster();
  const st = G.status();
  const ls = St.liveList();
  const sessions = S.read('sessions', []).filter(s => s.at > Date.now() - 20 * 3600000);
  const slots = S.read('slots', []);
  const nights = Object.values(Stats.all()).reduce((a, s) => Math.max(a, s.nights || 0), 0);

  const sessRows = sessions.length ? sessions.map(s => {
    const n = s.players.length;
    let dots = '';
    for (let i = 0; i < s.cap; i++) dots += `<i class="${i < n ? 'on' : ''}"></i>`;
    const mine = s.players.indexOf(me.id) > -1;
    return `<div class="sess">
      <span class="sico" style="background:${V.tint({ id: s.id })}">${esc(s.game.slice(0, 2).toUpperCase())}</span>
      <span style="flex:1;min-width:140px"><span class="sn">${esc(s.game)}</span>
        <div class="sm">${esc(s.when)} &middot; ${esc(s.hostName)}</div>
        <div class="dots">${dots}<span>${n}/${s.cap}</span></div></span>
      <button class="jb${mine ? ' in' : ''}" data-join="${esc(s.id)}">${mine ? 'Joined' : 'Join +'}</button>
    </div>`;
  }).join('') : '<p class="empty">Nothing on yet. Start something.</p>';

  const here = roster.filter(m => {
    const s = (m.presence && m.presence.status) || 'offline';
    return s !== 'offline' || St.liveFor(m.id);
  });
  const presRows = here.length ? here.map(m => {
    const rank = rankOf(m);
    const status = m.presence.status || 'offline';
    const live = St.liveFor(m.id);
    return `<div class="prow">${V.avatar(m, 36, status)}
      <span style="min-width:0;flex:1"><span class="pn">${esc(m.nick || m.global_name || m.username)}
        <span class="rk" style="color:${rank.colour}">${esc(rank.name.toUpperCase())}</span>${SP.presenceTag(m.id)}</span>
        <span class="pd">${live ? esc('Streaming · ' + (live.game || live.title)) : esc(activityLine(m.presence))}</span></span>
      ${live ? `<a class="jb" href="${esc(live.url)}" target="_blank" rel="noopener">Watch</a>` : ''}</div>`;
  }).join('') : `<p class="empty">${roster.length ? 'Nobody about right now.' : 'Nobody loaded yet. The bot may still be connecting.'}</p>`;

  const rooms = G.voiceRooms();
  const vcRows = rooms.length ? rooms.map(r => {
    const talking = r.people.some(p => !p.mute);
    return `<div class="vch"><div class="vct">
      <span>&#9834; ${esc(r.name)}${talking ? '<span class="bars"><i></i><i></i><i></i></span>' : ''}</span>
      <span class="note">${r.people.length}</span></div>
      <div class="vcw">${esc(r.people.map(p => p.name).join(' & '))}</div></div>`;
  }).join('') : '<p class="empty">Nobody in voice.</p>';

  let best = -1, bi = -1;
  slots.forEach((s, i) => { if (s.votes.length > best) { best = s.votes.length; bi = i; } });
  const total = Math.max(1, roster.length);
  const slotRows = slots.length ? slots.slice(0, 5).map((s, i) => {
    const mine = s.votes.indexOf(me.id) > -1;
    const pct = Math.round((s.votes.length / total) * 100);
    return `<div class="slotwrap">
      <button class="slot${mine ? ' mine' : ''}${i === bi ? ' best' : ''}" data-slot="${esc(s.id)}">
        <span class="f" style="width:${pct}%"></span>
        <span class="sd">${esc(s.label)}</span>
        <span class="sv">${s.votes.length}/${total}${i === bi ? ' &middot; winning' : ''}</span></button>
      ${perms.event ? `<form method="post" action="/events/slot/remove" class="slotdel">
        <input type="hidden" name="slot" value="${esc(s.id)}">
        <button class="slotx" title="Remove this time" aria-label="Remove ${esc(s.label)}">&times;</button>
      </form>` : ''}</div>`;
  }).join('') : '<p class="empty">No times proposed yet. Put one up on the Play tab.</p>';

  const feats = [
    ['\u{1F52E}', 'Looking to play', 'Open a slot for whatever you’re on. Everyone sees the spots left and drops in without asking.', 'feat-1'],
    ['\u{1F3AE}', 'Shared library', 'Every game anyone owns, with who’s got it. No more working out what you can all launch.', 'feat-2'],
    ['\u{1F4C5}', 'Nights that happen', 'Vote on times, RSVP once, and it posts itself to Discord.', 'feat-3']
  ].map(f => {
    const media = U.siteImage(f[3]);
    const live = FA.forSlot(f[3]);
    const inner = live + `<div class="fb">${f[0]}</div><h3 class="ft">${f[1]}</h3>`;
    return `<article class="feat${live ? ' haslive' : ''}${live && media ? ' livebg' : ''}">
      ${V.photo(f[3], '', media, perms.images, inner)}
      <p class="fd">${f[2]}</p></article>`;
  }).join('');

  const warn = !st.ready && st.error
    ? `<div class="banner bad"><span>&#9888;</span><span><b>Discord link down.</b> ${esc(st.error)}</span></div>`
    : '';

  return `<div class="hero">${V.photo('hero', '', U.siteImage('hero'), perms.images)}
  <div class="wrap heroin">
    <p class="kick">Welcome back, ${esc(me.name)}</p>
    <h1>${esc(hero.title)}</h1>
    ${hero.sub ? `<p>${esc(hero.sub)}</p>` : ''}
    <div class="row">
      <a class="btn" href="/play/nights">Make a plan</a>
      <a class="btn ghost" href="/clips/live">See who’s live</a>
    </div>
  </div>
  <span class="scrollcue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
</div>

<section class="page wrap after-hero">
  ${warn}
  <div class="strip">
    <div class="st1"><div class="v"><span class="ldot"></span>${st.online}</div><div class="k">Online now</div></div>
    <div class="st1"><div class="v">${st.members}</div><div class="k">In the crew</div></div>
    <div class="st1"><div class="v">${ls.length}</div><div class="k">Streaming</div></div>
    <div class="st1"><div class="v">${nights}</div><div class="k">Nights logged</div></div>
  </div>
  ${SP.homeLive()}
  <div class="cols">
    <div class="card"><div class="ch"><h2>Playing tonight</h2>
      ${perms.session ? '<button class="btn sm ghost" id="newSess">+ Start one</button>' : ''}</div>
      <div class="cb" id="sessions">${sessRows}</div></div>
    <div class="card"><div class="ch"><h2>Right now</h2><span class="note">live</span></div>
      <div class="cb" id="presence">${presRows}</div></div>
  </div>
  <div class="cols" style="margin-top:14px">
    <div class="card"><div class="ch"><h2>When are we next on?</h2>
      <a class="sb" href="/play/nights">All times</a></div>
      <div class="cb">${slotRows}</div></div>
    <div class="card"><div class="ch"><h2>Voice</h2><span class="note">live</span></div>
      <div class="cb" id="voice">${vcRows}</div></div>
  </div>
  <div class="feats" style="margin-top:14px">${feats}</div>
  ${jukeCard(ctx)}
</section>`;
}


function crewPeople(ctx, q) {
  const { perms, me } = ctx;
  const warn = q && q.e === 'steam'
    ? '<div class="banner bad"><span>&#9888;</span><span>Steam did not recognise that profile. Paste the full <b>steamcommunity.com/profiles/…</b> URL, or your 17-digit SteamID64. A custom name only works if the server has a Steam API key.</span></div>'
    : '';
  const roster = G.roster();
  const order = roster.filter(m => m.id === me.id).concat(roster.filter(m => m.id !== me.id));

  const cards = order.map(m => {
    const rank = rankOf(m);
    const mRoles = rolesOf(m);
    const prof = profileOf(m.id);
    const isme = m.id === me.id;
    const status = m.presence.status || 'offline';
    const off = status === 'offline';
    const sum = Stats.summary(m.id);
    const ss = SS.summaryFor(m.id);
    const inVoice = !!(G.live.voice && G.live.voice[m.id] && G.live.voice[m.id].channel);
    const badges = (prof.badges || []).map(b => `<span class="bdg">${esc(b)}</span>`).join('') +
      Badges.forUser(m.id).map(b => `<span class="bdg ${esc(b.tone)}" title="earned">${esc(b.label)}</span>`).join('');
    const earned = Ach.forUser(m.id).filter(a => a.got);
    const achBadges = earned.slice(0, 3).map(a => `<span class="bdg gold">${a.ico} ${esc(a.n)}</span>`).join('');
    const col = rankColour(mRoles, rank);
    const hasLinks = !!(prof.twitch || prof.youtube || prof.steam);
    const extras = (hasLinks || isme) ? SP.profileBlock(m.id, isme) : '';
    return `<article class="gcard${isme ? ' isme' : ''}${off ? ' off' : ''}" id="${isme ? 'me' : 'u' + m.id}"
      style="--c:${col};--c-hi:${col}3D;--c-lo:${col}17;--c-br:${col}66">
      ${isme ? '<span class="youtag">You</span>' : ''}
      <div class="gface">
        ${V.photo('banner-' + m.id, 'gfacebg', U.bannerOf(m.id), isme || perms.members)}
        <span class="gsheen"></span>
        <a class="gav" href="/crew/stats?who=${esc(m.id)}" style="background:${V.tint(m)}"
          aria-label="${esc(m.nick || m.global_name || m.username)}">${m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : esc(V.initial(m))}
          <span class="st" style="background:${V.DOT[status]}"></span></a>
        ${inVoice ? '<span class="gvoice"><i></i>In voice</span>' : ''}
      </div>
      <div class="gbody">
        <h3 class="gnm">${esc(m.nick || m.global_name || m.username)}</h3>
        <div class="ghd">@${esc(m.username)}</div>
        <div class="rlist">${(mRoles.length ? mRoles : [rank]).map(r => {
          const rc = r.tinted ? r.colour : col;
          return `<span class="rpill" style="color:${rc};background:${rc}1F"><i></i>${esc(r.name)}</span>`;
        }).join('')}</div>
        ${prof.bio ? `<p class="pbio">${esc(prof.bio)}</p>` : ''}
        ${badges || achBadges ? `<div class="badges">${badges}${achBadges}</div>` : ''}
        ${extras ? `<div class="gconn">${extras}</div>` : ''}
      </div>
      ${ss.any ? `<div class="gstream">
        <span class="gsh">${ss.liveSince ? 'Live now' : 'Streamed'}</span>
        <span class="gsv">${esc(SS.dur(ss.minutes))}${ss.peak ? ' &middot; peak ' + ss.peak : ''}${ss.topGame ? ' &middot; ' + esc(ss.topGame) : ''}</span>
      </div>` : ''}
      <div class="gfoot">
        <span class="gnow">${esc(activityLine(m.presence))}</span>
        <span class="gvo">${Stats.dur(sum.voiceMin)}${sum.nights ? ' &middot; ' + sum.nights + 'n' : ''}</span>
      </div>
      ${isme ? `<div class="gme">
        <div class="row">
          <button class="btn sm ghost" id="editMe">Edit profile</button>
          <a class="btn sm ghost" href="/crew/stats?who=${esc(m.id)}">Stats</a>
        </div>
        <form method="post" action="/profiles/me" id="meForm" hidden style="margin-top:11px">
          <label class="fld" for="bio">Your bio</label>
          <textarea id="bio" name="bio" rows="2" maxlength="240">${esc(prof.bio || '')}</textarea>
          <label class="fld" for="badges">Badges, comma separated</label>
          <input type="text" id="badges" name="badges" maxlength="160" value="${esc((prof.badges || []).join(', '))}">
          <button class="btn sm" style="margin-top:10px">Save</button>
        </form>
      </div>` : ''}
    </article>`;
  }).join('');

  const mine = `<div class="card yoursettings"><div class="ch"><h2>Your settings</h2>
      <span class="note">only you see this</span></div>
    <div class="cb">${pushCard(ctx)}</div></div>`;

  return warn + `<div class="grid gcards">${cards || '<p class="empty">Nobody loaded yet.</p>'}</div>${mine}`;
}

function pushCard(ctx) {
  const me = ctx.me;
  const p = Push.prefsFor(me.id);
  const on = Push.ready();
  return `<div id="pushbox" class="pushbox" data-key="${esc(on ? process.env.VAPID_PUBLIC || '' : '')}">
    <div class="pushhead">
      <b>Notifications on this device</b>
      <span class="note">${Push.forUser(me.id).length || 'none'} ${Push.forUser(me.id).length === 1 ? 'device' : 'devices'}</span>
    </div>
    ${on ? `<button type="button" class="btn sm ghost" data-push>Turn notifications on</button>
      <p class="note" data-pushnote hidden></p>
      <form method="post" action="/profiles/push" class="pushprefs">
        <label class="check"><input type="checkbox" name="live" ${p.live ? 'checked' : ''}><span>Someone goes live</span></label>
        <label class="check"><input type="checkbox" name="night" ${p.night ? 'checked' : ''}><span>A night gets locked in</span></label>
        <label class="check"><input type="checkbox" name="deal" ${p.deal ? 'checked' : ''}><span>A wishlist game goes on sale</span></label>
        <label class="check"><input type="checkbox" name="voice" ${p.voice ? 'checked' : ''}><span>People gather in voice</span></label>
        <button class="btn sm" style="margin-top:9px">Save</button>
      </form>
      <p class="note" style="margin-top:9px">On an iPhone you have to add the site to your home screen before the
        browser will allow notifications at all. <a class="lk" href="/help/notifications">How to set this up &rarr;</a></p>`
      : `<p class="note" style="margin:0">Not set up on the server yet. ${esc(Push.why())}
          <a class="lk" href="/help/notifications">What this is &rarr;</a></p>`}
  </div>`;
}

function crewStats(ctx, who) {
  const roster = G.roster();
  const id = (roster.some(m => m.id === who) && who) || ctx.me.id;
  const s = Stats.summary(id);
  const maxG = s.games.length ? s.games[0][1] : 1;

  const picker = '<div class="picker">' + roster.map(m =>
    `<a class="pk${m.id === id ? ' on' : ''}" href="/crew/stats?who=${esc(m.id)}">${V.avatar(m, 24)}${esc(m.nick || m.global_name || m.username)}</a>`).join('') + '</div>';

  const nums = `<div class="bignums">
    <div class="card bn1 lift"><div class="v">${Stats.dur(s.voiceMin)}</div><div class="k">In voice</div><div class="s">${Stats.dur(s.monthMin)} this month</div></div>
    <div class="card bn1 lift"><div class="v">${s.nights}</div><div class="k">Nights</div><div class="s">${s.hosted} hosted</div></div>
    <div class="card bn1 lift"><div class="v">${s.streak}</div><div class="k">Streak</div><div class="s">in a row</div></div>
    <div class="card bn1 lift"><div class="v">${s.clips}</div><div class="k">Clips</div><div class="s">${s.streams} streams</div></div>
  </div>`;

  const gameRows = s.games.length ? s.games.map(g => `<div class="brow">
      <span class="bn">${esc(g[0])}</span><span class="bv">${Stats.dur(g[1])}</span>
      <span class="btrack"><span class="bfill" style="width:${Math.round(g[1] / maxG * 100)}%"></span></span></div>`).join('')
    : '<p class="empty">Nothing yet. Presence is sampled once a minute, so this fills in as you play.</p>';

  const withRows = s.with.length ? s.with.map(w => `<div class="wrow2">
      ${V.avatar(SP.memberOf(w[0]), 30)}<span class="wn2">${esc(nameOf(w[0]))}</span><span class="wv2">${Stats.dur(w[1])}</span></div>`).join('')
    : '<p class="empty">No shared voice time logged yet.</p>';

  const list = Ach.forUser(id);
  const crewSize = Math.max(1, roster.length);
  const achGrid = list.map(a => `<div class="ach ${a.got ? 'got' : 'lk'}">
      <span class="achr">${Ach.rarity(a.k)}/${crewSize}</span>
      <div class="achi">${a.ico}</div><div class="achn">${esc(a.n)}</div><div class="achd">${esc(a.d)}</div>
      ${a.got ? '<div class="achp" style="color:var(--amber)">Earned</div>'
        : `<div class="achb"><i style="width:${Math.round(a.have / a.goal * 100)}%"></i></div>
           <div class="achp">${a.have} / ${a.goal}</div>`}</div>`).join('');

  const boards = [['Time in voice', 'voice', Stats.dur], ['Nights', 'nights', String],
    ['Clips', 'clips', String], ['Hosted', 'hosted', String]].map(b => {
    const rows = Stats.leaderboard(b[1]).slice(0, 6);
    if (!rows.length) return '';
    return `<div><div style="font-size:12.5px;color:var(--faint);margin-bottom:8px">${b[0]}</div><div class="lbd">` +
      rows.map((r, i) => `<div class="lbr"><span class="n">${i + 1}</span>${V.avatar(SP.memberOf(r.id), 30)}
        <span class="nm">${esc(nameOf(r.id))}</span><span class="vv">${b[2](r.v)}</span></div>`).join('') +
      '</div></div>';
  }).join('');

  return picker + nums + `<div class="auto">
    <div class="card"><div class="ch"><h2>Most played</h2><span class="note">from presence</span></div>
      <div class="cb"><div class="barlist">${gameRows}</div></div></div>
    <div class="card"><div class="ch"><h2>Plays most with</h2><span class="note">shared voice</span></div>
      <div class="cb">${withRows}</div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="ch"><h2>Achievements</h2>
    <span class="note">${list.filter(a => a.got).length} of ${list.length}</span></div>
    <div class="cb"><div class="achgrid">${achGrid}</div></div></div>
  ${boards ? `<div class="card" style="margin-top:14px"><div class="ch"><h2>Leaderboards</h2></div>
    <div class="cb"><div class="auto" style="grid-template-columns:repeat(auto-fit,minmax(218px,1fr))">${boards}</div></div></div>` : ''}`;
}

function crewRanks(ctx) {
  const roles = P.visible(G.live.roles);
  const roster = G.roster();
  const m = P.matrix();
  const top = P.topId();
  const hidden = G.live.roles.length - roles.length;

  const rows = roles.map((r, i) => {
    const holders = roster.filter(x => rankOf(x).id === r.id);
    const allowed = r.id === top ? P.KEYS.length : P.KEYS.filter(k => m[r.id] && m[r.id][k]).length;
    return `<div class="rung${holders.length ? '' : ' vac'}">
      <span class="lv">${i + 1}</span>
      <span><span class="rkn" style="color:${r.colour}">${esc(r.name)}</span><br>
        <span class="rkd">${allowed} of ${P.KEYS.length} permissions${r.id === top ? ' · keeps them all' : ''}</span></span>
      <span class="holder">${holders.length
        ? holders.map(h => V.avatar(h, 26)).join('')
        : '<span class="vacl">Nobody</span>'}</span></div>`;
  }).join('');

  const note = hidden && ctx.perms.roles
    ? `<p class="note" style="margin-top:11px">${hidden} role${hidden === 1 ? ' is' : 's are'} hidden from this list.
       Change that in <a class="lk" href="/settings/perms">Settings &rarr; Permissions</a>.</p>` : '';

  return `<div class="card">${rows || '<div class="cb"><p class="empty">Every role is hidden, or none have loaded.</p></div>'}</div>${note}`;
}

function playCalendar(ctx, q) {
  const { me, perms } = ctx;
  const now = new Date();
  let y = Number(q && q.y);
  let mo = Number(q && q.m);
  if (!(y >= 2020 && y <= 2100)) y = now.getFullYear();
  if (!(mo >= 0 && mo <= 11)) mo = now.getMonth();
  const weeks = Cal.monthOf(y, mo);
  const byDay = {};
  Cal.all().forEach(e => { (byDay[e.day] = byDay[e.day] || []).push(e); });

  const MON = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const prev = mo === 0 ? { y: y - 1, m: 11 } : { y: y, m: mo - 1 };
  const next = mo === 11 ? { y: y + 1, m: 0 } : { y: y, m: mo + 1 };

  const grid = `<div class="calhead">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map(d => `<span>${d}</span>`).join('')}</div>
    <div class="calgrid">${weeks.map(w => w.map(d => {
      const list = (byDay[d.iso] || []).sort(Cal.byWhen);
      return `<div class="cald${d.inMonth ? '' : ' out'}${d.isToday ? ' today' : ''}${list.length ? ' has' : ''}">
        <span class="caldn">${d.date}</span>
        ${list.slice(0, 3).map(e => `<a class="calchip" href="#e${esc(e.id)}" title="${esc(e.title)}">
          ${e.time ? `<b>${esc(e.time)}</b> ` : ''}${esc(e.title)}</a>`).join('')}
        ${list.length > 3 ? `<span class="calmore">+${list.length - 3} more</span>` : ''}
      </div>`;
    }).join('')).join('')}</div>`;

  const up = Cal.upcoming(40);
  const cards = up.length ? up.map(e => {
    const going = (e.going || []).indexOf(me.id) > -1;
    const full = e.cap && (e.going || []).length >= e.cap && !going;
    const mine = e.host === me.id;
    return `<div class="card calcard" id="e${esc(e.id)}" style="margin-bottom:11px">
      <div class="ch"><h2>${esc(e.title)}</h2>
        <span class="note">${esc(Cal.label(e.day, e.time))}</span></div>
      <div class="cb">
        <div class="calmeta">
          <span class="calhost">${V.avatar(SP.memberOf(e.host), 22)}<span>${esc(e.hostName || nameOf(e.host))} is hosting</span></span>
          ${e.game ? `<span class="calgame">${esc(e.game)}</span>` : ''}
          <span class="calcount">${(e.going || []).length}${e.cap ? ' / ' + e.cap : ''} going</span>
        </div>
        ${e.note ? `<p class="calnote">${esc(e.note)}</p>` : ''}
        <div class="calwho">${(e.going || []).map(id =>
          `<span class="calav" title="${esc(nameOf(id))}">${V.avatar(SP.memberOf(id), 24)}</span>`).join('') ||
          '<span class="note">Nobody yet.</span>'}</div>
        <div class="srow">
          <form method="post" action="/calendar/rsvp">
            <input type="hidden" name="id" value="${esc(e.id)}">
            <input type="hidden" name="on" value="${going ? '0' : '1'}">
            <button class="btn sm${going ? ' good' : ''}"${full ? ' disabled' : ''}>${
              going ? 'You&rsquo;re going' : full ? 'Full' : 'I&rsquo;m in'}</button></form>
          ${mine || perms.staff ? `<form method="post" action="/calendar/remove">
            <input type="hidden" name="id" value="${esc(e.id)}">
            <button class="btn sm ghost">Remove</button></form>` : ''}
        </div>
      </div></div>`;
  }).join('') : '<div class="card"><div class="cb"><p class="empty">Nothing on the calendar yet. Put something up.</p></div></div>';

  const err = q && q.e ? `<div class="banner bad" style="margin-bottom:14px"><span>&#9888;</span><span>${esc(q.e)}</span></div>` : '';

  const form = perms.session ? `<form method="post" action="/calendar/add" class="card" style="margin-bottom:14px">
    <div class="ch"><h2>Host something</h2><span class="note">anyone can put a night up</span></div>
    <div class="cb">
      <div class="two">
        <div><label class="fld" for="calday">Date</label>
          <input type="date" id="calday" name="day" value="${esc(Cal.today())}" required></div>
        <div><label class="fld" for="caltime">Time &mdash; 24 hour, optional</label>
          <input type="text" id="caltime" name="time" placeholder="20:30" maxlength="5"></div>
      </div>
      <label class="fld" for="caltitle">What is it</label>
      <input type="text" id="caltitle" name="title" placeholder="Lethal Company night" maxlength="80" required>
      <div class="two" style="margin-top:12px">
        <div><label class="fld" for="calgame">Game, optional</label>
          <input type="text" id="calgame" name="game" placeholder="Lethal Company" maxlength="60"></div>
        <div><label class="fld" for="calcap">How many spots, 0 for open</label>
          <input type="text" id="calcap" name="cap" placeholder="4" maxlength="2"></div>
      </div>
      <label class="fld" for="calnote">Anything else</label>
      <input type="text" id="calnote" name="note" placeholder="Bring a mic" maxlength="200">
      <button class="btn sm" style="margin-top:12px">Put it up</button>
    </div></form>` : '';

  return err + `<div class="card" style="margin-bottom:14px">
      <div class="ch"><h2>${MON[mo]} ${y}</h2>
        <span class="calnav">
          <a class="btn sm ghost" href="/play/calendar?y=${prev.y}&m=${prev.m}">&larr;</a>
          <a class="btn sm ghost" href="/play/calendar">Today</a>
          <a class="btn sm ghost" href="/play/calendar?y=${next.y}&m=${next.m}">&rarr;</a></span></div>
      <div class="cb">${grid}</div></div>
    ${form}
    <h2 class="sech">What&rsquo;s coming up</h2>
    ${cards}`;
}

function crewStaff(ctx, q) {
  const rows = Staff.everyone();
  const ml = ML.recent(25);
  const cfg = ctx.cfg;

  const done = q && q.done
    ? `<div class="banner" style="margin-bottom:14px"><span>&#10003;</span><span>${
        q.done === 'warn' ? 'Warning removed.' : q.done === 'note' ? 'Note removed.' : 'Done.'}</span></div>`
    : '';

  const people = rows.length ? rows.map(r => {
    const warns = r.warns.map((w, i) => `<div class="slog">
      <span class="sidx">${i + 1}</span>
      <span class="stxt">${esc(w.reason)}</span>
      <span class="swho">${esc(w.byName || 'staff')} &middot; ${when(w.at)}</span>
      <form method="post" action="/staff/unwarn" class="sdel">
        <input type="hidden" name="who" value="${esc(r.id)}">
        <input type="hidden" name="which" value="${i + 1}">
        <button class="btn sm ghost" title="Remove this warning">Remove</button></form>
    </div>`).join('');
    const notes = r.notes.map((n, i) => `<div class="slog note">
      <span class="sidx">${i + 1}</span>
      <span class="stxt">${esc(n.text)}</span>
      <span class="swho">${esc(n.byName || 'staff')} &middot; ${when(n.at)}</span>
      <form method="post" action="/staff/delnote" class="sdel">
        <input type="hidden" name="who" value="${esc(r.id)}">
        <input type="hidden" name="which" value="${i + 1}">
        <button class="btn sm ghost" title="Remove this note">Remove</button></form>
    </div>`).join('');
    return `<div class="card" style="margin-bottom:12px">
      <div class="ch"><h2>${esc(nameOf(r.id))}</h2>
        <span class="note">${r.warns.length} warning${r.warns.length === 1 ? '' : 's'} &middot; ${r.notes.length} note${r.notes.length === 1 ? '' : 's'}</span></div>
      <div class="cb">
        ${warns || '<p class="note" style="margin:0 0 8px">No warnings.</p>'}
        ${notes}
        ${r.warns.length || r.notes.length ? `<div class="srow">
          ${r.warns.length ? `<form method="post" action="/staff/unwarn">
            <input type="hidden" name="who" value="${esc(r.id)}">
            <button class="btn sm ghost">Clear all warnings</button></form>` : ''}
          ${r.notes.length ? `<form method="post" action="/staff/delnote">
            <input type="hidden" name="who" value="${esc(r.id)}">
            <button class="btn sm ghost">Clear all notes</button></form>` : ''}
        </div>` : ''}
      </div></div>`;
  }).join('') : '<div class="card"><div class="cb"><p class="empty">Nobody has a warning or a note against them.</p></div></div>';

  const logRows = ml.length ? ml.map(x => {
    const k = ML.KINDS[x.kind] || { word: x.kind, icon: '\u2022' };
    const who = x.whoName || (x.who ? nameOf(x.who) : '');
    return `<div class="mlrow">
      <span class="mlk">${k.icon}</span>
      <span class="mlw"><b>${esc(k.word)}</b>${who ? ' &middot; ' + esc(who) : ''}
        ${x.detail ? `<span class="mld">${esc(String(x.detail).slice(0, 140))}</span>` : ''}</span>
      <span class="mlt">${x.byName ? esc(x.byName) + ' &middot; ' : ''}${when(x.at)}</span>
    </div>`;
  }).join('') : '<p class="empty">Nothing logged yet.</p>';

  const chan = cfg.logChannel
    ? `<span class="note">posting to #${esc((G.live.channels[cfg.logChannel] || {}).name || 'a channel')}</span>`
    : '<span class="note">no log channel set</span>';

  return done + `<div class="banner" style="margin-bottom:14px"><span>&#128737;</span><span>
      Only ranks with <b>Staff tools</b> can see this page. Change that in
      <a class="lk" href="/settings/perms">Settings &rarr; Permissions</a>.</span></div>
    ${people}
    <div class="card" style="margin-top:16px"><div class="ch"><h2>Staff log</h2>${chan}</div>
      <div class="cb">${logRows}</div></div>`;
}

function crew(ctx, sub, q) {
  if (sub === 'staff' && !ctx.perms.staff) return null;
  const body = sub === 'stats' ? crewStats(ctx, q && q.who)
    : sub === 'ranks' ? crewRanks(ctx)
    : sub === 'staff' ? crewStaff(ctx, q)
    : crewPeople(ctx, q);
  return shell('crew', 'Crew', 'Everyone in the server, what they’re up to, and how the ranks sit.', sub, body, ctx.perms);
}


function channelName(id) {
  const c = G.live.channels[id];
  return c ? c.name : 'channel';
}

function reactsOf(m, perms) {
  const r = m.reactions || {};
  const pinned = r[G.PIN] > 0 || m.pinned;
  const chips = Object.keys(r)
    .filter(k => !(perms.pin && k === G.PIN))
    .map(k => `<span class="react">${esc(k)} ${r[k]}</span>`).join('');
  if (!perms.pin) return chips + (pinned ? '<span class="pin" style="margin-left:auto">Pinned</span>' : '');
  return chips + `<button class="react${pinned ? ' on' : ''}" data-pin="${esc(m.channel)}|${esc(m.id)}|${pinned ? 'off' : 'on'}">` +
    `${G.PIN} ${pinned ? 'Pinned' + (r[G.PIN] > 1 ? ' · ' + r[G.PIN] : '') : 'Pin'}</button>`;
}

function clipsMedia(ctx) {
  const { cfg, perms } = ctx;
  const list = G.messages().filter(m => m.kind === 'media');

  const cards = list.map(m => {
    const att = (m.attachments || [])[0] || null;
    const vid = att && att.video ? att.url : null;
    const img = att && att.image ? att.url : ((m.embeds || [])[0] || null);
    const inner = vid ? '<span class="pill">Clip</span>' : '<span class="pill">Screenshot</span>';
    const media = vid
      ? `<video src="${esc(vid)}" controls playsinline preload="metadata"></video>`
      : V.photo('msg-' + m.id, 'thumb', img ? { url: img, kind: 'img' } : null, false, inner);
    return `<article class="card lift">${media}
      <div class="cap"><p>${esc(m.text || att && att.name || '')}</p>
        <div class="cm">${esc(m.author.name)} &middot; ${esc(when(m.at))} <span class="src">#${esc(channelName(m.channel))}</span></div>
        <div class="reacts">${reactsOf(m, perms)}</div></div></article>`;
  }).join('');

  const gate = perms.post ? '' :
    '<div class="banner warn"><span>&#128274;</span><span>Your rank can look but not post here.</span></div>';

  return gate + `<div class="grid">${cards || `<p class="empty">Nothing mirrored yet. ${cfg.mediaChannel ? 'Post something in #' + esc(channelName(cfg.mediaChannel)) + ' and it lands here.' : 'Pick a channel on the Settings tab.'}</p>`}</div>`;
}

function clipsMemories(ctx) {
  const { cfg, perms } = ctx;
  const all = G.messages().filter(m => m.kind === 'memories');
  const list = cfg.pinOnly === false ? all : all.filter(m => m.pinned);
  const chans = Object.values(G.live.channels).filter(c => c.type === 0).sort((a, b) => a.name.localeCompare(b.name));

  const picker = `<div class="card" style="margin-bottom:14px"><div class="chanbar">
    <form method="post" action="/memories/channel" class="chpick">
      <span class="hash">#</span>
      <select name="channel" ${perms.members ? '' : 'disabled'} onchange="this.form.submit()">
        ${chans.map(c => `<option value="${esc(c.id)}"${c.id === cfg.memoriesChannel ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </form>
    <span style="font-size:13px;color:var(--dim)">Only posts with ${esc(G.PIN)} are kept</span>
    <span class="sync"><span class="spin"></span><span>${G.status().ready ? 'Watching live' : 'Bot offline'}</span></span>
  </div></div>`;

  const cards = list.map(m => {
    const att = (m.attachments || [])[0] || null;
    const vid = att && att.video ? att.url : null;
    const img = att && att.image ? att.url : ((m.embeds || [])[0] || null);
    const media = vid ? `<video src="${esc(vid)}" controls playsinline preload="metadata"></video>`
      : img ? V.photo('msg-' + m.id, 'thumb', { url: img, kind: 'img' }, false, '') : '';
    return `<article class="msg">
      <div class="mh">${V.avatar({ id: m.author.id, avatar: m.author.avatar, name: m.author.name }, 30)}
        <span><span class="mw">${esc(m.author.name)}</span><br>
        <span class="mt">#${esc(channelName(m.channel))} &middot; ${esc(when(m.at))}</span></span></div>
      ${m.text ? `<p class="mtx">${esc(m.text)}</p>` : ''}
      ${media}
      <div class="mf">${reactsOf(m, perms)}</div>
    </article>`;
  }).join('');

  return picker + `<div class="grid">${cards || `<p class="empty">Nothing pinned yet. React with ${esc(G.PIN)} in that channel, or use /quote in Discord.</p>`}</div>`;
}

function clipsTwitch(ctx) {
  const list = TC.list(36);
  if (!TC.configured()) {
    return '<p class="empty">Twitch is not configured, so clips cannot be pulled. Add the Twitch client id and secret on the server.</p>';
  }
  if (!list.length) {
    return '<p class="empty">No clips pulled yet. They arrive on their own once someone has clips on a linked Twitch channel.</p>';
  }
  const cards = list.map(c => `<article class="card lift clipcard">
    <a class="clipthumb" href="${esc(c.url)}" target="_blank" rel="noopener">
      ${c.thumb ? `<img src="${esc(TC.thumbOf(c))}" alt="" loading="lazy" decoding="async">` : ''}
      <span class="pill">${esc(String(c.seconds || 0))}s</span>
      <span class="clipplay" aria-hidden="true"></span>
    </a>
    <div class="cap"><p>${esc(c.title)}</p>
      <div class="cm">${esc(SP.memberName(c.uid) || '')}${c.creator ? ' &middot; clipped by ' + esc(c.creator) : ''}
        <span class="src">${esc(String(c.views))} views &middot; ${esc(when(c.at))}</span></div>
    </div></article>`).join('');
  return `<div class="grid">${cards}</div>`;
}

function clips(ctx, sub, q) {
  const body = sub === 'memories' ? clipsMemories(ctx)
    : sub === 'live' ? SP.livePane(ctx, q && q.watch)
      : sub === 'twitch' ? clipsTwitch(ctx)
        : clipsMedia(ctx);
  return shell('clips', 'Clips', 'Everything mirrored out of Discord, plus whoever’s streaming.', sub, body, ctx.perms);
}


function playNights(ctx) {
  const { perms, me } = ctx;
  const ev = S.read('event', null);
  const slots = S.read('slots', []);
  const total = Math.max(1, G.roster().length);

  let best = -1, bi = -1;
  slots.forEach((s, i) => { if (s.votes.length > best) { best = s.votes.length; bi = i; } });

  const slotRows = slots.length ? slots.map((s, i) => {
    const mine = s.votes.indexOf(me.id) > -1;
    const pct = Math.round((s.votes.length / total) * 100);
    return `<div class="slotwrap">
      <button class="slot${mine ? ' mine' : ''}${i === bi ? ' best' : ''}" data-slot="${esc(s.id)}">
        <span class="f" style="width:${pct}%"></span>
        <span class="sd">${esc(s.label)}</span>
        <span class="sv">${s.votes.length}/${total}${i === bi ? ' &middot; winning' : ''}</span></button>
      ${perms.event ? `<form method="post" action="/events/slot/remove" class="slotdel">
        <input type="hidden" name="slot" value="${esc(s.id)}">
        <button class="slotx" title="Remove this time" aria-label="Remove ${esc(s.label)}">&times;</button>
      </form>` : ''}</div>`;
  }).join('') : '<p class="empty">No times proposed yet.</p>';

  const rsvps = ev ? (ev.going || []).map(id => `<div class="prow" style="padding:6px 9px">
      ${V.avatar(SP.memberOf(id), 28)}<span class="pn" style="font-size:14px">${esc(nameOf(id))}</span>
      <span style="margin-left:auto;font-size:12.5px;color:var(--lime)">Going</span></div>`).join('') : '';

  const going = ev && (ev.going || []).indexOf(me.id) > -1;

  const fc = Fc.best(3, 3);
  const cov = Fc.coverage();
  const forecast = `<div class="card" style="margin-bottom:14px">
    <div class="ch"><h2>When you are actually on</h2>
      <span class="note">${cov.samples ? 'from ' + cov.samples + ' readings' : 'still learning'}</span></div>
    <div class="cb">
      ${fc.length ? fc.map(f => `<div class="fcrow">
        <span class="fcl">${esc(Fc.label(f))}</span>
        <span class="fcn">usually ${f.typical}${f.best > f.typical ? ', up to ' + f.best : ''} of you</span>
        <span class="fcbar" title="${Math.round(f.confidence * 100)}% confidence"><i style="width:${Math.round(f.confidence * 100)}%"></i></span>
      </div>`).join('') + `<p class="note" style="margin-top:10px">Worked out from who has actually been in voice, not from
        who said they would be. The bar is how much history is behind each one.</p>`
        : `<p class="empty">Not enough history yet. The site takes a reading every ten minutes that anyone is in voice,
          and starts making predictions after a few evenings.</p>`}
    </div></div>`;

  return forecast + `<div class="cols">
    <div class="card"><div class="ch"><h2>Proposed times</h2><span class="note">tap any that work</span></div>
      <div class="cb">${slotRows}
        ${perms.event ? `<form method="post" action="/events/slot" style="margin-top:10px">
          <input type="text" name="label" placeholder="Add a time, e.g. Fri 8pm" maxlength="60" required>
          <button class="btn sm" style="margin-top:8px">Add time</button></form>
          ${bi > -1 ? `<form method="post" action="/events/lock" style="margin-top:8px">
            <input type="hidden" name="slot" value="${esc(slots[bi].id)}">
            <button class="btn sm" style="width:100%">Lock in "${esc(slots[bi].label)}" &amp; post to Discord</button></form>` : ''}` : ''}
      </div></div>
    <div class="card"><div class="ch"><h2>${ev ? esc(ev.label) : 'Nothing locked in'}</h2>
      ${ev ? '<span class="note">locked in</span>' : ''}</div>
      <div class="cb">
        ${V.photo('event', 'thumb', U.siteImage('event'), perms.images,
          ev ? `<h3 class="ft" style="font-size:1.05rem">${esc(ev.label)}</h3>` : '')}
        <div style="margin-top:12px">${rsvps || '<p class="empty">No RSVPs yet.</p>'}</div>
        ${ev ? `<button class="btn ${going ? 'lime' : 'ghost'}" style="width:100%;margin-top:11px" data-rsvp="1">${going ? 'You’re going' : 'Count me in'}</button>` : ''}
      </div></div>
  </div>`;
}

function playLibrary(ctx, q) {
  const { me } = ctx;
  const lib = S.read('library', []);
  const roster = G.roster();
  const n = roster.length;

  const items = lib.map(g => {
    const owners = g.owners || [];
    const mins = g.appid ? Sg.totalMinutes(g.appid) : null;
    return {
      id: g.id,
      name: g.name,
      appid: g.appid || '',
      owners: owners,
      have: owners.length,
      mine: owners.indexOf(me.id) > -1,
      minutes: mins,
      never: g.appid && mins === 0
    };
  });

  const GROUPS = [
    { k: 'all', n: 'Everyone owns it', tone: 'lime', open: true,
      hit: x => n > 0 && x.have >= n },
    { k: 'one', n: 'One of you short', tone: 'amber', open: false,
      hit: x => n > 1 && x.have === n - 1 },
    { k: 'some', n: 'Some of you', tone: '', open: false,
      hit: x => x.have > 1 },
    { k: 'solo', n: 'Only one of you owns it', tone: '', open: false,
      hit: x => x.have === 1 },
    { k: 'none', n: 'Nobody has claimed it', tone: '', open: false,
      hit: () => true }
  ];

  const buckets = {};
  GROUPS.forEach(g => { buckets[g.k] = []; });
  items.forEach(x => {
    const g = GROUPS.find(gr => gr.hit(x));
    buckets[g.k].push(x);
  });
  Object.keys(buckets).forEach(k => {
    buckets[k].sort((a, b) => b.have - a.have ||
      (b.minutes || 0) - (a.minutes || 0) ||
      a.name.localeCompare(b.name));
  });

  function dots(x) {
    return roster.map(m => {
      const has = x.owners.indexOf(m.id) > -1;
      return `<span class="ow${has ? '' : ' no'}" style="${has ? 'background:' + V.tint(m) : ''}" title="${esc(m.username)}">${m.avatar && has ? `<img src="${esc(m.avatar)}" alt="">` : esc(V.initial(m))}</span>`;
    }).join('');
  }

  function row(x) {
    const hours = x.minutes === null ? '' : Sg.dur(x.minutes);
    return `<div class="gr" data-name="${esc(x.name.toLowerCase())}"
        data-mine="${x.mine ? 1 : 0}" data-never="${x.never ? 1 : 0}"
        data-all="${n > 0 && x.have >= n ? 1 : 0}">
      <span class="gcap">${x.appid
        ? `<img loading="lazy" src="https://cdn.cloudflare.steamstatic.com/steam/apps/${esc(x.appid)}/capsule_231x87.jpg" alt="">`
        : '<i>\u2014</i>'}</span>
      <span class="gnm">${esc(x.name)}</span>
      <span class="gow">${dots(x)}</span>
      <span class="ghv${n > 0 && x.have >= n ? ' all' : ''}">${x.have} of ${n || x.have}</span>
      <span class="ghr${x.never ? ' never' : ''}">${hours || '&mdash;'}</span>
      <button class="gmine${x.mine ? ' on' : ''}" data-own="${esc(x.id)}"
        title="${x.mine ? 'You own it' : 'Mark that you own it'}">${x.mine ? '&#10003;' : '+'}</button>
    </div>`;
  }

  const groups = GROUPS.filter(g => buckets[g.k].length).map(g => `<section class="ggrp" data-grp="${g.k}">
    <button type="button" class="ghead${g.tone ? ' ' + g.tone : ''}${g.open ? ' open' : ''}" data-grphead>
      <span class="gcar"></span><b>${g.n}</b><span class="note">${buckets[g.k].length} game${buckets[g.k].length === 1 ? '' : 's'}</span>
    </button>
    <div class="gbody"${g.open ? '' : ' hidden'}>${buckets[g.k].map(row).join('')}</div>
  </section>`).join('');

  const counts = {
    all: items.length,
    everyone: items.filter(x => n > 0 && x.have >= n).length,
    never: items.filter(x => x.never).length,
    missing: items.filter(x => !x.mine).length,
    mine: items.filter(x => x.mine).length
  };

  const toolbar = `<div class="gtools">
    <label class="gsearch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="libq" placeholder="Search ${items.length} game${items.length === 1 ? '' : 's'}&hellip;" autocomplete="off">
    </label>
    <button type="button" class="gchip on" data-f="all">All <b>${counts.all}</b></button>
    <button type="button" class="gchip" data-f="everyone">Everyone owns <b>${counts.everyone}</b></button>
    <button type="button" class="gchip" data-f="never">Never played <b>${counts.never}</b></button>
    <button type="button" class="gchip" data-f="missing">I&rsquo;m missing <b>${counts.missing}</b></button>
    <button type="button" class="gchip" data-f="mine">I own <b>${counts.mine}</b></button>
  </div>`;

  const now = Sg.whatNow(null, 3);
  const nowCard = `<div class="card" style="margin-bottom:14px">
    <div class="ch"><h2>What you could play right now</h2>
      <span class="note">${now.who.length ? now.who.length + ' in voice' : 'nobody in voice'}</span></div>
    <div class="cb">
      ${now.who.length ? (now.picks.length ? now.picks.map((p, i) => `<div class="pick">
        <span class="pickn">${i + 1}</span>
        <span class="pickt">${esc(p.name)}</span>
        <span class="note">${p.missing === 0
          ? 'all ' + now.who.length + ' own it'
          : p.have.length + ' of ' + now.who.length + ' own it'}${
          p.minutes === null ? '' : ' &middot; ' + Sg.dur(p.minutes) + ' between you'}</span>
        ${p.appid ? `<a class="btn sm ghost" href="https://store.steampowered.com/app/${esc(p.appid)}" target="_blank" rel="noopener">Store</a>` : ''}
      </div>`).join('') : '<p class="empty">Nothing in the library is owned by enough of the people in voice.</p>')
        : '<p class="empty">Nobody is in a voice channel. This fills in the moment somebody joins.</p>'}
    </div></div>`;

  return nowCard + `<div class="card" id="lib">
    <div class="ch"><h2>The library</h2><span class="note">${items.length} game${items.length === 1 ? '' : 's'}</span></div>
    <div class="cb">
      ${items.length ? toolbar + `<div class="glist">${groups}</div>
        <p class="gnone" hidden>Nothing matches that.</p>`
        : '<p class="empty">Nothing in the library yet. Scan a Steam account below, or add one by hand.</p>'}
      <form method="post" action="/games/add" style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
        <input type="text" name="name" placeholder="Add a game by hand" maxlength="60" required style="flex:1;min-width:180px">
        <button class="btn sm">Add</button>
      </form>
    </div></div>
  ${scanCard(ctx, q)}`;
}

function scanCard(ctx, q) {
  const { me, perms } = ctx;
  const prof = profileOf(me.id);
  const profs = S.read('profiles', {});
  const roster = G.roster();

  const msg = q && q.scan
    ? `<div class="banner"><span>&#10003;</span><span>${esc(q.scan)}</span></div>`
    : q && q.scanerr
      ? `<div class="banner bad"><span>&#9888;</span><span>${esc(q.scanerr)}</span></div>`
      : '';

  function row(id, label, avatar, steam, isMe) {
    const ls = Steam.lastScan(id);
    return `<form method="post" action="/games/scan" class="scanrow">
      <input type="hidden" name="who" value="${esc(id)}">
      <span class="scanwho">${avatar}<b>${esc(label)}</b></span>
      <input type="text" name="steam" placeholder="SteamID64 or profile URL"
        value="${esc(steam || '')}" maxlength="120"${isMe ? '' : ''}>
      <span class="note scanlast">${ls ? ls.total + ' read, ' + ls.added + ' new' : steam ? 'not scanned yet' : 'no ID yet'}</span>
      <span class="scanbtns">
        <button class="btn sm" name="played" value="on" title="Skip anything they have never launched">Scan played</button>
        <button class="btn sm ghost" name="played" value="" title="Everything on the account">All</button>
      </span></form>`;
  }

  const mineRow = row(me.id, 'You', V.avatar(SP.memberOf(me.id), 26), prof.steam, true);
  const others = perms.members
    ? roster.filter(m => m.id !== me.id)
      .map(m => row(m.id, m.username, V.avatar(m, 26), (profs[m.id] || {}).steam, false)).join('')
    : '';

  return `<div class="card" style="margin-top:14px" id="scan">
    <div class="ch"><h2>Pull libraries in from Steam</h2>
      <span class="note">${perms.members ? 'yours and anyone else&rsquo;s' : 'yours'}</span></div>
    <div class="cb">
      ${msg}
      <p class="note" style="margin:0 0 14px">Reads an account&rsquo;s games and folds them into the list above, marking
        that person as an owner. Nothing is ever removed. A SteamID64 is the 17-digit number &mdash; pasting their profile
        URL works too, and it gets saved to their profile. The Steam profile and its <b>Game details</b> both have to be
        public. <b>Scan played</b> skips anything never launched; <b>All</b> takes the lot, bundle leftovers included.</p>
      ${mineRow}
      ${perms.members ? `<p class="note" style="margin:16px 0 10px;padding-top:13px;border-top:1px solid var(--line)">
        Anyone else &mdash; fill in an ID and scan it for them.</p>${others}` : ''}
    </div></div>`;
}

function playDeals(ctx) {
  const { me } = ctx;
  const deals = Steam.deals();
  const all = Steam.overlap().sort((a, b) =>
    (b.who.length - a.who.length) || ((b.price && b.price.cut || 0) - (a.price && a.price.cut || 0)));
  const st = Steam.status();
  const mine = profileOf(me.id).steam || '';

  const faces = who => who.map(uid => {
    const m = SP.memberOf(uid);
    return `<span class="ow" style="background:${V.tint(m)}" title="${esc(nameOf(uid))}">${m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : esc(V.initial(m))}</span>`;
  }).join('');

  const dealCards = deals.length ? deals.map((w, i) => `<article class="deal${i === 0 ? ' hot' : ''}">
      ${V.photo('steam-' + w.appid, 'dsh', w.capsule ? { url: w.capsule, kind: 'img' } : null, false,
        `<span class="onair" style="background:var(--lime);color:#06210C">-${w.price.cut}%</span>`)}
      <div class="dbody"><p class="dn">${esc(w.name)}</p>
        <div class="price"><span class="pcut">-${w.price.cut}%</span>
          <span class="pold">${Steam.money(w.price.initial, w.price.currency)}</span>
          <span class="pnew">${Steam.money(w.price.final, w.price.currency)}</span></div>
        <div class="dwho"><span class="owners">${faces(w.who)}</span><span>${w.who.length} of you want this</span></div></div>
      <div class="dact"><a class="btn sm steam" href="https://store.steampowered.com/app/${esc(w.appid)}" target="_blank" rel="noopener">View on Steam</a></div>
    </article>`).join('') : '<p class="empty">Nothing two or more of you want is on sale.</p>';

  const wishRows = all.length ? all.slice(0, 40).map(w => `<div class="wrow">
      <span class="wname">${esc(w.name)}</span>
      <span class="owners">${faces(w.who)}</span>
      ${w.who.length >= 2 ? `<span class="wct">${w.who.length} want it</span>` : ''}
      <span class="wpr${w.price && w.price.cut ? ' cut' : ''}">${w.price ? Steam.money(w.price.final, w.price.currency) + (w.price.cut ? ' (-' + w.price.cut + '%)' : '') : '—'}</span>
    </div>`).join('') : '<p class="empty">No wishlists linked yet.</p>';

  const privateNote = st.privateOnes
    ? `<div class="banner warn"><span>&#128274;</span><span>${st.privateOnes} linked ${st.privateOnes === 1 ? 'profile is' : 'profiles are'} set to private on Steam, so nothing can be read from ${st.privateOnes === 1 ? 'it' : 'them'}. Both the profile and its <b>Game details</b> have to be public.</span></div>`
      + (st.unreadable ? `<div class="banner warn" style="margin-top:9px"><span>&#9888;</span><span>${st.unreadable} public ${st.unreadable === 1 ? 'profile' : 'profiles'} could not be read just now &mdash; Steam would not hand the wishlist over. The last one read is still being used.</span></div>` : '')
    : '';

  return `<div class="card" style="margin-bottom:14px;border-color:rgba(74,222,128,.3)">
    <div class="ch"><h2>On sale now</h2><span class="note">anything any of you wishlisted</span></div>
    <div class="cb">${dealCards}</div></div>
  ${privateNote}
  <div class="card"><div class="ch"><h2>Wishlists</h2>
    <span class="note">${st.linked} linked${st.checkedAt ? ' · checked ' + SP.uptime(st.checkedAt) + ' ago' : ' · not checked yet'}</span></div>
    <div class="cb">${wishRows}
      <p class="note" style="margin-top:11px">${mine
        ? 'Your Steam profile is linked. Change it on <a class="lk" href="/crew/people#me">your profile</a>.'
        : '<a class="lk" href="/crew/people#me">Link your Steam profile</a> and whatever you have wishlisted joins this list.'}
        It has to be public for anything to be read.${st.keyed ? '' : ' Without a Steam API key on the server, paste the full profile URL or your SteamID64 rather than a custom name.'}</p>
    </div></div>`;
}

function play(ctx, sub, q) {
  const body = sub === 'library' ? playLibrary(ctx, q)
    : sub === 'deals' ? playDeals(ctx)
    : sub === 'calendar' ? playCalendar(ctx, q)
    : playNights(ctx);
  return shell('play', 'Play', 'When you’re next on, what you can all launch, and what’s cheap right now.', sub, body, ctx.perms);
}


function chanSelect(name, label, chans, current) {
  return `<label class="fld" for="${name}">${label}</label>
    <select class="fullsel" id="${name}" name="${name}">
      <option value="">&mdash; none &mdash;</option>
      ${chans.map(c => `<option value="${esc(c.id)}"${c.id === current ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}
    </select>`;
}

function roleSelect(name, label, roles, current, none) {
  return `<label class="fld" for="${name}">${label}</label>
    <select class="fullsel" id="${name}" name="${name}">
      <option value="">&mdash; ${none || 'no ping'} &mdash;</option>
      ${roles.map(r => `<option value="${esc(r.id)}"${r.id === current ? ' selected' : ''}>@${esc(r.name)}</option>`).join('')}
    </select>`;
}


function radioCard(ctx, q) {
  const st = Radio.status();
  const here = (q && q.deck === 'safe') ? 'safe' : 'crew';
  const list = Radio.inDeck(here);
  const c = st.counts;
  const D = Radio.DECKS[here];
  const safe = here === 'safe';

  const tabs = ['crew', 'safe'].map(d => `<a class="dtab${d === here ? ' on' : ''}" href="/settings/site?deck=${d}#radiocard">
      ${esc(Radio.DECKS[d].name)}<span>${c[d]}</span></a>`).join('');

  return `<div class="card" style="margin-top:14px" id="radiocard">
    <div class="ch"><h2>The radio</h2>
      <span class="note">on air: ${esc(st.deckName)}${st.on ? ' &middot; playing' : ''}</span></div>
    <div class="cb">
      ${q && q.radio ? '<div class="banner"><span>&#10003;</span><span>Track removed.</span></div>' : ''}
      <div class="dtabs">${tabs}</div>
      <div class="deckwrap${safe ? ' safe' : ''}">
        <p class="decknote">${safe
          ? '<b>Stream safe.</b> Only put tracks in here that are licensed for broadcast &mdash; StreamBeats, NCS, Epidemic Sound, Monstercat Gold. These are the ones it is safe to have running while you stream.'
          : '<b>Crew.</b> Discord voice only. Anything goes in here, because a private voice channel is not a broadcast. Do not route this one to your stream.'}</p>
      </div>
      ${st.deck === here
        ? `<p class="note" style="margin:0 0 12px">This deck is on air.</p>`
        : `<form method="post" action="/settings/radio/deck" style="margin:0 0 12px">
            <input type="hidden" name="deck" value="${here}">
            <button class="btn sm">Put ${esc(D.name)} on air</button></form>`}
      ${st.can.ok || list.length
        ? ''
        : `<div class="banner warn"><span>&#9888;</span><span>${esc(st.can.why)}</span></div>`}
      <label class="btn sm pick">
        <span data-radiotext>Add tracks to ${esc(D.name)}</span>
        <input type="file" accept="audio/*,.mp3,.ogg,.wav,.flac,.m4a,.opus" id="radiofile"
          data-deck="${here}" multiple>
      </label>
      <p class="note" style="margin:9px 0 13px">MP3, OGG, WAV, FLAC, M4A or Opus, up to 48MB each. Pick several at once.</p>
      ${list.length ? `<div class="lib">${list.map(t => `<div class="librow">
        <span class="libn">${esc(t.name)}${t.artist ? `<i class="liba">${esc(t.artist)}</i>` : ''}</span>
        <span class="note">${t.byName ? esc(t.byName) : ''}${t.plays ? ' &middot; played ' + t.plays : ''}</span>
        <form method="post" action="/settings/radio/remove" style="margin:0">
          <input type="hidden" name="id" value="${esc(t.id)}">
          <button class="btn sm ghost">Remove</button></form>
      </div>`).join('')}</div>` : '<p class="empty">Nothing in this deck yet.</p>'}
    </div></div>`;
}

function jukeCard(ctx) {
  const st = Radio.status();
  const list = Radio.inDeck();
  if (!list.length) return '';
  const q = st.queue;
  return `<div class="card" style="margin-top:14px" id="juke">
    <div class="ch"><h2>Request a track</h2>
      <span class="note">${esc(st.deckName)} deck${st.on ? ' &middot; on air' : ' &middot; not playing'}</span></div>
    <div class="cb">
      ${st.track ? `<div class="nowbar"><span class="nowbars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="nowt"><b>${esc(st.track.name)}</b>${st.track.artist ? `<span>${esc(st.track.artist)}</span>` : ''}</span></div>`
      : '<p class="note" style="margin:0 0 12px">Nothing playing right now. Requests wait in the queue.</p>'}
      ${q.length ? `<div class="qlist">${q.map((x, i) => `<div class="qrow">
        <span class="qn">${i + 1}</span>
        <span class="qt">${esc(x.name)}</span>
        <span class="note">${esc(x.byName || '')}</span>
        <button class="btn sm ghost" data-unqueue="${esc(x.id)}">Pull</button>
      </div>`).join('')}</div>` : '<p class="note" style="margin:0 0 12px">Queue is empty.</p>'}
      <div class="qpick">${list.slice(0, 40).map(t => `<button class="btn sm ghost" data-queue="${esc(t.id)}">
        ${esc(t.name)}</button>`).join('')}</div>
      <p class="note" data-qnote hidden></p>
    </div></div>`;
}

function overlayCard(ctx, q) {
  const base = (Site.siteUrl() || '').replace(/\/$/, '');
  const url = base + '/overlay?k=' + Overlay.token();
  return `<div class="card" style="margin-top:14px">
    <div class="ch"><h2>Stream overlay</h2><span class="note">a browser source for OBS</span></div>
    <div class="cb">
      ${q && q.overlay ? '<div class="banner"><span>&#10003;</span><span>New link made. The old one stopped working.</span></div>' : ''}
      <div class="ovl">
        <p class="note" style="margin:0">Add a <b>Browser</b> source in OBS, paste this, set it to about 420&times;700 and
          tick <b>Shutdown source when not visible</b>. It draws who is in voice and what they are playing, on a
          transparent background, and refreshes itself every few seconds.</p>
        <code>${esc(url)}</code>
        <p class="note" style="margin:0">Options on the end of the link: <code>&amp;theme=light</code>,
          <code>&amp;scale=1.4</code> to make it bigger, <code>&amp;games=0</code> to hide what people are playing,
          <code>&amp;max=6</code> to cap how many names show.</p>
        <p class="note" style="margin:0">Anyone with the link can see who is in voice, so do not put it on stream as
          text. If it gets out, make a new one &mdash; the old link dies immediately.</p>
        <form method="post" action="/settings/overlay/rotate" style="margin:0">
          <button class="btn sm ghost">Make a new link</button></form>
      </div>
    </div></div>`;
}

function storageCard() {
  const st = Storage.status();
  const use = Storage.usage();
  const good = st.level === 'ok';
  return `<div class="card" style="margin-top:14px${good ? '' : ';border-color:rgba(251,113,133,.45)'}">
    <div class="ch"><h2>Where your data lives</h2>
      <span class="note">${good ? 'safe across deploys' : 'not safe'}</span></div>
    <div class="cb">
      ${good ? '' : `<div class="banner bad"><span>&#9888;</span><span>${esc(st.message)}</span></div>`}
      <div class="kvr" style="font-size:14px"><dt>Writing to</dt><dd class="mono">${esc(st.dir)}</dd></div>
      <div class="kvr" style="font-size:14px"><dt>Volume</dt>
        <dd style="color:${st.mounted ? 'var(--lime)' : 'var(--rose)'}">${st.mount
          ? esc((st.name ? st.name + ' at ' : '') + st.mount) : 'none attached'}</dd></div>
      <div class="kvr" style="font-size:14px"><dt>Stored</dt><dd>${use.files} file${use.files === 1 ? '' : 's'}, ${use.mb}MB</dd></div>
      <div class="kvr" style="font-size:14px"><dt>First written</dt>
        <dd>${st.firstEver ? 'nothing was here at boot' : esc(new Date(st.firstSeen).toLocaleString('en-GB'))}</dd></div>
      <div class="kvr" style="font-size:14px"><dt>Boots since then</dt><dd>${st.boots}</dd></div>
      ${good ? '' : '<p class="note" style="margin-top:10px">Railway: open this service, <b>Settings &rarr; Volumes &rarr; Add Volume</b>, ' +
        'set the mount path to <b>' + esc(st.dir) + '</b>, then redeploy. Setting DATA_DIR on its own does not create one.</p>'}
    </div></div>`;
}


function hiddenCfg(cfg) {
  return ['siteName', 'tagline', 'heroTitle', 'heroSub', 'invite', 'mediaChannel', 'memoriesChannel',
    'liveChannel', 'announceChannel', 'dealChannel', 'achievementChannel']
    .map(k => `<input type="hidden" name="${k}" value="${esc(cfg[k] || '')}">`).join('');
}

function settingsSite(ctx, q) {
  const { cfg } = ctx;
  const vol = Math.max(0, Math.min(100, Number(cfg.musicVolume) || 12));
  const got = q && q.got
    ? (q.got === 'err'
      ? '<div class="banner bad"><span>&#9888;</span><span>Discord would not answer. Check the bot token.</span></div>'
      : `<div class="banner"><span>&#10003;</span><span>Read ${esc(String(q.got).split(',')[0])} channels and ${esc(String(q.got).split(',')[1])} roles back from Discord.</span></div>`)
    : '';
  const chans = Object.values(G.live.channels).filter(c => c.type === 0).sort((a, b) => a.name.localeCompare(b.name));
  const use = U.usage();
  const h = Music.house();

  const musicNote = q && q.musicerr
    ? `<div class="banner bad"><span>&#9888;</span><span>${esc(q.musicerr)}</span></div>`
    : q && q.music !== undefined
      ? `<div class="banner"><span>&#9834;</span><span>House list saved &mdash; ${esc(q.music)} track${q.music === '1' ? '' : 's'}.</span></div>`
      : '';

  const music = `<form method="post" action="/settings/music" class="card" style="margin-top:14px">
    <div class="ch"><h2>Jukebox</h2>
      <span class="note">${h.list.length} track${h.list.length === 1 ? '' : 's'}${h.by ? ' · last set by ' + esc(h.by) : ''}</span></div>
    <div class="cb">
      ${musicNote}
      <p class="note" style="margin:0 0 10px">One per line: a name, a bar, then a link. YouTube and YouTube Music both work,
        single tracks or whole playlists. Everyone can play this; anyone can also add their own links in the Jukebox,
        which stay in their browser.</p>
      <textarea name="list" rows="7" placeholder="Ambient for ranked | https://music.youtube.com/playlist?list=...">${esc(Music.houseText())}</textarea>
      <button class="btn sm" style="margin-top:11px">Save the house list</button>
      ${h.list.length ? `<div class="banner warn" style="margin-top:14px"><span>&#9888;</span><span>
        Most music on YouTube Music is licensed, and licensed tracks are blocked from playing outside YouTube by the
        rights holder. A playlist of chart music will not play here however it is shared, and setting it to Public does
        not change that. Playlists of ordinary uploads are fine.</span></div>
      <div class="lib" style="margin-top:12px">${h.list.map(t => `<div class="librow">
        <span class="libn">${esc(t.title)}</span>
        <span class="note">${t.list ? 'playlist' : 'single track'}</span>
      </div>`).join('')}</div>
      <a class="btn sm" style="margin-top:12px" href="/music/check">Check every link</a>
      <p class="note" style="margin-top:9px">That plays each line, muted, in YouTube's own player and tells you exactly
        what YouTube says about it &mdash; whether it plays, or which error it refuses with and what that error means.</p>` : ''}
    </div></form>
  <form method="post" action="/settings" class="card" style="margin-top:14px">
    <div class="ch"><h2>Who can open Settings</h2><span class="note">${cfg.settingsForAdmins ? 'you and your admins' : 'you alone'}</span></div>
    <div class="cb">
      ${hiddenCfg(cfg)}
      <input type="hidden" name="scope" value="1">
      <input type="hidden" name="musicVolume" value="${Math.max(0, Math.min(100, Number(cfg.musicVolume) || 12))}">
      ${cfg.musicAutoplay ? '<input type="hidden" name="musicAutoplay" value="on">' : ''}
      ${cfg.musicShuffle !== false ? '<input type="hidden" name="musicShuffle" value="on">' : ''}
      <label class="check">
        <input type="checkbox" name="settingsForAdmins" ${cfg.settingsForAdmins ? 'checked' : ''}>
        <span>Let anyone with <b>Manage the site</b> open Settings too</span></label>
      <p class="note" style="margin-top:9px">Off, this whole tab is yours alone &mdash; nobody else sees it in the
        navigation or can reach it by typing the address. Being able to manage members is not the same as being able to
        rewire the site, so it stays off unless you say so. You keep access either way.</p>
      <button class="btn sm" style="margin-top:12px">Save</button>
    </div></form>
  ${radioCard(ctx, q)}
  ${overlayCard(ctx, q)}
  ${storageCard()}
  <div class="card" style="margin-top:14px">
    <div class="ch"><h2>The sign-in screen</h2><span class="note">what people see before they are let in</span></div>
    <div class="cb">
      <p class="note" style="margin:0 0 11px">Drop a montage here and it plays behind the sign-in card. Video or a still,
        same as the hero &mdash; up to 64MB for video. It is the one picture nobody can replace from the page itself,
        because you have to be signed in to do that.</p>
      ${V.photo('gate-bg', 'thumb', U.siteImage('gate-bg'), ctx.perms.images, '')}
    </div></div>
  <form method="post" action="/settings" class="card" style="margin-top:14px">
    <div class="ch"><h2>How the music starts</h2></div>
    <div class="cb">
      ${hiddenCfg(cfg)}
      <label class="fld" for="musicVolume">Starting volume &mdash; ${vol}%</label>
      <input type="range" id="musicVolume" name="musicVolume" min="0" max="100" value="${vol}" style="width:100%;accent-color:var(--iris)">
      <label class="check" style="margin-top:12px">
        <input type="checkbox" name="musicAutoplay" ${cfg.musicAutoplay ? 'checked' : ''}>
        <span>Start the house list on its own when someone opens the site</span></label>
      <label class="check" style="margin-top:9px">
        <input type="checkbox" name="musicShuffle" ${cfg.musicShuffle !== false ? 'checked' : ''}>
        <span>Shuffle &mdash; pick at random rather than working down the list</span></label>
      <p class="note" style="margin-top:9px">Browsers will not play sound until someone has clicked on the page, so the
        music starts <b>muted</b> and turns itself up the moment they touch anything &mdash; that way it is already playing
        rather than waiting. Whoever pauses it stays paused, on their own browser, until they press play again. Anyone can
        flip shuffle for themselves with the button on the player.</p>
      <button class="btn sm" style="margin-top:12px">Save</button>
    </div></form>`;

  return got + `<form method="post" action="/settings" class="card">
    <div class="ch"><h2>Site</h2><span class="note">owner and admin</span></div>
    <div class="cb">
      <label class="fld" for="siteName">Site name</label>
      <input type="text" id="siteName" name="siteName" value="${esc(cfg.siteName || '')}" maxlength="40">
      <label class="fld" for="tagline">Tagline</label>
      <input type="text" id="tagline" name="tagline" value="${esc(cfg.tagline || '')}" maxlength="80">
      <label class="fld" for="heroTitle">Hero headline</label>
      <input type="text" id="heroTitle" name="heroTitle" value="${esc(cfg.heroTitle || '')}"
        maxlength="60" placeholder="Leave blank to rotate">
      <p class="note" style="margin:-4px 0 12px">Leave this empty and the headline picks itself from
        ${Hero.all()} written lines, changing every load and reading the room — later at night, weekends,
        when voice is busy, when nobody is on. Type something here to pin it instead.</p>
      <label class="fld" for="heroSub">Hero line underneath</label>
      <input type="text" id="heroSub" name="heroSub" value="${esc(cfg.heroSub || '')}" maxlength="160">
      <label class="fld" for="invite">Discord invite link</label>
      <input type="text" id="invite" name="invite" value="${esc(cfg.invite || '')}" maxlength="120"
        placeholder="${esc((Widget.status().invite) || 'https://discord.gg/…')}">
      ${Widget.status().invite && !cfg.invite
        ? '<p class="note" style="margin-top:5px">Left blank, the one Discord\u2019s server widget generates is used. It does not expire.</p>'
        : ''}
      ${chanSelect('mediaChannel', 'Channel mirrored into Clips &rarr; Media', chans, cfg.mediaChannel)}
      ${chanSelect('memoriesChannel', 'Channel mirrored into Clips &rarr; Memories', chans, cfg.memoriesChannel)}
      ${chanSelect('liveChannel', 'Go-live announcements', chans, cfg.liveChannel)}
      ${chanSelect('announceChannel', 'Game night announcements', chans, cfg.announceChannel)}
      ${chanSelect('dealChannel', 'Steam sale alerts', chans, cfg.dealChannel)}
      ${chanSelect('achievementChannel', 'Achievement announcements', chans, cfg.achievementChannel)}
      <p class="note" style="margin-top:12px">${chans.length} channel${chans.length === 1 ? '' : 's'} visible to the bot.
        Made one just now and it is not here? It only sees channels it has <b>View Channel</b> on.</p>
      <div class="row" style="margin-top:10px">
        <button class="btn sm">Save</button>
        <button class="btn sm ghost" type="submit" form="chanrefresh">Re-read from Discord</button>
      </div>
      <p class="note" style="margin-top:10px">Uploaded pictures and video: ${use.files} file${use.files === 1 ? '' : 's'}, ${use.mb}MB.</p>
    </div></form>
  <form method="post" action="/settings/refresh" id="chanrefresh"></form>` + music;
}

function settingsPerms(ctx, selected) {
  const roles = G.live.roles;
  const m = P.matrix();
  const roster = G.roster();
  const ig = P.ignored();
  const top = P.topId();
  const live = P.visible(roles);
  const sel = selected || top || (live[0] && live[0].id) || (roles[0] && roles[0].id) || null;

  const row = r => {
    const count = roster.filter(x => x.roles.indexOf(r.id) > -1).length;
    const off = ig.indexOf(r.id) > -1;
    return `<a class="rr${r.id === sel ? ' on' : ''}${off ? ' off' : ''}" href="/settings/perms?role=${encodeURIComponent(r.id)}">
      <span class="rd" style="background:${off ? 'var(--faint)' : r.colour}"></span>
      <span class="rn" style="color:${off ? 'var(--faint)' : r.colour}">${esc(r.name)}</span>
      ${r.id === top ? '<span class="rtag">top</span>' : ''}
      ${off ? '<span class="rtag off">hidden</span>' : ''}
      <span class="rc">${count}</span></a>`;
  };

  const inUse = live.map(row).join('');
  const hidden = roles.filter(r => ig.indexOf(r.id) > -1).map(row).join('');

  const role = roles.filter(r => r.id === sel)[0];
  const isTop = role && role.id === top;
  const isOff = role && ig.indexOf(role.id) > -1;

  const permRows = role ? P.PERMS.map(x => {
    const on = isTop ? true : !!(m[role.id] && m[role.id][x.k]);
    return `<form method="post" action="/permissions/toggle" class="perm${isOff ? ' dim' : ''}">
      <input type="hidden" name="role" value="${esc(role.id)}">
      <input type="hidden" name="key" value="${esc(x.k)}">
      <span class="t"><span class="pn2">${esc(x.n)}</span><div class="pd2">${esc(x.d)}</div></span>
      <button class="sw${on ? ' on' : ''}" ${isTop || isOff ? 'disabled' : ''} aria-label="${esc(x.n)}"></button>
    </form>`;
  }).join('') : '';

  const ignoreBox = role ? `<form method="post" action="/permissions/ignore" class="perm">
      <input type="hidden" name="role" value="${esc(role.id)}">
      <span class="t"><span class="pn2">Hide this role from the site</span>
        <div class="pd2">It stops being anyone’s rank, drops off the Ranks page, and grants nothing here.
          For bot roles, colour roles and ping roles.</div></span>
      <button class="sw${isOff ? ' on' : ''}" aria-label="Hide this role"></button>
    </form>` : '';

  const why = !role ? ''
    : isTop ? '<div class="perm"><span class="t" style="color:var(--faint);font-size:13px">This is the highest role you have not hidden, so it keeps every permission and cannot be switched off. Hide it and the next one down takes over.</span></div>'
    : isOff ? '<div class="perm"><span class="t" style="color:var(--amber);font-size:13px">Hidden. Nothing below applies while it stays that way.</span></div>'
    : '';

  return `<div class="banner"><span>&#128161;</span><span>Roles, their colours and their order are read from your server.
      Someone with several roles gets everything all of them allow. Bot roles are hidden for you automatically, because Discord
      puts them wherever it likes and they belong to no one.</span></div>
    <div class="pw">
      <div class="card"><div class="ch"><h2>Server roles</h2><span class="note">from Discord</span></div>
        <div class="cb">${inUse || '<p class="empty">Every role is hidden.</p>'}
          ${hidden ? `<div class="rsep">Hidden</div>${hidden}` : ''}</div></div>
      <div class="card">
        ${role ? `<div class="ph"><span class="rd" style="width:12px;height:12px;background:${role.colour}"></span>
          <h3 style="color:${role.colour}">${esc(role.name)}</h3>
          <span class="note" style="margin-left:auto">position ${role.position} in Discord</span></div>
          ${ignoreBox}${why}${permRows}`
          : '<div class="cb"><p class="empty">Pick a role.</p></div>'}
      </div>
    </div>`;
}

function settingsDiscord(ctx, q) {
  const { cfg, perms } = ctx;
  const saved = q && q.saved
    ? `<div class="banner" style="margin-bottom:14px"><span>&#10003;</span><span>${
        q.saved === 'pings' ? 'Ping roles saved.'
        : q.saved === 'roles' ? 'Saved, and the post in Discord has been rewritten.'
        : q.saved === 'reacted' ? 'Reactions added back to the post.'
        : q.saved === 'voice' ? 'Voice settings saved.'
        : q.saved === 'ranks' ? 'Rank rules saved.'
        : q.saved === 'apply' ? 'Access settings saved.'
        : q.saved === 'guests' ? 'Pass revoked.'
        : q.saved === 'otd' ? 'On this day saved.'
        : q.saved === 'guests2' ? 'Guest pass defaults saved.'
        : 'Saved.'}</span></div>`
    : '';
  const rrerr = q && q.rrerr
    ? `<div class="banner bad" style="margin-bottom:14px"><span>&#9888;</span><span>${esc(q.rrerr)}</span></div>`
    : '';
  const st = G.status();
  const cmds = [
    ['/quote', 'Save something to <b>Memories</b> without leaving Discord.'],
    ['/tonight', 'Who’s playing and how many spots are left.'],
    ['/next', 'The next game night and who has RSVPd.'],
    ['/live', 'Who’s streaming right now and where.'],
    ['/deals', 'Anything on sale two or more of you wishlisted.'],
    ['/whois', '<span class="sf">staff</span> Rank, nights, voice hours, warnings &mdash; only you see the reply.'],
    ['/warn', '<span class="sf">staff</span> Log a warning. It shows on their profile here.'],
    ['/note', '<span class="sf">staff</span> Staff notes on someone, added or read back.'],
    ['/role', '<span class="sf">staff</span> Give or take a role without opening Server Settings.'],
    ['/say', '<span class="sf">staff</span> Post as the bot, here or anywhere.'],
    ['/purge', '<span class="sf">staff</span> Clear the last few messages.'],
    ['/slowmode', '<span class="sf">staff</span> Set or clear slowmode.'],
    ['/sync', '<span class="sf">staff</span> Re-read roles and channels.']
  ].map(c => `<div class="cmd"><span class="cmdn">${esc(c[0])}</span><span class="cmdd">${c[1]}</span></div>`).join('');

  const feats = [
    ['\u{1F464}', 'Sign-in builds your profile', 'OAuth with <b>identify</b> and <b>guilds.members.read</b>. Username, avatar and roles arrive on first sign-in.', 'dc-1'],
    ['\u{1F451}', 'Your Discord role is your rank', 'The bot reads your role list — names, colours, order. Change it in Discord, it changes here.', 'dc-2'],
    ['\u{1F4F8}', 'Channel mirroring', 'Point Media and Memories at any channels and they mirror live, reactions included.', 'dc-3'],
    ['\u{1F4FA}', 'Live alerts', 'Twitch and YouTube polled every minute, with a post to your server when someone starts.', 'dc-4']
  ].map(f => `<article class="feat">
      ${V.photo(f[3], '', U.siteImage(f[3]), perms.images, `<div class="fb">${f[0]}</div><h3 class="ft">${f[1]}</h3>`)}
      <p class="fd">${f[2]}</p></article>`).join('');

  const roles = (G.live.roles || []).filter(r => !r.managed);
  const chans = Object.values(G.live.channels).filter(c => c.type === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const rr = RR.read();
  const low = RR.belowBot();
  const greetErr = Greet.state().error;
  const autoBad = Greet.autoRoleProblem();
  const botNote = G.live.botRoleTop == null
    ? `<div class="banner warn" style="margin-top:12px"><span>&#9888;</span><span>
        The bot has not reported its own roles yet, so I cannot tell whether it sits high enough to hand roles out.
        Press <b>Re-read from Discord</b> on the Site tab once it is connected.</span></div>`
    : low.length
      ? `<div class="banner bad" style="margin-top:12px"><span>&#9888;</span><span>
          The bot sits <b>below</b> ${low.map(n => '@' + esc(n)).join(', ')} in your role list, so Discord will refuse to
          hand ${low.length === 1 ? 'that one' : 'those'} out. Open <b>Server Settings &rarr; Roles</b> and drag the
          bot's own role above ${low.length === 1 ? 'it' : 'them'}.</span></div>`
      : '';

  const pings = `<form method="post" action="/settings/pings" class="card" style="margin-bottom:14px">
    <div class="ch"><h2>Who gets pinged</h2><span class="note">a mention inside an embed pings nobody, so these go above it</span></div>
    <div class="cb">
      <p class="note" style="margin:0 0 12px">Pick a role per event, or leave it on no ping. Managed roles are hidden
        because Discord will not let anyone be given one.</p>
      <div class="two">
        <div>${roleSelect('pingLive', 'When someone goes live', roles, cfg.pingLive)}</div>
        <div>${roleSelect('pingNight', 'When a night gets locked in', roles, cfg.pingNight)}</div>
      </div>
      <div style="margin-top:12px">${roleSelect('pingDeal', 'When a wishlist game goes on sale', roles, cfg.pingDeal)}</div>
      <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--line)">
        ${chanSelect('logChannel', 'Post every staff action in', chans, cfg.logChannel)}
        <p class="note" style="margin-top:8px">Warnings, notes, roles given, timeouts, kicks, bans, purges, joins and
          leaves. Pick a channel only staff can see.</p>
      </div>
      <button class="btn sm" style="margin-top:12px">Save</button>
    </div></form>`;

  const react = `<form method="post" action="/settings/reactroles" class="card" style="margin-bottom:14px">
    <div class="ch"><h2>React for a role</h2>
      <span class="note">${rr.pairs.length} pair${rr.pairs.length === 1 ? '' : 's'}${rr.message ? ' · posted' : ''}</span></div>
    <div class="cb">
      ${rr.error ? `<div class="banner bad"><span>&#9888;</span><span>${esc(rr.error)}</span></div>` : ''}
      ${botNote}
      <p class="note" style="margin:0 0 12px">One per line: an emoji, a bar, the role, and optionally a bar and a short
        line explaining it. The bot posts this itself and rewrites that same post whenever you save, so never edit it
        in Discord.</p>
      ${chanSelect('rrChannel', 'Which channel the post lives in', chans, rr.channel)}
      <div style="margin-top:12px">
        <label class="fld" for="rrTitle">Heading</label>
        <input type="text" id="rrTitle" name="rrTitle" maxlength="120" value="${esc(rr.title || '')}"
          placeholder="Pick what you want pinged for">
      </div>
      <textarea name="rrPairs" rows="6" style="margin-top:12px"
        placeholder="&#127908; | @livenoti | when someone starts streaming">${esc(RR.asText())}</textarea>
      <button class="btn sm" style="margin-top:11px">Save and post it</button>
      <p class="note" style="margin-top:12px">A custom emoji from this server works &mdash; type it the way Discord does,
        like <code>&lt;:gamenight:123456789&gt;</code>. Easiest way to get that: type <code>\\</code> then the emoji in
        Discord and send it, and Discord prints the whole thing out for you to copy.</p>
      ${rr.message && rr.channel ? `<p class="note" style="margin-top:9px">Posted in
        <b>#${esc((G.live.channels[rr.channel] || {}).name || 'a channel')}</b>. Clear the channel above to stop using it.</p>` : ''}
    </div></form>
    ${rr.message ? `<form method="post" action="/settings/reactroles/react" style="margin:-6px 0 14px">
      <button class="btn sm ghost">Put the reactions back on the post</button>
      <p class="note" style="margin-top:7px">Use this if the reactions are missing from the post in Discord, or somebody
        cleared them. It does not repost anything.</p></form>` : ''}`;

  const vrooms = Object.values(G.live.channels).filter(c => c.type === 2)
    .sort((a, b) => a.name.localeCompare(b.name));
  const cats = Object.values(G.live.channels).filter(c => c.type === 4)
    .sort((a, b) => a.name.localeCompare(b.name));
  const vSelect = (name, label, cur, none) => `<label class="fld" for="${name}">${label}</label>
    <select class="fullsel" id="${name}" name="${name}">
      <option value="">&mdash; ${none || 'off'} &mdash;</option>
      ${vrooms.map(c => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>&#128266; ${esc(c.name)}</option>`).join('')}
    </select>`;

  const voice = `<form method="post" action="/settings/voice" class="card" style="margin-bottom:14px">
    <div class="ch"><h2>Voice and presence</h2>
      <span class="note">${[cfg.voiceNames && 'live names', cfg.lobbyChannel && 'join-to-create',
        cfg.aloneMinutes && 'alone nudge', cfg.boardChannel && 'board', cfg.fiveMin && 'five-minute watch']
        .filter(Boolean).join(' &middot; ') || 'all off'}</span></div>
    <div class="cb">
      <label class="check">
        <input type="checkbox" name="voiceNames" ${cfg.voiceNames ? 'checked' : ''}>
        <span>Rename voice channels to show the game and headcount</span></label>
      <p class="note" style="margin:7px 0 15px">&ldquo;The Lounge&rdquo; becomes &ldquo;The Lounge &mdash; Lethal Company (4)&rdquo;.
        Discord only allows two renames per channel every ten minutes, so it updates at most every six and goes back to the
        plain name when everyone leaves. Turning this off restores every name.</p>

      ${vSelect('lobbyChannel', 'Join-to-create &mdash; joining this makes a new room', cfg.lobbyChannel, 'off')}
      <div class="two" style="margin-top:12px">
        <div><label class="fld" for="tempCategory">Put new rooms in this category</label>
          <select class="fullsel" id="tempCategory" name="tempCategory">
            <option value="">&mdash; same category as the lobby &mdash;</option>
            ${cats.map(c => `<option value="${esc(c.id)}"${c.id === cfg.tempCategory ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
        <div><label class="fld" for="tempLimit">Spots in each new room, 0 for no limit</label>
          <input type="text" id="tempLimit" name="tempLimit" maxlength="2" value="${esc(String(cfg.tempLimit || ''))}" placeholder="0"></div>
      </div>
      <p class="note" style="margin:8px 0 15px">The new room is named after whatever they are playing and deletes itself
        the moment it empties. Needs <b>Manage Channels</b> and <b>Move Members</b>.</p>

      <div class="two">
        <div><label class="fld" for="aloneMinutes">Say something when one person has been alone this long, in minutes</label>
          <input type="text" id="aloneMinutes" name="aloneMinutes" maxlength="3" value="${esc(String(cfg.aloneMinutes || ''))}" placeholder="10"></div>
        <div>${chanSelect('aloneChannel', 'Where to say it', chans, cfg.aloneChannel)}</div>
      </div>
      <div style="margin-top:12px">${roleSelect('alonePing', 'And ping this role, if you want', roles, cfg.alonePing)}</div>
      <p class="note" style="margin:8px 0 15px">Once per person every three hours, so nobody gets nagged.</p>

      <div>${chanSelect('boardChannel', 'Keep a live who&rsquo;s-on post in', chans, cfg.boardChannel)}</div>
      <p class="note" style="margin:8px 0 15px">One message that edits itself as people come and go, rather than a new
        post every time. Pin it once and it stays useful.</p>

      <label class="check">
        <input type="checkbox" name="fiveMin" ${cfg.fiveMin ? 'checked' : ''}>
        <span>Watch for &ldquo;five minutes&rdquo;, &ldquo;one more game&rdquo; and friends</span></label>
      <p class="note" style="margin:7px 0 11px">When somebody in voice says it, the clock starts. When they actually
        leave, the bot posts how long it really was. <code>/fivemin</code> shows the leaderboard.</p>
      ${chanSelect('fiveMinChannel', 'Post the result in', chans, cfg.fiveMinChannel)}

      <button class="btn sm" style="margin-top:14px">Save</button>
    </div></form>`;

  const pv = Ladder.preview();
  const high = Ladder.tooHigh();
  const rankErr = q && q.rankerr
    ? `<div class="banner bad"><span>&#9888;</span><span>${esc(q.rankerr)}</span></div>` : '';

  const ranks = `<form method="post" action="/settings/ranks" class="card" style="margin-bottom:14px">
    <div class="ch"><h2>Ranks that look after themselves</h2>
      <span class="note">${[cfg.autoRank && 'by attendance', cfg.bedRoles && 'by bedtime'].filter(Boolean).join(' &middot; ') || 'off'}</span></div>
    <div class="cb">
      ${rankErr}
      ${high.length ? `<div class="banner bad"><span>&#9888;</span><span>The bot sits below
        ${high.map(n => '@' + esc(n)).join(', ')}, so it cannot hand ${high.length === 1 ? 'that one' : 'those'} out.
        Drag its role above ${high.length === 1 ? 'it' : 'them'} in Server Settings.</span></div>` : ''}

      <label class="check">
        <input type="checkbox" name="autoRank" ${cfg.autoRank ? 'checked' : ''}>
        <span>Set each person&rsquo;s rank from how many nights they have turned up to</span></label>
      <p class="note" style="margin:7px 0 10px">One per line: a role, a bar, then the nights needed. Lowest first;
        everyone gets the highest rung they have earned, and loses the ones below it. Leave a rung at 0 for the
        starting rank.</p>
      <textarea name="rungs" rows="5" placeholder="@Regular | 0&#10;@Unsupervised Menace | 10&#10;@Deputy | 30">${esc(Ladder.rungsText())}</textarea>

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
        <label class="check">
          <input type="checkbox" name="bedRoles" ${cfg.bedRoles ? 'checked' : ''}>
          <span>Set the bedtime roles from when people actually leave voice</span></label>
        <p class="note" style="margin:7px 0 10px">One per line: a role, a bar, then the hour it starts, on a 24-hour
          clock that keeps going past midnight &mdash; so 1am is <b>25</b> and 3am is <b>27</b>. Needs at least four
          nights of history per person before it will move anyone.</p>
        <textarea name="beds" rows="5" placeholder="@Early Night | 18&#10;@Evening | 22&#10;@Midnight | 24&#10;@3AM Club | 27">${esc(Ladder.bedsText())}</textarea>
      </div>

      <div class="two" style="margin-top:14px">
        <div>${chanSelect('rankChannel', 'Say so in', chans, cfg.rankChannel)}</div>
        <div><label class="fld" for="timezone">Your timezone</label>
          <input type="text" id="timezone" name="timezone" maxlength="40"
            value="${esc(cfg.timezone || 'America/New_York')}" placeholder="America/New_York"></div>
      </div>

      ${pv.rungs.length || pv.beds.length ? `<div class="banner warn" style="margin-top:13px"><span>&#8635;</span><span>
        Next run would change ${pv.rungs.length + pv.beds.length} thing${pv.rungs.length + pv.beds.length === 1 ? '' : 's'}:
        ${pv.rungs.slice(0, 3).map(r => esc(nameOf(r.uid)) + ' &rarr; ' +
          (r.want ? esc(Ladder.roleName(r.want)) : 'no rank')).join(', ')}${pv.rungs.length > 3 ? '&hellip;' : ''}
        ${pv.beds.length ? ' &middot; ' + pv.beds.slice(0, 2).map(b => esc(nameOf(b.uid)) + ' &rarr; ' +
          (b.want ? esc(Ladder.roleName(b.want)) : 'none')).join(', ') : ''}</span></div>` : ''}

      <div class="srow" style="margin-top:13px">
        <button class="btn sm">Save</button>
        <button class="btn sm ghost" name="apply" value="now">Save and run it now</button>
      </div>
      <p class="note" style="margin-top:9px">It runs on its own every six hours.</p>
    </div></form>`;

  const passes = Guests.all().slice(0, 8);
  const madePass = q && q.pass ? String(q.pass) : '';
  const base = (Site.siteUrl() || '').replace(/\/$/, '');

  const access = `<div class="card" style="margin-bottom:14px">
    <div class="ch"><h2>Letting people in</h2>
      <span class="note">${[cfg.applyOpen && 'applications', cfg.promoteAt && 'auto-pin at ' + cfg.promoteAt]
        .filter(Boolean).join(' &middot; ') || 'closed'}</span></div>
    <div class="cb">
      ${madePass ? `<div class="banner"><span>&#10003;</span><span>Pass made. Send them this:
        <code>${esc(base + '/pass/' + madePass)}</code></span></div>` : ''}

      <form method="post" action="/settings/apply">
        <label class="check">
          <input type="checkbox" name="applyOpen" ${cfg.applyOpen ? 'checked' : ''}>
          <span>Let strangers ask to join from the sign-in page</span></label>
        <p class="note" style="margin:7px 0 12px">They sign in with Discord, fill in three questions, and the bot posts it
          to staff with approve and deny buttons. They still have to be in the Discord server first.</p>
        <div class="two">
          <div>${chanSelect('applyChannel', 'Post applications in', chans, cfg.applyChannel)}</div>
          <div>${roleSelect('applyRole', 'Give this rank on approval', roles, cfg.applyRole, 'no rank')}</div>
        </div>
        <div class="two" style="margin-top:12px">
          <div><label class="fld" for="applyVotes">Votes needed either way</label>
            <input type="text" id="applyVotes" name="applyVotes" maxlength="2" value="${esc(String(cfg.applyVotes || 1))}"></div>
          <div><label class="fld" for="promoteAt">Reactions that promote a clip to Memories, 0 for off</label>
            <input type="text" id="promoteAt" name="promoteAt" maxlength="2" value="${esc(String(cfg.promoteAt || ''))}" placeholder="5"></div>
        </div>
        <button class="btn sm" style="margin-top:13px">Save</button>
      </form>

      <div style="margin-top:17px;padding-top:15px;border-top:1px solid var(--line)">
        <h3 style="font-size:14px;margin:0 0 4px">Guest passes</h3>
        <p class="note" style="margin:0 0 12px">A link that hands someone a role for a set number of hours, then takes it
          back on its own. For a friend-of-a-friend turning up for one night.</p>
        <form method="post" action="/settings/guests" class="scanrow" style="border:0;padding:0">
          <span>${roleSelect('role', '', roles, cfg.guestRole || '', 'pick a role')}</span>
          <span><label class="fld" for="ghours">Hours</label>
            <input type="text" id="ghours" name="hours" maxlength="3" value="24"></span>
          <span><label class="fld" for="guses">Uses</label>
            <input type="text" id="guses" name="uses" maxlength="2" value="1"></span>
          <span><button class="btn sm" style="margin-top:17px">Make one</button></span>
        </form>
        <form method="post" action="/settings/guests/default" class="two" style="margin-top:13px;
          padding-top:12px;border-top:1px solid var(--line)">
          <div>${roleSelect('guestRole', 'What <code>/guestpass</code> hands out by default', roles, cfg.guestRole, 'nothing yet')}</div>
          <div><label class="fld" for="guestHours">And for how many hours</label>
            <input type="text" id="guestHours" name="guestHours" maxlength="3"
              value="${esc(String(cfg.guestHours || 24))}"></div>
          <div style="grid-column:1/-1"><button class="btn sm">Save the default</button>
            <p class="note" style="margin-top:8px">Staff can then run <code>/guestpass</code> in Discord for a link, or
              <code>/guestpass person:@someone</code> to have the bot DM it to them. Either can be overridden on the
              command itself.</p></div>
        </form>
        ${passes.length ? `<div style="margin-top:13px">${passes.map(g => `<div class="librow">
          <span class="libn">${esc(Guests.roleName(g.role))}</span>
          <span class="note">${g.hours}h &middot; ${g.used.length}/${g.uses} used &middot; ${esc(Guests.statusOf(g))}</span>
          ${Guests.alive(g) ? `<code style="font-size:11.5px">${esc(base + '/pass/' + g.code)}</code>
            <form method="post" action="/settings/guests/revoke" style="margin:0">
              <input type="hidden" name="code" value="${esc(g.code)}">
              <button class="btn sm ghost">Revoke</button></form>` : ''}
        </div>`).join('')}</div>` : ''}
      </div>
    </div></div>`;

  const vs = Voice.status();
  const voiceBot = `<div class="card" style="margin-bottom:14px">
    <div class="ch"><h2>Reading chat out loud</h2>
      <span class="note">${vs.channel ? 'in ' + esc(vs.channelName) : vs.can.ok ? 'idle' : 'unavailable'}</span></div>
    <div class="cb">
      ${vs.can.ok
        ? `<p class="note" style="margin:0 0 11px">Staff run <code>/tts</code> while sitting in a voice channel and the
            bot joins and reads that channel&rsquo;s own text chat out loud. <code>/tts off</code> sends it away, and
            <code>/tts say:</code> reads one line without switching anything on. It leaves by itself a minute after the
            last person goes.</p>
          ${vs.channel ? `<div class="banner"><span>&#128266;</span><span>Currently in <b>${esc(vs.channelName)}</b>${
            vs.tts ? ', reading chat out' : ''}${vs.queued ? ' &middot; ' + vs.queued + ' waiting' : ''}.</span></div>` : ''}
          ${vs.error ? `<div class="banner bad"><span>&#9888;</span><span>${esc(vs.error)}</span></div>` : ''}
          <p class="note" style="margin:11px 0 0">If joining fails, the reply says which of the three stages it got
            stuck at &mdash; Discord not answering, the audio connection never coming up, or being dropped straight
            after. Those need different fixes, so it is worth reading.</p>`
        : `<div class="banner warn"><span>&#9888;</span><span>${esc(vs.can.why)}</span></div>
          <p class="note" style="margin:11px 0 0">The server needs <b>espeak-ng</b> and <b>ffmpeg</b>. The
            <code>nixpacks.toml</code> in the project installs both on the next deploy.</p>`}
    </div></div>`;

  const otd = `<form method="post" action="/settings/otd" class="card" style="margin-bottom:14px">
    <div class="ch"><h2>On this day</h2><span class="note">${cfg.otdChannel ? 'on' : 'off'}</span></div>
    <div class="cb">
      <p class="note" style="margin:0 0 12px">Once a day it digs out something pinned from a year ago today and posts it
        again. It looks within four days either side, so a quiet week still turns something up, and it never repeats
        the same one.</p>
      <div class="two">
        <div>${chanSelect('otdChannel', 'Post it in', chans, cfg.otdChannel)}</div>
        <div><label class="fld" for="otdHour">What hour, your time, 0&ndash;23</label>
          <input type="text" id="otdHour" name="otdHour" maxlength="2"
            value="${esc(String(cfg.otdHour === undefined ? 10 : cfg.otdHour))}"></div>
      </div>
      <div class="srow" style="margin-top:13px">
        <button class="btn sm">Save</button>
        <button class="btn sm ghost" name="now" value="1">Save and post one now</button>
      </div>
    </div></form>`;

  const welcome = `<form method="post" action="/settings/greet" class="card" style="margin-bottom:14px">
    <div class="ch"><h2>New joiners</h2><span class="note">${cfg.autoRole || cfg.welcomeChannel ? 'on' : 'off'}</span></div>
    <div class="cb">
      ${greetErr ? `<div class="banner bad"><span>&#9888;</span><span>${esc(greetErr)}</span></div>` : ''}
      ${autoBad ? `<div class="banner bad"><span>&#9888;</span><span>${esc(autoBad)}</span></div>` : ''}
      <div class="two">
        <div>${chanSelect('welcomeChannel', 'Post a welcome in', chans, cfg.welcomeChannel)}</div>
        <div>${roleSelect('autoRole', 'Give everyone this role on join', roles, cfg.autoRole, 'no role')}</div>
      </div>
      <div style="margin-top:12px">
        <label class="fld" for="welcomeText">What the welcome says</label>
        <textarea id="welcomeText" name="welcomeText" rows="3" maxlength="900"
          placeholder="Glad you made it. Have a look around, grab the pings you want, and put your name down for the next night.">${esc(cfg.welcomeText || '')}</textarea>
      </div>
      <button class="btn sm" style="margin-top:12px">Save</button>
    </div></form>`;

  return saved + rrerr + pings + voice + voiceBot + ranks + access + otd + react + welcome + `<div class="card" style="margin-bottom:14px"><div class="cb">
      <div class="kvr" style="font-size:14.5px"><dt>Gateway</dt>
        <dd style="color:${st.ready ? 'var(--lime)' : 'var(--rose)'}">${st.ready ? 'Connected' + (st.since ? ' &middot; ' + since(st.since) : '') : 'Not connected'}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Members cached</dt><dd>${st.members}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Roles</dt><dd>${st.roles}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Online</dt><dd>${st.online}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Commands registered</dt><dd>${Cmd.DEFS.length}</dd></div>
      ${(() => {
        const w = Widget.status();
        const inv = Widget.invite();
        return `<div class="kvr" style="font-size:14.5px"><dt>Server widget</dt>
          <dd style="color:${w.enabled ? 'var(--lime)' : 'var(--faint)'}">${w.enabled === null ? 'not checked' : w.enabled ? 'on' : 'off'}</dd></div>
        <div class="kvr" style="font-size:14.5px"><dt>Invite link</dt>
          <dd>${inv ? (inv.from === 'widget' ? 'from the widget' : 'set by hand') : 'none'}</dd></div>`;
      })()}
      ${st.error ? `<div class="banner bad" style="margin-top:12px"><span>&#9888;</span><span>${esc(st.error)}</span></div>` : ''}
    </div></div>
    <div class="auto" style="margin-bottom:14px">
      <div class="card"><div class="ch"><h2>Commands</h2><span class="note">registered to your server</span></div>
        <div class="cb">${cmds}</div></div>
      <div class="card"><div class="ch"><h2>Right-click any message</h2></div><div class="cb">
        <p style="font-size:14px;color:var(--dim);margin:0 0 13px">Better than a slash command for quoting someone — you don’t retype what they said.</p>
        <div class="ctx"><div>Reply</div><div>Forward</div><div class="sel">Save as quote</div><div>Pin</div></div>
      </div></div>
    </div>
    ${(() => { const inv = Widget.invite(); return inv
      ? `<a class="btn dcb" style="margin-bottom:14px" href="${esc(inv.url)}" target="_blank" rel="noopener">${V.DC_ICON}Open Discord</a>`
      : ''; })()}
    <div class="feats">${feats}</div>`;
}

function settings(ctx, sub, q) {
  const body = sub === 'perms' ? settingsPerms(ctx, q && q.role)
    : sub === 'discord' ? settingsDiscord(ctx, q)
    : settingsSite(ctx, q);
  return shell('settings', 'Settings', 'How the site is wired to your server, and who can change what.', sub, body, ctx.perms);
}


function notifyHelp(ctx) {
  const on = Push.ready();
  const mine = Push.forUser(ctx.me.id).length;
  const site = (process.env.SITE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || 'this site';

  const step = (n, t, b) => `<li><span class="stepn">${n}</span><div><b>${t}</b>${b ? '<p>' + b + '</p>' : ''}</div></li>`;

  return `<section class="page wrap">
    <h1 class="ttl">Notifications on your phone</h1>
    <p class="lede">The site can send you a push notification when someone goes live, a night gets locked in,
      a game on your wishlist goes on sale, or people start gathering in voice. It works like an app
      notification &mdash; you do not need the site open.</p>

    ${on
      ? mine
        ? `<div class="banner"><span>&#10003;</span><span>You have notifications on for
            ${mine} ${mine === 1 ? 'device' : 'devices'}. Each phone or computer has to be turned on separately.</span></div>`
        : `<div class="banner"><span>&#9432;</span><span>Not turned on for any of your devices yet.
            Follow the steps below, then use the toggle on
            <a class="lk" href="/crew/people#me">your profile card</a>.</span></div>`
      : `<div class="banner warn"><span>&#9888;</span><span>Push is not set up on the server yet, so the toggle
          will not appear. ${esc(Push.why())}</span></div>`}

    <div class="card howcard">
      <div class="ch"><h2>iPhone and iPad</h2><span class="note">has an extra step</span></div>
      <div class="cb">
        <p class="note" style="margin:0 0 12px">Apple only lets a website send notifications once you have added it
          to your home screen. In Safari, with the site just open in a tab, the toggle will tell you it cannot be
          turned on &mdash; that is Apple, not us. Do these in order.</p>
        <ol class="steps">
          ${step(1, 'Open the site in Safari', 'It has to be Safari. Chrome and Firefox on iPhone cannot do this.')}
          ${step(2, 'Tap the Share button', 'The square with an arrow coming out of the top, in the bar at the bottom.')}
          ${step(3, 'Choose &ldquo;Add to Home Screen&rdquo;', 'Scroll down the list a little if you do not see it. Then tap Add.')}
          ${step(4, 'Close Safari and open the new icon', 'This part matters. Notifications only work when you open the site from the home screen icon, not from a Safari tab.')}
          ${step(5, 'Go to your profile and turn them on', 'Crew &rarr; People &rarr; your own card, then <b>Turn notifications on</b>. iOS will ask for permission &mdash; say Allow.')}
        </ol>
        <p class="note" style="margin:12px 0 0">Needs iOS 16.4 or newer. If the toggle still refuses after all that,
          check Settings &rarr; Notifications on your phone and make sure the home-screen icon is allowed to send them.</p>
      </div>
    </div>

    <div class="card howcard">
      <div class="ch"><h2>Android</h2><span class="note">simpler</span></div>
      <div class="cb">
        <ol class="steps">
          ${step(1, 'Open the site in Chrome')}
          ${step(2, 'Go to your profile card', 'Crew &rarr; People &rarr; your own card.')}
          ${step(3, 'Tap &ldquo;Turn notifications on&rdquo;', 'Chrome will ask for permission. Tap Allow.')}
        </ol>
        <p class="note" style="margin:12px 0 0">Optional, but better: open Chrome&rsquo;s menu and choose
          <b>Add to Home screen</b> first. It then opens without the address bar and holds the notification
          permission more reliably.</p>
      </div>
    </div>

    <div class="card howcard">
      <div class="ch"><h2>On a computer</h2></div>
      <div class="cb">
        <ol class="steps">
          ${step(1, 'Open your profile card and turn notifications on', 'Chrome, Edge and Firefox all work. Safari on a Mac works too.')}
          ${step(2, 'Allow it when the browser asks')}
        </ol>
        <p class="note" style="margin:12px 0 0">They arrive whether or not the tab is open, as long as the browser is
          running. Close the browser entirely and they stop until you open it again.</p>
      </div>
    </div>

    <div class="card howcard">
      <div class="ch"><h2>Choosing what you get</h2></div>
      <div class="cb">
        <p class="note" style="margin:0 0 12px">Once it is on, the four checkboxes on the same card decide what
          actually reaches you. Untick everything and you will get nothing, which is the polite way to go quiet
          without turning the whole thing off.</p>
        <ul class="plain">
          <li><b>Someone goes live</b> &mdash; a stream starts.</li>
          <li><b>A night gets locked in</b> &mdash; a game night moves from proposed to confirmed.</li>
          <li><b>A wishlist game goes on sale</b> &mdash; something on your Steam wishlist drops in price.</li>
          <li><b>People gather in voice</b> &mdash; enough of the crew pile into a voice room.</li>
        </ul>
        <p class="note" style="margin:12px 0 0">There is a <b>Send me a test one</b> button next to the toggle.
          If the test arrives, everything is wired up.</p>
      </div>
    </div>

    <div class="card howcard">
      <div class="ch"><h2>If they stop arriving</h2></div>
      <div class="cb">
        <ul class="plain">
          <li>Turn the toggle off and on again. That re-registers the device, which fixes most of it.</li>
          <li>On an iPhone, check you are opening the home-screen icon and not a Safari tab.</li>
          <li>Deleting the home-screen icon, or clearing the browser&rsquo;s site data, drops the registration.
            Add it back and turn the toggle on again.</li>
          <li>Each device counts separately. Turning it on your phone does nothing for your laptop.</li>
          <li>Phone in Do Not Disturb or a Focus mode will hold them back silently.</li>
        </ul>
      </div>
    </div>

    <p class="note" style="margin-top:16px">Site address, if you need to type it on another device:
      <code>${esc(site)}</code></p>
  </section>`;
}

module.exports = { home, crew, clips, play, settings, notifyHelp, activityLine, rankOf, when, channelName };
