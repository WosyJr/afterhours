const S = require('./store');
const G = require('./gateway');
const ST = require('./stamp');
const V = require('./views');
const VR = require('./voicerooms');

const esc = V.esc;

function token() {
  const c = S.read('config', {});
  if (c.overlayKey) return c.overlayKey;
  c.overlayKey = S.id() + S.id().slice(0, 6);
  S.write('config', c);
  return c.overlayKey;
}

function rotate() {
  const c = S.read('config', {});
  c.overlayKey = S.id() + S.id().slice(0, 6);
  S.write('config', c);
  return c.overlayKey;
}

function roomsData() {
  const rooms = VR.roomsWithPeople();
  return Object.keys(rooms).map(id => ({
    id: id,
    name: (G.live.channels[id] || {}).name || 'Voice',
    people: rooms[id].map(uid => {
      const m = G.live.members[uid] || {};
      const v = G.live.voice[uid] || {};
      return {
        id: uid,
        name: m.nick || m.global_name || m.username || 'Someone',
        avatar: m.avatar || null,
        game: VR.gameOf(uid),
        mute: !!v.mute,
        deaf: !!v.deaf,
        stream: !!v.stream
      };
    })
  })).sort((a, b) => b.people.length - a.people.length);
}

function data() {
  const cfg = S.read('config', {});
  return {
    site: cfg.siteName || 'Afterhours',
    rooms: roomsData(),
    at: Date.now()
  };
}

function page(opts) {
  const o = opts || {};
  const cfg = S.read('config', {});
  const theme = o.theme === 'light' ? 'light' : 'dark';
  const scale = Math.max(0.5, Math.min(2.5, Number(o.scale) || 1));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(cfg.siteName || 'Afterhours')} overlay</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">
<style>
  :root { --fg:#fff; --dim:rgba(255,255,255,.62); --card:rgba(10,10,18,.72); --line:rgba(255,255,255,.1);
    --lime:#4ADE80; --iris:#9B86FF; }
  html.light { --fg:#12121c; --dim:rgba(18,18,28,.6); --card:rgba(255,255,255,.86); --line:rgba(0,0,0,.08); }
  * { box-sizing:border-box; }
  html, body { margin:0; background:transparent; }
  body { font:${scale * 15}px/1.35 'Plus Jakarta Sans', system-ui, sans-serif; color:var(--fg);
    padding:${Math.round(scale * 12)}px; -webkit-font-smoothing:antialiased; }
  .wrap { display:flex; flex-direction:column; gap:${Math.round(scale * 8)}px; align-items:flex-start; }
  .room { background:var(--card); border:1px solid var(--line); border-radius:${Math.round(scale * 14)}px;
    padding:${Math.round(scale * 10)}px ${Math.round(scale * 13)}px; min-width:${Math.round(scale * 190)}px;
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
    animation:in .32s cubic-bezier(.2,.8,.3,1) both; }
  @keyframes in { from { opacity:0; transform:translateX(-10px); } }
  .rn { font-size:${scale * 11}px; font-weight:800; letter-spacing:.09em; text-transform:uppercase;
    color:var(--dim); margin-bottom:${Math.round(scale * 7)}px; display:flex; gap:7px; align-items:center; }
  .rn i { font-style:normal; width:${scale * 6}px; height:${scale * 6}px; border-radius:50%;
    background:var(--lime); box-shadow:0 0 ${scale * 8}px var(--lime); }
  .p { display:flex; align-items:center; gap:${Math.round(scale * 8)}px; padding:${Math.round(scale * 3)}px 0; }
  .av { width:${Math.round(scale * 24)}px; height:${Math.round(scale * 24)}px; border-radius:50%;
    object-fit:cover; flex:none; background:var(--iris); display:grid; place-items:center;
    font-size:${scale * 10}px; font-weight:800; color:#09090F; }
  .pn { font-size:${scale * 14}px; font-weight:700; white-space:nowrap; }
  .pg { font-size:${scale * 11.5}px; color:var(--dim); white-space:nowrap; }
  .p.off .av, .p.off .pn { opacity:.45; }
  .tag { font-size:${scale * 9.5}px; font-weight:800; padding:1px ${Math.round(scale * 5)}px;
    border-radius:${Math.round(scale * 5)}px; background:rgba(224,27,27,.9); color:#fff; letter-spacing:.05em; }
  .none { opacity:0; }
</style></head><body class="${theme === 'light' ? '' : ''}">
<div class="wrap" id="w"></div>
<script>
  if (${theme === 'light'}) document.documentElement.className = 'light';
  var KEY = ${JSON.stringify(o.key || '')};
  var SHOW_GAME = ${o.games === false ? 'false' : 'true'};
  var MAX = ${Math.max(1, Math.min(20, Number(o.max) || 12))};
  var last = '';

  function initial(n) { return (n || '?').trim().charAt(0).toUpperCase(); }

  function draw(d) {
    var w = document.getElementById('w');
    var sig = JSON.stringify(d.rooms);
    if (sig === last) return;
    last = sig;
    if (!d.rooms.length) { w.innerHTML = ''; return; }
    var shown = 0;
    w.innerHTML = d.rooms.map(function (r) {
      var people = r.people.slice(0, Math.max(0, MAX - shown));
      shown += people.length;
      if (!people.length) return '';
      return '<div class="room"><div class="rn"><i></i>' + esc(r.name) + ' &middot; ' + r.people.length + '</div>' +
        people.map(function (p) {
          return '<div class="p' + (p.deaf ? ' off' : '') + '">' +
            (p.avatar ? '<img class="av" src="' + esc(p.avatar) + '" alt="">'
              : '<span class="av">' + esc(initial(p.name)) + '</span>') +
            '<span class="pn">' + esc(p.name) + '</span>' +
            (p.stream ? '<span class="tag">LIVE</span>' : '') +
            (SHOW_GAME && p.game ? '<span class="pg">' + esc(p.game) + '</span>' : '') +
            '</div>';
        }).join('') + '</div>';
    }).join('');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function pull() {
    fetch('/overlay.json?k=' + encodeURIComponent(KEY), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) draw(d); })
      .catch(function () {});
  }

  pull();
  setInterval(pull, 4000);
</script>
</body></html>`;
}

module.exports = { token, rotate, data, page, roomsData };
