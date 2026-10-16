const ST = require('./stamp');

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DOT = { online: '#4ADE80', idle: '#FBBF24', dnd: '#FB7185', offline: '#64647E' };

const NAV = [
  { k: 'home', n: 'Home', href: '/', subs: [] },
  { k: 'crew', n: 'Crew', subs: [['people', 'People'], ['stats', 'Stats'], ['ranks', 'Ranks']] },
  { k: 'clips', n: 'Clips', subs: [['media', 'Media'], ['memories', 'Memories'], ['live', 'Live']] },
  { k: 'play', n: 'Play', subs: [['nights', 'Nights'], ['library', 'Library'], ['deals', 'Deals']] },
  { k: 'settings', n: 'Settings', needs: 'settings', subs: [['site', 'Site'], ['perms', 'Permissions'], ['discord', 'Discord']] }
];

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/></svg>',
  crew: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 20c0-2.4-1-4-2.5-5"/></svg>',
  clips: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9.5 5 2.5-5 2.5Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="7" width="19" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15.5 11.5h.01M18 13.5h.01"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 18.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.3 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>'
};

const DC_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.3 5.4A17 17 0 0 0 15 4l-.3.6a15 15 0 0 1 3.8 1.3A13 13 0 0 0 12 4.6a13 13 0 0 0-6.5 1.3A15 15 0 0 1 9.3 4.6L9 4a17 17 0 0 0-4.3 1.4C2 9.4 1.3 13.3 1.7 17.2a17 17 0 0 0 5.2 2.6l1-1.7a11 11 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 10.8 0l.4.3a11 11 0 0 1-1.7.8l1 1.7a17 17 0 0 0 5.2-2.6c.5-4.5-.7-8.4-2.9-11.8ZM8.3 14.8c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm7.4 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z"/></svg>';

