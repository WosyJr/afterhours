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

function shell(tab, title, lede, sub, body) {
  return `<section class="page wrap"><h1 class="ttl">${esc(title)}</h1>
    <p class="lede">${lede}</p>${V.subnav(tab, sub)}${body}</section>`;
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
    return `<button class="slot${mine ? ' mine' : ''}${i === bi ? ' best' : ''}" data-slot="${esc(s.id)}">
      <span class="f" style="width:${pct}%"></span>
      <span class="sd">${esc(s.label)}</span>
      <span class="sv">${s.votes.length}/${total}${i === bi ? ' &middot; winning' : ''}</span></button>`;
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
  const roles = G.live.roles;
  const roster = G.roster();
  const m = P.matrix();
  const rows = roles.map((r, i) => {
    const holders = roster.filter(x => rankOf(x).id === r.id);
    const allowed = P.KEYS.filter(k => m[r.id] && m[r.id][k]).length;
    return `<div class="rung${holders.length ? '' : ' vac'}">
      <span class="lv">${i + 1}</span>
      <span><span class="rkn" style="color:${r.colour}">${esc(r.name)}</span><br>
        <span class="rkd">${allowed} of ${P.KEYS.length} permissions</span></span>
      <span class="holder">${holders.length
        ? holders.map(h => V.avatar(h, 26)).join('')
        : '<span class="vacl">Nobody</span>'}</span></div>`;
  }).join('');
  return `<div class="card">${rows || '<div class="cb"><p class="empty">No roles loaded.</p></div>'}</div>`;
}

