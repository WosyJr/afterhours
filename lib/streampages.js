const V = require('./views');
const S = require('./store');
const G = require('./gateway');
const St = require('./streams');
const Steam = require('./steam');

const esc = V.esc;

const TW = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 2 2.5 6v14h5v3h3l3-3h4l5-5V2H4Zm16 11-3 3h-4l-3 3v-3H6V4h14v9Zm-5-6h2v5h-2V7Zm-5 0h2v5h-2V7Z"/></svg>';
const YT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12s0-3.4-.4-5a2.6 2.6 0 0 0-1.8-1.8C18.1 4.8 12 4.8 12 4.8s-6.1 0-7.8.4A2.6 2.6 0 0 0 2.4 7C2 8.6 2 12 2 12s0 3.4.4 5a2.6 2.6 0 0 0 1.8 1.8c1.7.4 7.8.4 7.8.4s6.1 0 7.8-.4A2.6 2.6 0 0 0 21.6 17c.4-1.6.4-5 .4-5Zm-12 3.2V8.8L15.5 12 10 15.2Z"/></svg>';

function badge(platform) {
  if (platform === 'twitch') return `<span class="pb tw">${TW}Twitch</span>`;
  if (platform === 'youtube') return `<span class="pb yt">${YT}YouTube</span>`;
  return '<span class="pb off">Not linked</span>';
}

function uptime(ms) {
  if (!ms) return '';
  const m = Math.floor((Date.now() - ms) / 60000);
  const h = Math.floor(m / 60);
  return (h ? h + 'h ' : '') + (m % 60) + 'm';
}