function seedOf(s) {
  return String(s || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function variantFor(key) {
  return 'p' + ((seedOf(key) % 8) + 1);
}

function tint(u) {
  const palette = [
    'linear-gradient(135deg,#7C5CFF,#A78BFA)', 'linear-gradient(135deg,#F472B6,#FB7185)',
    'linear-gradient(135deg,#38D9F0,#38BDF8)', 'linear-gradient(135deg,#FBBF24,#F59E0B)',
    'linear-gradient(135deg,#4ADE80,#22C55E)', 'linear-gradient(135deg,#A78BFA,#38D9F0)'
  ];
  return palette[seedOf((u && (u.id || u.name)) || 'x') % palette.length];
}

function initial(u) {
  const n = (u && (u.nick || u.global_name || u.name || u.username)) || '?';
  return n.slice(0, 1).toUpperCase();
}

function avatar(u, size, statusKey) {
  const s = size || 36;
  const img = u && u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc(initial(u));
  const st = statusKey ? `<span class="st" style="background:${DOT[statusKey] || DOT.offline}"></span>` : '';
  return `<span class="pav" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.36)}px;background:${tint(u)}">${img}${st}</span>`;
}

/* One markup shape for every picture on the site: a generated gradient
   underneath, whatever has been uploaded over it (still or video), the scrim,
   then anything the caller wants drawn on top. */
function photo(key, cls, media, canEdit, inner, attr) {
  const v = variantFor(key);
  let over = '';
  let extra = '';
  if (media && media.url) {
    if (media.kind === 'vid') {
      over = `<video class="vid" src="${esc(media.url)}" autoplay muted loop playsinline></video>`;
      extra = ' hasvid';
    } else {
      over = `<img class="real" src="${esc(media.url)}" alt="">`;
      extra = ' hasimg';
    }
  }
  const rep = canEdit
    ? `<label class="rep">Replace<input type="file" accept="image/*,video/*" data-ph="${esc(key)}"></label>`
    : '';
  return `<div ${attr || ''} data-key="${esc(key)}" class="photo ${v} ${cls || ''}${extra}">` +
    `<div class="layer"></div>${over}${rep}${inner || ''}</div>`;
}

function head(title, cfg) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · ${esc(cfg.siteName || 'Afterhours')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="${ST.url('style.css')}">
<link rel="icon" type="image/svg+xml" href="${ST.url('icon.svg')}">
<link rel="icon" type="image/png" sizes="32x32" href="${ST.url('icon-32.png')}">
<link rel="apple-touch-icon" href="${ST.url('icon-180.png')}">
<meta name="theme-color" content="#09090F">
</head><body>
<div class="aura" aria-hidden="true"><i></i><i></i></div>`;
}

/* The eclipse, inline so it animates and scales. One per page: the header has
   it, and the sign-in gate has it, and the gate draws no header. */
function ecMark() {
  return `<svg class="ecmark" viewBox="18 18 84 84" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ecg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7C5CFF"/><stop offset=".52" stop-color="#A78BFA"/><stop offset="1" stop-color="#38D9F0"/>
    </linearGradient>
    <filter id="echalo" x="-45%" y="-45%" width="190%" height="190%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="2.6"/></filter>
    <mask id="ecmask">
      <circle cx="60" cy="60" r="36" fill="#fff"/>
      <g class="ec-orbit"><circle class="ec-occ" cx="60" cy="60" r="33.6" fill="#000"/></g>
    </mask>
  </defs>
  <circle class="ec-halo" cx="60" cy="60" r="36" fill="url(#ecg)" mask="url(#ecmask)" filter="url(#echalo)"/>
  <circle cx="60" cy="60" r="36" fill="url(#ecg)" mask="url(#ecmask)"/>
</svg>`;
}

function mark(cfg) {
  return cfg.icon ? `<img src="${esc(cfg.icon)}" alt="">` : ecMark();
}

function markClass(cfg) { return cfg.icon ? 'bmark' : 'bmark ec'; }

function hrefFor(t) {
  if (t.href) return t.href;
  return '/' + t.k + (t.subs.length ? '/' + t.subs[0][0] : '');
}

function nav(active, me, perms, cfg) {
  const open = NAV.filter(t => !t.needs || perms[t.needs]);
  const main = open.map(t =>
    `<a class="nv${t.k === active ? ' on' : ''}" href="${hrefFor(t)}">${esc(t.n)}</a>`).join('');
  const bar = open.map(t =>
    `<a class="${t.k === active ? 'on' : ''}" href="${hrefFor(t)}">${ICON[t.k]}<span>${esc(t.n)}</span></a>`).join('');
  const rank = me && me.rank;

  return { top: `<header class="top"><div class="wrap"><div class="topin">
  <a class="brand" href="/"><span class="${markClass(cfg)}">${mark(cfg)}</span><span class="bname">${esc(cfg.siteName || 'Afterhours')}</span></a>
  <nav class="main">${main}</nav>
  <div class="me">
    <a class="meb" href="/crew/people#me">
      <span class="meav" style="background:${tint(me)}">${me && me.avatar ? `<img src="${esc(me.avatar)}" alt="">` : esc(initial(me))}<span class="st" style="background:${DOT[(me && me.status) || 'offline']}"></span></span>
      <span><span class="mename">${esc(me ? me.name : '')}</span><br>
      <span class="merank" style="color:${rank ? rank.colour : '#64647E'}">${esc(rank ? rank.name.toUpperCase() : 'MEMBER')}</span></span>
    </a>
    <a class="out" href="/logout">Sign out</a>
  </div>
</div></div></header>`, bottom: `<nav class="tabbar">${bar}</nav>` };
}

function subnav(tab, sub) {
  const t = NAV.filter(x => x.k === tab)[0];
  if (!t || !t.subs.length) return '';
  const cur = sub || t.subs[0][0];
  return '<div class="subnav">' + t.subs.map(s =>
    `<a class="sb${s[0] === cur ? ' on' : ''}" href="/${tab}/${s[0]}">${esc(s[1])}</a>`).join('') + '</div>';
}

function page(opts) {
  const { title, active, me, perms, cfg, body } = opts;
  const n = nav(active, me, perms, cfg);
  return head(title, cfg)
    + n.top
    + (opts.liveBar || '')
    + '<main class="fade">' + body + '</main>'
    + (opts.juke || '')
    + `<footer><div class="wrap"><p>Signed in with Discord. ${esc(cfg.siteName || 'Afterhours')} is private to the server.</p></div></footer>`
    + n.bottom
    + `<script>window.ME=${JSON.stringify({ id: me && me.id, perms: perms })};</script>`
    + `<script src="${ST.url('app.js')}" defer></script></body></html>`;
}

function gate(cfg, err, bg) {
  return head('Sign in', cfg)
    + `<div class="gate">${photo('gate-bg', 'bg', bg, false)}
  <div class="gatebox">
    <div class="${markClass(cfg)}">${mark(cfg)}</div>
    <h1>${esc(cfg.siteName || 'Afterhours')}</h1>
    <p>${esc(cfg.tagline || 'Private to the server. Sign in and your profile builds itself.')}</p>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}
    <div class="scopes"><ul>
      <li>Your username, avatar and banner</li>
      <li>Your roles in this server</li>
      <li>Nothing else &mdash; no messages, no DMs</li>
    </ul></div>
    <a class="btn dcb" style="width:100%" href="/login">${DC_ICON}Continue with Discord</a>
    <p class="gnote">Not in the server? You can't get in. That's the whole access rule.</p>
  </div>
</div></body></html>`;
}

module.exports = {
  esc, page, gate, nav, subnav, head, photo, avatar, initial, tint, variantFor,
  mark, markClass, ecMark, DOT, DC_ICON, NAV, ICON, hrefFor
};
