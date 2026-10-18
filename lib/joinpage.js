const S = require('./store');
const G = require('./gateway');
const St = require('./streams');
const V = require('./views');
const U = require('./uploads');
const Widget = require('./widget');
const Site = require('./site');

const esc = V.esc;

function cfg() { return S.read('config', {}); }

function showNames() { return cfg().joinNames !== false; }

function firstName(m) {
  const n = m.nick || m.global_name || m.username || '';
  return String(n).split(/[\s|\-_(]/)[0].slice(0, 18) || n.slice(0, 18);
}

function counts() {
  const people = G.roster().filter(m => !m.bot);
  const pres = G.live.presence || {};
  const voice = G.live.voice || {};
  return {
    members: people.length,
    online: people.filter(m => (pres[m.id] || {}).status && pres[m.id].status !== 'offline').length,
    voice: people.filter(m => (voice[m.id] || {}).channel).length,
    live: St.liveList().length
  };
}

function aroundNow() {
  const pres = G.live.presence || {};
  const voice = G.live.voice || {};
  return G.roster()
    .filter(m => !m.bot)
    .filter(m => (pres[m.id] || {}).status && pres[m.id].status !== 'offline')
    .sort((a, b) => (voice[b.id] ? 1 : 0) - (voice[a.id] ? 1 : 0))
    .slice(0, 12);
}

function tonight() {
  return S.read('sessions', []).filter(s => s.at > Date.now() - 20 * 3600000).slice(0, 4);
}

function nextNight() {
  try {
    const slots = S.read('slots', []);
    const ev = S.read('event', null);
    if (ev && ev.when) return ev.when;
    const top = slots.slice().sort((a, b) => (b.votes || []).length - (a.votes || []).length)[0];
    return top ? top.label : '';
  } catch (e) { return ''; }
}

function liveNow() {
  return St.liveList().map(l => ({
    name: l.name || l.handle,
    game: l.game || '',
    url: l.url || ''
  })).slice(0, 3);
}

function dot(status) {
  return V.DOT[status] || V.DOT.offline;
}

function page() {
  const c = cfg();
  const name = c.siteName || 'Afterhours';
  const inv = Widget.invite();
  const n = counts();
  const around = aroundNow();
  const sess = tonight();
  const lives = liveNow();
  const when = nextNight();
  const hero = U.siteImage('hero');
  const names = showNames();
  const pres = G.live.presence || {};
  const voice = G.live.voice || {};
  const blurb = c.joinBlurb ||
    'A small server that plays games together most nights. No schedule you have to keep, no quotas, ' +
    'no drama. Turn up when you want, hop in voice, play whatever is on.';

  const people = names && around.length
    ? `<div class="faces">${around.map(m => {
      const st = (pres[m.id] || {}).status || 'offline';
      const inV = !!(voice[m.id] || {}).channel;
      return `<span class="face${inV ? ' inv' : ''}">
        <span class="av" style="background:${V.tint(m)}">${m.avatar
          ? `<img src="${esc(m.avatar)}" alt="" loading="lazy" decoding="async">`
          : esc(V.initial(m))}<i style="background:${dot(st)}"></i></span>
        <b>${esc(firstName(m))}</b></span>`;
    }).join('')}</div>`
    : '';

  const sessHtml = sess.length
    ? `<div class="blk"><h2>On right now</h2><div class="rows">${sess.map(s => `<div class="rw">
        <span class="rwn">${esc(s.game)}</span>
        <span class="rwm">${esc(s.when)}${s.players ? ' &middot; ' + s.players.length + ' in' : ''}</span>
      </div>`).join('')}</div></div>`
    : '';

  const liveHtml = lives.length
    ? `<div class="blk"><h2>Streaming</h2><div class="rows">${lives.map(l => `<div class="rw">
        <span class="rwn">${esc(l.name)}</span>
        <span class="rwm">${esc(l.game || 'live now')}</span>
      </div>`).join('')}</div></div>`
    : '';

  const nextHtml = when
    ? `<div class="blk"><h2>Next night</h2><div class="rows"><div class="rw">
        <span class="rwn">${esc(when)}</span><span class="rwm">everyone welcome</span></div></div></div>`
    : '';

  const cta = inv
    ? `<a class="big" href="${esc(inv.url)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.3 5.3A17 17 0 0 0 15 4l-.2.4a16 16 0 0 1 3.7 1.2 11 11 0 0 0-12.9 0A16 16 0 0 1 9.3 4.4L9 4a17 17 0 0 0-4.3 1.3C2 9.3 1.3 13.2 1.6 17a17 17 0 0 0 5.2 2.6l1-1.7a11 11 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 10.9 0l.4.3a11 11 0 0 1-1.7.8l1 1.7a17 17 0 0 0 5.2-2.6c.4-4.4-.6-8.3-2.9-11.7ZM8.5 14.8c-1 0-1.9-1-1.9-2.1 0-1.2.9-2.1 1.9-2.1 1.1 0 2 1 1.9 2.1 0 1.2-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-1-1.9-2.1 0-1.2.9-2.1 1.9-2.1 1.1 0 2 1 1.9 2.1 0 1.2-.8 2.1-1.9 2.1Z"/></svg>
        Join on Discord</a>`
    : `<p class="noinv">The invite link is not set up yet. Ask in chat and someone will send you one.</p>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Join ${esc(name)}</title>
<meta name="description" content="${esc(blurb.slice(0, 150))}">
<meta property="og:title" content="Join ${esc(name)}">
<meta property="og:description" content="${esc(blurb.slice(0, 150))}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600&display=swap">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<style>
:root{--bg:#09090F;--surf:rgba(255,255,255,.04);--surf2:rgba(255,255,255,.07);
  --line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);
  --txt:#F3F4F8;--dim:#9B9BB2;--faint:#64647E;
  --iris:#7C5CFF;--iris2:#A78BFA;--aqua:#38D9F0;--lime:#4ADE80;--dc:#5865F2;
  color-scheme:dark}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--txt);font-family:"Plus Jakarta Sans",system-ui,sans-serif;
  font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;letter-spacing:-.01em;overflow-x:hidden}
.aura{position:fixed;inset:0;z-index:-2;overflow:hidden;background:var(--bg)}
.aura i{position:absolute;display:block;border-radius:50%;filter:blur(130px);opacity:.22}
.aura i:nth-child(1){width:50vmax;height:50vmax;left:-14vmax;top:-20vmax;background:var(--iris)}
.aura i:nth-child(2){width:40vmax;height:40vmax;right:-12vmax;top:30vh;background:var(--aqua);opacity:.13}
.wrap{max-width:640px;margin:0 auto;padding:clamp(28px,7vw,60px) 20px 60px}
h1,h2{margin:0;font-weight:800;letter-spacing:-.035em;line-height:1.1;text-wrap:balance}
.mark{width:52px;height:52px;margin-bottom:18px}
h1{font-size:clamp(30px,7vw,44px);margin-bottom:10px}
.lede{color:var(--dim);font-size:16px;max-width:46ch;margin-bottom:22px}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px}
.pill{display:inline-flex;align-items:center;gap:7px;background:var(--surf);border:1px solid var(--line);
  border-radius:10px;padding:7px 12px;font-size:13px;font-weight:600}
.pill b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:14px}
.pill.on{border-color:rgba(74,222,128,.4);background:rgba(74,222,128,.09);color:#BBF7D0}
.ldot{width:7px;height:7px;border-radius:50%;background:var(--lime);
  box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:p 2s infinite}
@keyframes p{70%{box-shadow:0 0 0 7px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
.faces{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:26px}
.face{display:flex;flex-direction:column;align-items:center;gap:5px;width:58px}
.av{position:relative;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;
  font-weight:700;font-size:17px;color:#09090F;box-shadow:0 3px 12px rgba(0,0,0,.4)}
.av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
.av i{position:absolute;right:0;bottom:0;width:13px;height:13px;border-radius:50%;border:3px solid var(--bg)}
.face.inv .av{box-shadow:0 0 0 2px rgba(74,222,128,.55),0 3px 12px rgba(0,0,0,.4)}
.face b{font-size:11px;font-weight:600;color:var(--dim);max-width:58px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.blk{margin-bottom:20px}
.blk h2{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--faint);margin-bottom:9px}
.rows{display:grid;gap:6px}
.rw{display:flex;justify-content:space-between;gap:12px;background:var(--surf);
  border:1px solid var(--line);border-radius:11px;padding:11px 14px;min-width:0}
.rwn{font-size:14.5px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rwm{font-size:12.5px;color:var(--faint);flex:none}
.big{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;
  background:var(--dc);color:#fff;font-size:16px;font-weight:800;padding:16px 22px;border-radius:14px;
  text-decoration:none;margin-top:8px;transition:transform .16s ease,filter .16s ease}
.big:hover{transform:translateY(-2px);filter:brightness(1.08)}
.big svg{width:22px;height:22px}
.noinv{background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:14px;
  font-size:14px;color:var(--dim)}
.after{font-size:12.5px;color:var(--faint);margin-top:14px;text-align:center}
.quiet{background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:14px 16px;
  font-size:14px;color:var(--dim);margin-bottom:22px}
@media (max-width:420px){.face{width:52px}.av{width:42px;height:42px}}
</style></head><body>
<div class="aura"><i></i><i></i></div>
<main class="wrap">
  <svg class="mark" viewBox="18 18 84 84" aria-hidden="true">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7C5CFF"/><stop offset=".52" stop-color="#A78BFA"/>
      <stop offset="1" stop-color="#38D9F0"/></linearGradient>
      <mask id="m"><circle cx="60" cy="60" r="36" fill="#fff"/><circle cx="84" cy="46" r="33.6" fill="#000"/></mask>
    </defs><circle cx="60" cy="60" r="36" fill="url(#g)" mask="url(#m)"/></svg>
  <h1>${esc(name)}</h1>
  <p class="lede">${esc(blurb)}</p>

  <div class="pills">
    ${n.online ? `<span class="pill on"><span class="ldot"></span><b>${n.online}</b> online now</span>` : ''}
    ${n.voice ? `<span class="pill"><b>${n.voice}</b> in voice</span>` : ''}
    ${n.live ? `<span class="pill"><b>${n.live}</b> streaming</span>` : ''}
    <span class="pill"><b>${n.members}</b> in the crew</span>
  </div>

  ${people}
  ${!n.online ? '<p class="quiet">Nobody is on at this exact second. It picks up in the evenings, and people drop in all night.</p>' : ''}
  ${liveHtml}
  ${sessHtml}
  ${nextHtml}

  ${cta}
  <p class="after">Free, no application, no vetting. Sign in with Discord afterwards to see the rest of the site.</p>
</main>
</body></html>`;
}

module.exports = { page, counts, showNames };