function sinceDays(ms) {
  if (!ms) return null;
  const d = Math.round((Date.now() - ms) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
}

function memberName(uid) {
  const m = G.live.members[uid];
  if (m) return m.nick || m.global_name || m.username;
  const u = S.read('users', {})[uid];
  return u ? u.name : 'Someone';
}

function memberOf(uid) {
  return G.live.members[uid] || { id: uid, name: memberName(uid) };
}

function liveBar() {
  const ls = St.liveList();
  if (!ls.length) return '';
  const s = ls[0];
  const cls = s.platform === 'twitch' ? 'tw' : 'yt';
  return `<div class="livebar"><div class="wrap"><div class="livein">
    <span class="rdot"></span><span class="lw">LIVE</span>
    ${V.avatar(memberOf(s.uid), 26)}
    <span class="lt"><b>${esc(memberName(s.uid))}</b> &mdash; ${esc(s.title)}</span>
    ${badge(s.platform)}
    <span class="lm">${s.viewers != null ? s.viewers + ' watching' : 'live'}${s.started ? ' &middot; ' + uptime(s.started) : ''}</span>
    ${ls.length > 1 ? `<a class="btn sm ghost" href="/clips/live">+${ls.length - 1} more</a>` : ''}
    <a class="btn sm ${cls}" style="margin-left:auto" href="${esc(s.url)}" target="_blank" rel="noopener">Watch</a>
  </div></div></div>`;
}

function card(s, featured, embed) {
  const cls = s.platform === 'twitch' ? 'tw' : 'yt';
  const where = s.platform === 'twitch' ? 'Twitch' : 'YouTube';
  const media = embed && s.embed
    ? `<div class="embed"><iframe src="${esc(s.embed)}" allowfullscreen allow="autoplay; fullscreen; encrypted-media" title="${esc(s.title)}"></iframe></div>`
    : V.photo('stream-' + s.uid, '', s.thumb ? { url: s.thumb, kind: 'img' } : null, false,
      `<span class="onair"><i></i>LIVE</span>` +
      (s.viewers != null ? `<span class="vcount">&#9673; ${s.viewers}</span>` : '') +
      (s.started ? `<span class="upt">${uptime(s.started)}</span>` : ''),
      `onclick="location.href='/clips/live?watch=${encodeURIComponent(s.uid)}'"`);
  return `<article class="scard${featured ? ' hot' : ''}">${media}
    <div class="sbar"><p class="sttl">${esc(s.title)}</p>
      <div class="sline">${V.avatar(memberOf(s.uid), 24)}<b style="color:var(--txt)">${esc(memberName(s.uid))}</b>
        ${badge(s.platform)}${s.game ? `<span>${esc(s.game)}</span>` : ''}</div>
      <div class="sact">
        <a class="btn sm ${cls}" href="${esc(s.url)}" target="_blank" rel="noopener">Open on ${where}</a>
        ${embed ? '<a class="btn sm ghost" href="/clips/live">Close player</a>'
          : (s.embed ? `<a class="btn sm ghost" href="/clips/live?watch=${encodeURIComponent(s.uid)}">Watch here</a>` : '')}
      </div></div></article>`;
}

function homeLive() {
  const ls = St.liveList();
  if (!ls.length) return '';
  return `<div class="card" style="margin-bottom:14px;border-color:rgba(224,27,27,.35)">
    <div class="ch"><h2><span class="rdot" style="display:inline-block;vertical-align:1px"></span> Live now</h2>
      <a class="btn sm ghost" href="/clips/live">See all ${ls.length}</a></div>
    <div class="cb">${card(ls[0], false, false)}</div></div>`;
}

function livePane(ctx, watchUid) {
  const ls = St.liveList();
  const st = St.status();
  const links = St.links();
  const roster = G.roster();

  const featured = ls.length
    ? ls.map(s => card(s, true, s.uid === watchUid)).join('')
    : `<div class="card"><div class="cb"><p class="empty">Nobody is live. Checked ${st.checkedAt ? uptime(st.checkedAt) + ' ago' : 'not yet'}.</p></div></div>`;

  const rows = roster.map(m => {
    const mine = links.filter(l => l.uid === m.id);
    const live = St.liveFor(m.id);
    const last = sinceDays(St.lastLive(m.id));
    if (!mine.length) {
      return `<div class="chanrow">${V.avatar(m, 30)}
        <span><span class="pn" style="font-size:14px">${esc(m.nick || m.global_name || m.username)}</span>
        <div class="chh">no channel linked</div></span>
        ${badge(null)}<span class="chs">&mdash;</span></div>`;
    }
    return mine.map(l => `<div class="chanrow${live && live.platform === l.platform ? ' live' : ''}">
      ${V.avatar(m, 30)}
      <span><span class="pn" style="font-size:14px">${esc(m.nick || m.global_name || m.username)}</span>
        <div class="chh">${esc(l.handle)}</div></span>
      ${badge(l.platform)}
      <span class="chs${live && live.platform === l.platform ? ' on' : ''}">
        ${live && live.platform === l.platform ? 'LIVE' + (live.started ? ' · ' + uptime(live.started) : '')
          : last ? 'last live ' + last : 'offline'}</span></div>`).join('');
  }).join('');

  const errs = Object.keys(st.errors || {});
  const errBanner = errs.length
    ? `<div class="banner bad"><span>&#9888;</span><span>${errs.map(k => `<b>${esc(k)}</b>: ${esc(st.errors[k])}`).join('<br>')}</span></div>`
    : '';

  return errBanner + featured + `<div class="card" style="margin-top:14px">
      <div class="ch"><h2>Channels</h2>
        <span class="note">${esc(st.twitch ? 'Twitch API' : 'Twitch not configured')} &middot; YouTube ${esc(st.youtube)}</span></div>
      <div class="cb">${rows || '<p class="empty">Nobody loaded yet.</p>'}</div>
    </div>`;
}

const STEAM = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-10 9.6l5.4 2.2a2.8 2.8 0 0 1 1.6-.5h.2l2.4-3.4v-.1a3.8 3.8 0 1 1 3.8 3.8h-.1l-3.4 2.4v.2a2.8 2.8 0 1 1-5.6-.2L2.4 14.4A10 10 0 1 0 12 2Zm-3.6 13.2 1.2.5a2.1 2.1 0 1 0 1.2-2.9l1.3.5a1.6 1.6 0 1 1-1.2 2.9l-2.5-1Zm9.1-5.9a2.5 2.5 0 1 0-2.6 2.5 2.5 2.5 0 0 0 2.6-2.5Zm-4.4 0a1.9 1.9 0 1 1 1.9 1.9 1.9 1.9 0 0 1-1.9-1.9Z"/></svg>';

function steamBadge() { return '<span class="pb st">' + STEAM + 'Steam</span>'; }

function profileBlock(uid, isme) {
  const prof = S.read('profiles', {})[uid] || {};
  const live = St.liveFor(uid);
  const rows = [];
  if (prof.twitch) rows.push({ platform: 'twitch', handle: prof.twitch });
  if (prof.youtube) rows.push({ platform: 'youtube', handle: prof.youtube });

  const chans = rows.map(r => `<div class="chanrow${live && live.platform === r.platform ? ' live' : ''}" style="margin:0 0 6px">
      ${badge(r.platform)}<span class="chh">${esc(r.handle)}</span>
      <span class="chs${live && live.platform === r.platform ? ' on' : ''}">${live && live.platform === r.platform ? 'LIVE' : 'offline'}</span></div>`).join('');

  const sv = Steam.stateFor(uid);
  const steamWord = sv.visible === 'private' ? 'set to private'
    : sv.visible === 'missing' ? 'no such account'
      : sv.visible === 'unchecked' ? 'not read yet'
        : sv.visible === 'nokey' ? 'no Steam API key set'
          : sv.visible === 'unknown' ? 'Steam would not answer'
          : sv.why ? 'could not read it'
            : sv.items ? sv.items + ' wishlisted'
              : 'public · wishlist empty';
  const steamBad = sv.visible !== 'public' || !!sv.why;
  const steamRow = prof.steam
    ? `<div class="chanrow" style="margin:0 0 6px">${steamBadge()}
        <span class="chh">${esc(String(prof.steam).slice(0, 20))}</span>
        <span class="chs${steamBad ? ' warn' : ''}">${steamWord}</span></div>`
    : '';

  const list = (chans + steamRow) || '<div class="chanrow" style="margin:0"><span class="chh">Nothing connected yet</span></div>';

  const form = isme ? `<form method="post" action="/profiles/connections" class="linkform" id="meLinks" hidden>
      <div class="linkrow">${badge('twitch')}<input type="text" name="twitch" placeholder="username" value="${esc(prof.twitch || '')}" maxlength="40"></div>
      <div class="linkrow">${badge('youtube')}<input type="text" name="youtube" placeholder="@handle or channel ID" value="${esc(prof.youtube || '')}" maxlength="60"></div>
      <div class="linkrow">${steamBadge()}<input type="text" name="steam" placeholder="Profile URL or SteamID64" value="${esc(prof.steam || '')}" maxlength="120"></div>
      <p class="note" style="margin:0">Your Steam profile and its <b>Game details</b> both have to be public, or there is
        nothing for the site to read. An empty wishlist on a public profile is fine and is not reported as private.</p>
      <button class="btn sm" style="justify-self:start">Save connections</button></form>` : '';

  return `<div style="margin-top:11px;padding-top:10px;border-top:1px solid var(--line)">${list}${form}</div>`;
}

function presenceTag(uid) {
  const live = St.liveFor(uid);
  if (!live) return '';
  return ` <span class="pb ${live.platform === 'twitch' ? 'tw' : 'yt'}">LIVE</span>`;
}

module.exports = { liveBar, homeLive, livePane, card, profileBlock, presenceTag, badge, steamBadge, uptime, sinceDays, memberName, memberOf, TW, YT, STEAM };
