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

const esc = V.esc;

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
  const verb = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' }[a.type] || '';
  return (verb ? verb + ' ' : '') + a.name + (a.details ? ' — ' + a.details : '');
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

/* ================= HOME ================= */

function home(ctx) {
  const { cfg, perms, me } = ctx;
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

  const presRows = roster.length ? roster.map(m => {
    const rank = rankOf(m);
    const status = m.presence.status || 'offline';
    const live = St.liveFor(m.id);
    return `<div class="prow">${V.avatar(m, 36, status)}
      <span style="min-width:0;flex:1"><span class="pn">${esc(m.nick || m.global_name || m.username)}
        <span class="rk" style="color:${rank.colour}">${esc(rank.name.toUpperCase())}</span>${SP.presenceTag(m.id)}</span>
        <span class="pd">${live ? esc('Streaming · ' + (live.game || live.title)) : esc(activityLine(m.presence))}</span></span>
      ${live ? `<a class="jb" href="${esc(live.url)}" target="_blank" rel="noopener">Watch</a>` : ''}</div>`;
  }).join('') : '<p class="empty">Nobody loaded yet. The bot may still be connecting.</p>';

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
  ].map(f => `<article class="feat">
      ${V.photo(f[3], '', U.siteImage(f[3]), perms.images, `<div class="fb">${f[0]}</div><h3 class="ft">${f[1]}</h3>`)}
      <p class="fd">${f[2]}</p></article>`).join('');

  const warn = !st.ready && st.error
    ? `<div class="banner bad"><span>&#9888;</span><span><b>Discord link down.</b> ${esc(st.error)}</span></div>`
    : '';

  return `<div class="hero">${V.photo('hero', '', U.siteImage('hero'), perms.images)}
  <div class="wrap heroin">
    <p class="kick">Welcome back, ${esc(me.name)}</p>
    <h1>${esc(cfg.heroTitle || 'Good nights start here')}</h1>
    <p>${esc(cfg.heroSub || 'Find who’s on, grab an open spot, pick something to play.')}</p>
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
</section>`;
}

/* ================= CREW ================= */