function crew(ctx, sub, q) {
  const body = sub === 'stats' ? crewStats(ctx, q && q.who)
    : sub === 'ranks' ? crewRanks(ctx)
    : crewPeople(ctx, q);
  return shell('crew', 'Crew', 'Everyone in the server, what they’re up to, and how the ranks sit.', sub, body);
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
  return shell('clips', 'Clips', 'Everything mirrored out of Discord, plus whoever’s streaming.', sub, body);
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
    return `<button class="slot${mine ? ' mine' : ''}${i === bi ? ' best' : ''}" data-slot="${esc(s.id)}">
      <span class="f" style="width:${pct}%"></span>
      <span class="sd">${esc(s.label)}</span>
      <span class="sv">${s.votes.length}/${total}${i === bi ? ' &middot; winning' : ''}</span></button>`;
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

function playLibrary(ctx) {
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

  return `<div class="card"><div class="ch"><h2>Owned</h2><span class="note">green means everyone has it</span></div>
    <div class="cb"><div class="lib" id="lib">${rows}</div>
      <form method="post" action="/games/add" style="margin-top:12px;display:flex;gap:9px;flex-wrap:wrap">
        <input type="text" name="name" placeholder="Add a game" maxlength="60" required style="flex:1;min-width:180px">
        <button class="btn sm">Add</button>
      </form>
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
    ? `<div class="banner warn"><span>&#128274;</span><span>${st.privateOnes} linked ${st.privateOnes === 1 ? 'profile is' : 'profiles are'} private, so nothing can be read from ${st.privateOnes === 1 ? 'it' : 'them'}. Steam profiles have to be public.</span></div>`
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

function play(ctx, sub) {
  const body = sub === 'library' ? playLibrary(ctx)
    : sub === 'deals' ? playDeals(ctx)
    : playNights(ctx);
  return shell('play', 'Play', 'When you’re next on, what you can all launch, and what’s cheap right now.', sub, body);
}

/* ================= SETTINGS ================= */

function chanSelect(name, label, chans, current) {
  return `<label class="fld" for="${name}">${label}</label>
    <select class="fullsel" id="${name}" name="${name}">
      <option value="">&mdash; none &mdash;</option>
      ${chans.map(c => `<option value="${esc(c.id)}"${c.id === current ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}
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
      <p class="note" style="margin-top:9px">Browsers refuse to play sound until someone has clicked on the page, so when
        this is on the first track is queued at the volume above and begins the moment they touch anything. Whoever pauses
        it stays paused, on their own browser, until they press play again.</p>
      <button class="btn sm" style="margin-top:12px">Save</button>
    </div></form>`;

  return `<form method="post" action="/settings" class="card">
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
      <input type="text" id="invite" name="invite" value="${esc(cfg.invite || '')}" maxlength="120">
      ${chanSelect('mediaChannel', 'Channel mirrored into Clips &rarr; Media', chans, cfg.mediaChannel)}
      ${chanSelect('memoriesChannel', 'Channel mirrored into Clips &rarr; Memories', chans, cfg.memoriesChannel)}
      ${chanSelect('liveChannel', 'Go-live announcements', chans, cfg.liveChannel)}
      ${chanSelect('announceChannel', 'Game night announcements', chans, cfg.announceChannel)}
      ${chanSelect('dealChannel', 'Steam sale alerts', chans, cfg.dealChannel)}
      ${chanSelect('achievementChannel', 'Achievement announcements', chans, cfg.achievementChannel)}
      <button class="btn sm" style="margin-top:13px">Save</button>
      <p class="note" style="margin-top:10px">Uploaded pictures and video: ${use.files} file${use.files === 1 ? '' : 's'}, ${use.mb}MB.</p>
    </div></form>` + music;
}

function settingsPerms(ctx, selected) {
  const roles = G.live.roles;
  const m = P.matrix();
  const roster = G.roster();
  const sel = selected || (roles[roles.length - 1] && roles[roles.length - 1].id) || null;

  const roleList = roles.map(r => {
    const count = roster.filter(x => x.roles.indexOf(r.id) > -1).length;
    return `<a class="rr${r.id === sel ? ' on' : ''}" href="/settings/perms?role=${encodeURIComponent(r.id)}">
      <span class="rd" style="background:${r.colour}"></span>
      <span class="rn" style="color:${r.colour}">${esc(r.name)}</span>
      <span class="rc">${count}</span></a>`;
  }).join('');

  const role = roles.filter(r => r.id === sel)[0];
  const isTop = role && roles[0] && role.id === roles[0].id;

  const permRows = role ? P.PERMS.map(x => {
    const on = !!(m[role.id] && m[role.id][x.k]);
    return `<form method="post" action="/permissions/toggle" class="perm">
      <input type="hidden" name="role" value="${esc(role.id)}">
      <input type="hidden" name="key" value="${esc(x.k)}">
      <span class="t"><span class="pn2">${esc(x.n)}</span><div class="pd2">${esc(x.d)}</div></span>
      <button class="sw${on ? ' on' : ''}" ${isTop ? 'disabled' : ''} aria-label="${esc(x.n)}"></button>
    </form>`;
  }).join('') : '';

  return `<div class="banner"><span>&#128161;</span><span>Roles, their colours and their order are read from your server. Someone with several roles gets everything all of them allow.</span></div>
    <div class="pw">
      <div class="card"><div class="ch"><h2>Server roles</h2><span class="note">from Discord</span></div>
        <div class="cb">${roleList || '<p class="empty">No roles loaded.</p>'}</div></div>
      <div class="card">
        ${role ? `<div class="ph"><span class="rd" style="width:12px;height:12px;background:${role.colour}"></span>
          <h3 style="color:${role.colour}">${esc(role.name)}</h3>
          <span class="note" style="margin-left:auto">position ${role.position} in Discord</span></div>
          ${permRows}
          ${isTop ? '<div class="perm"><span class="t" style="color:var(--faint);font-size:13px">The highest role in the server keeps everything. That one can’t be switched off.</span></div>' : ''}`
          : '<div class="cb"><p class="empty">Pick a role.</p></div>'}
      </div>
    </div>`;
}

function settingsDiscord(ctx) {
  const { cfg, perms } = ctx;
  const st = G.status();
  const cmds = [
    ['/quote', 'Save something to <b>Memories</b> without leaving Discord.'],
    ['/tonight', 'Who’s playing and how many spots are left.'],
    ['/next', 'The next game night and who has RSVPd.'],
    ['/live', 'Who’s streaming right now and where.'],
    ['/deals', 'Anything on sale two or more of you wishlisted.']
  ].map(c => `<div class="cmd"><span class="cmdn">${esc(c[0])}</span><span class="cmdd">${c[1]}</span></div>`).join('');

  const feats = [
    ['\u{1F464}', 'Sign-in builds your profile', 'OAuth with <b>identify</b> and <b>guilds.members.read</b>. Username, avatar and roles arrive on first sign-in.', 'dc-1'],
    ['\u{1F451}', 'Your Discord role is your rank', 'The bot reads your role list — names, colours, order. Change it in Discord, it changes here.', 'dc-2'],
    ['\u{1F4F8}', 'Channel mirroring', 'Point Media and Memories at any channels and they mirror live, reactions included.', 'dc-3'],
    ['\u{1F4FA}', 'Live alerts', 'Twitch and YouTube polled every minute, with a post to your server when someone starts.', 'dc-4']
  ].map(f => `<article class="feat">
      ${V.photo(f[3], '', U.siteImage(f[3]), perms.images, `<div class="fb">${f[0]}</div><h3 class="ft">${f[1]}</h3>`)}
      <p class="fd">${f[2]}</p></article>`).join('');

  return `<div class="card" style="margin-bottom:14px"><div class="cb">
      <div class="kvr" style="font-size:14.5px"><dt>Gateway</dt>
        <dd style="color:${st.ready ? 'var(--lime)' : 'var(--rose)'}">${st.ready ? 'Connected' : 'Not connected'}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Members cached</dt><dd>${st.members}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Roles</dt><dd>${st.roles}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Online</dt><dd>${st.online}</dd></div>
      <div class="kvr" style="font-size:14.5px"><dt>Commands registered</dt><dd>${Cmd.DEFS.length}</dd></div>
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
    ${cfg.invite ? `<a class="btn dcb" style="margin-bottom:14px" href="${esc(cfg.invite)}" target="_blank" rel="noopener">${V.DC_ICON}Open Discord</a>` : ''}
    <div class="feats">${feats}</div>`;
}

function settings(ctx, sub, q) {
  const body = sub === 'perms' ? settingsPerms(ctx, q && q.role)
    : sub === 'discord' ? settingsDiscord(ctx)
    : settingsSite(ctx, q);
  return shell('settings', 'Settings', 'How the site is wired to your server, and who can change what.', sub, body);
}

module.exports = { home, crew, clips, play, settings, activityLine, rankOf, when, channelName };