function crewPeople(ctx, q) {
  const { perms, me } = ctx;
  const warn = q && q.e === 'steam'
    ? '<div class="banner bad"><span>&#9888;</span><span>Steam did not recognise that profile. Paste the full <b>steamcommunity.com/profiles/…</b> URL, or your 17-digit SteamID64. A custom name only works if the server has a Steam API key.</span></div>'
    : '';
  const roster = G.roster();
  const order = roster.filter(m => m.id === me.id).concat(roster.filter(m => m.id !== me.id));

  const cards = order.map(m => {
    const rank = rankOf(m);
    const prof = profileOf(m.id);
    const isme = m.id === me.id;
    const status = m.presence.status || 'offline';
    const sum = Stats.summary(m.id);
    const badges = (prof.badges || []).map(b => `<span class="bdg">${esc(b)}</span>`).join('');
    const earned = Ach.forUser(m.id).filter(a => a.got);
    const achBadges = earned.slice(0, 3).map(a => `<span class="bdg gold">${a.ico} ${esc(a.n)}</span>`).join('');
    return `<article class="pcard${isme ? ' isme' : ''}" id="${isme ? 'me' : 'u' + m.id}">
      ${isme ? '<span class="youtag">You</span>' : ''}
      ${V.photo('banner-' + m.id, 'pban', U.bannerOf(m.id), isme || perms.members)}
      <div class="pmain">
        <div class="pbig" style="background:${V.tint(m)}">${m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : esc(V.initial(m))}
          <span class="st" style="background:${V.DOT[status]}"></span></div>
        <h3 style="font-size:17px">${esc(m.nick || m.global_name || m.username)}</h3>
        <div style="font-size:12px;color:var(--faint);margin-bottom:7px">@${esc(m.username)}</div>
        <span class="rpill" style="color:${rank.colour};background:${rank.colour}1A"><i></i>${esc(rank.name)}</span>
        <p class="pbio">${prof.bio ? esc(prof.bio) : '<span style="opacity:.55">No bio yet.</span>'}</p>
        ${badges || achBadges ? `<div class="badges">${badges}${achBadges}</div>` : ''}
        <dl class="kv">
          <div class="kvr"><dt>Now<span class="dcs">DISCORD</span></dt><dd>${esc(activityLine(m.presence))}</dd></div>
          <div class="kvr"><dt>Rank<span class="dcs">DISCORD</span></dt><dd style="color:${rank.colour}">${esc(rank.name)}</dd></div>
          <div class="kvr"><dt>In voice</dt><dd>${Stats.dur(sum.voiceMin)}</dd></div>
          <div class="kvr"><dt>Nights</dt><dd>${sum.nights}${sum.hosted ? ' · ' + sum.hosted + ' hosted' : ''}</dd></div>
          <div class="kvr"><dt>Joined</dt><dd>${m.joined_at ? esc(new Date(m.joined_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })) : '—'}</dd></div>
        </dl>
        ${SP.profileBlock(m.id, isme)}
        <div class="row" style="margin-top:11px">
          <a class="btn sm ghost" href="/crew/stats?who=${esc(m.id)}">Stats</a>
          ${isme ? '<button class="btn sm ghost" id="editMe">Edit profile</button>' : ''}
        </div>
        ${isme ? `<form method="post" action="/profiles/me" id="meForm" hidden style="margin-top:11px">
          <label class="fld" for="bio">Your bio</label>
          <textarea id="bio" name="bio" rows="2" maxlength="240">${esc(prof.bio || '')}</textarea>
          <label class="fld" for="badges">Badges, comma separated</label>
          <input type="text" id="badges" name="badges" maxlength="160" value="${esc((prof.badges || []).join(', '))}">
          <button class="btn sm" style="margin-top:10px">Save</button>
        </form>` : ''}
      </div></article>`;
  }).join('');

  return warn + `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(258px,1fr))">${cards || '<p class="empty">Nobody loaded yet.</p>'}</div>`;
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

/* ================= CLIPS ================= */

function channelName(id) {
  const c = G.live.channels[id];
  return c ? c.name : 'channel';
}

/* The pin button carries the pin count itself, so the same emoji is never
   shown twice on one post. */
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

function clips(ctx, sub, q) {
  const body = sub === 'memories' ? clipsMemories(ctx)
    : sub === 'live' ? SP.livePane(ctx, q && q.watch)
    : clipsMedia(ctx);
  return shell('clips', 'Clips', 'Everything mirrored out of Discord, plus whoever’s streaming.', sub, body, ctx.perms);
}

/* ================= PLAY ================= */

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

  return `<div class="cols">
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

  const rows = lib.length ? lib.map(g => {
    const all = roster.length > 0 && g.owners.length >= roster.length;
    const ows = roster.map(m => {
      const has = g.owners.indexOf(m.id) > -1;
      return `<span class="ow${has ? '' : ' no'}" style="${has ? 'background:' + V.tint(m) : ''}" title="${esc(m.username)}">${m.avatar && has ? `<img src="${esc(m.avatar)}" alt="">` : esc(V.initial(m))}</span>`;
    }).join('');
    const mine = g.owners.indexOf(me.id) > -1;
    return `<div class="librow">
      <span class="libn">${esc(g.name)}</span>
      <span class="owners">${ows}</span>
      ${all ? '<span class="allin">Everyone</span>' : `<span class="note">${g.owners.length} of ${roster.length}</span>`}
      <button class="jb${mine ? ' in' : ''}" data-own="${esc(g.id)}">${mine ? 'I own it' : 'I own it too'}</button>
    </div>`;
  }).join('') : '<p class="empty">Nothing in the library yet.</p>';

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

  const never = Sg.neverPlayed(3);
  const shelfCard = never.length ? `<div class="card" style="margin-bottom:14px">
    <div class="ch"><h2>Never once launched</h2>
      <span class="note">${never.length} of them</span></div>
    <div class="cb">${never.slice(0, 8).map(r => `<div class="librow">
      <span class="libn">${esc(r.name)}</span>
      <span class="note">${r.owners.length} of you own it</span>
      ${r.appid ? `<a class="btn sm ghost" href="https://store.steampowered.com/app/${esc(r.appid)}" target="_blank" rel="noopener">Store</a>` : ''}
    </div>`).join('')}
      ${never.length > 8 ? `<p class="note" style="margin-top:9px">&hellip;and ${never.length - 8} more.</p>` : ''}
    </div></div>` : '';

  return nowCard + shelfCard + `<div class="card"><div class="ch"><h2>Owned</h2><span class="note">green means everyone has it</span></div>
    <div class="cb"><div class="lib" id="lib">${rows}</div>
      <form method="post" action="/games/add" style="margin-top:12px;display:flex;gap:9px;flex-wrap:wrap">
        <input type="text" name="name" placeholder="Add a game" maxlength="60" required style="flex:1;min-width:180px">
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
    <div class="ch"><h2>On sale now</h2><span class="note">wanted by two or more of you</span></div>
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

/* ================= SETTINGS ================= */

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

/* Whether anything written here actually survives a deploy. People set
   DATA_DIR and assume that is the whole job, so say it plainly either way. */
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

/* The music settings post to the same place as the rest of Site, so they carry
   the other fields through untouched rather than blanking them. */
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
      <input type="text" id="heroTitle" name="heroTitle" value="${esc(cfg.heroTitle || '')}" maxlength="60">
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
        <div><label class="fld" for="tempLimit">Spots in each new room, 0 for no limit</label>
          <input type="text" id="tempLimit" name="tempLimit" maxlength="2" value="${esc(String(cfg.tempLimit || ''))}" placeholder="0"></div>
        <div></div>
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

  return saved + rrerr + pings + voice + react + welcome + `<div class="card" style="margin-bottom:14px"><div class="cb">
      <div class="kvr" style="font-size:14.5px"><dt>Gateway</dt>
        <dd style="color:${st.ready ? 'var(--lime)' : 'var(--rose)'}">${st.ready ? 'Connected' : 'Not connected'}</dd></div>
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

module.exports = { home, crew, clips, play, settings, activityLine, rankOf, when, channelName };
