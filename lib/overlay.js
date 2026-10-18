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

function nowPage(opts) {
  const o = opts || {};
  const S2 = require('./store');
  const cfg = S2.read('config', {});
  const key = String(o.key || '');
  const align = o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left';
  const scale = Math.max(0.5, Math.min(2.4, Number(o.scale) || 1));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Now playing</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap">
<style>
*{box-sizing:border-box;margin:0}
html,body{background:transparent}
body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#fff;padding:18px;
  font-size:${(16 * scale).toFixed(2)}px;display:flex;
  justify-content:${align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'}}
.np{display:flex;align-items:center;gap:.8em;background:rgba(9,9,15,.72);
  border:1px solid rgba(255,255,255,.14);border-radius:.9em;padding:.62em .95em;
  backdrop-filter:blur(14px);box-shadow:0 .5em 2em rgba(0,0,0,.45);
  opacity:0;transform:translateY(.5em);transition:opacity .4s ease,transform .4s ease;max-width:34em}
.np.on{opacity:1;transform:none}
.bars{display:flex;align-items:flex-end;gap:.16em;height:1.15em;flex:none}
.bars i{width:.2em;background:#A78BFA;border-radius:.1em;animation:b .9s ease-in-out infinite}
.bars i:nth-child(1){height:50%;animation-delay:0s}
.bars i:nth-child(2){height:100%;animation-delay:.18s}
.bars i:nth-child(3){height:70%;animation-delay:.36s}
.bars i:nth-child(4){height:40%;animation-delay:.1s}
@keyframes b{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
.txt{min-width:0}
.t{font-weight:800;font-size:1em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a{font-weight:500;font-size:.78em;color:#C9C6DA;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tag{font-size:.62em;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
  color:#86EFAC;background:rgba(74,222,128,.14);border-radius:.4em;padding:.18em .5em;flex:none}
@media (prefers-reduced-motion:reduce){.bars i{animation:none}.np{transition:none}}
</style></head><body>
<div class="np" id="np" hidden>
  <span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
  <span class="txt"><span class="t" id="t"></span><span class="a" id="a"></span></span>
  <span class="tag" id="d" hidden></span>
</div>
<script>
var KEY=${JSON.stringify(key)};
var box=document.getElementById('np'),T=document.getElementById('t'),
    A=document.getElementById('a'),D=document.getElementById('d');
var last='';
function paint(s){
  var on=s&&s.on&&s.track;
  if(!on){box.hidden=true;box.classList.remove('on');last='';return;}
  var id=s.track.id+'|'+s.track.name;
  if(id!==last){
    last=id;
    T.textContent=s.track.name||'';
    A.textContent=s.track.artist||(s.track.byName?'added by '+s.track.byName:'');
    A.hidden=!A.textContent;
    if(s.deckName){D.textContent=s.deckName;D.hidden=false;}else{D.hidden=true;}
  }
  box.hidden=false;
  requestAnimationFrame(function(){box.classList.add('on');});
}
function poll(){
  fetch('/overlay/now.json?k='+encodeURIComponent(KEY),{cache:'no-store'})
    .then(function(r){return r.ok?r.json():null;})
    .then(paint).catch(function(){});
}
poll();setInterval(poll,4000);
</script></body></html>`;
}

module.exports.nowPage = nowPage;

function playerPage(opts) {
  const o = opts || {};
  const key = String(o.key || '');
  const deck = o.deck === 'crew' ? 'crew' : 'safe';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radio player</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap">
<style>
:root{--bg:#09090F;--surf:rgba(255,255,255,.04);--line:rgba(255,255,255,.1);
  --txt:#F3F4F8;--dim:#9B9BB2;--faint:#64647E;--iris:#7C5CFF;--iris2:#A78BFA;--lime:#4ADE80;--rose:#FB7185}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--txt);font-family:"Plus Jakarta Sans",system-ui,sans-serif;
  padding:22px;display:flex;justify-content:center}
.wrap{width:100%;max-width:540px}
h1{font-size:19px;margin-bottom:3px;letter-spacing:-.02em}
.sub{font-size:13px;color:var(--dim);margin-bottom:16px}
.panel{background:var(--surf);border:1px solid var(--line);border-radius:15px;padding:16px}
.now{display:flex;align-items:center;gap:12px;min-width:0;margin-bottom:14px}
.bars{display:flex;align-items:flex-end;gap:3px;height:20px;flex:none}
.bars i{width:3px;background:var(--iris2);border-radius:2px}
.on .bars i{animation:b .9s ease-in-out infinite}
.bars i:nth-child(1){height:50%}.bars i:nth-child(2){height:100%;animation-delay:.18s}
.bars i:nth-child(3){height:70%;animation-delay:.36s}.bars i:nth-child(4){height:40%;animation-delay:.1s}
@keyframes b{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
.nt{min-width:0;flex:1}
.nt b{display:block;font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nt span{display:block;font-size:12.5px;color:var(--faint)}
.req{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--lime);
  background:rgba(74,222,128,.14);border-radius:6px;padding:2px 7px;flex:none}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button{font-family:inherit;font-size:13px;font-weight:700;padding:9px 16px;border-radius:10px;
  border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--txt);cursor:pointer}
button.go{background:var(--iris);border-color:var(--iris);color:#fff}
button:disabled{opacity:.45;cursor:default}
.vol{display:flex;align-items:center;gap:9px;margin-top:13px;font-size:12px;color:var(--faint)}
input[type=range]{flex:1;accent-color:var(--iris)}
.q{margin-top:16px}
.qh{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);
  font-weight:800;margin-bottom:8px}
.qr{display:flex;gap:9px;align-items:center;font-size:13px;padding:7px 10px;background:var(--surf);
  border:1px solid var(--line);border-radius:9px;margin-bottom:5px;min-width:0}
.qr span:first-child{color:var(--faint);font-size:11px;flex:none}
.qr .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qr .w{color:var(--faint);font-size:11.5px;flex:none}
.hint{font-size:12px;color:var(--faint);margin-top:14px;line-height:1.55}
.bad{color:var(--rose);font-size:12.5px;margin-top:10px}
</style></head><body><div class="wrap">
<h1>Radio player</h1>
<p class="sub">This page plays the music. Capture it in OBS as a browser source, or just leave the tab open.</p>
<div class="panel" id="panel">
  <div class="now"><span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <span class="nt"><b id="t">Nothing playing</b><span id="a"></span></span>
    <span class="req" id="r" hidden>Request</span></div>
  <div class="row">
    <button class="go" id="play">Play</button>
    <button id="skip">Skip</button>
    <select id="deck" style="padding:9px 12px;border-radius:10px;background:rgba(255,255,255,.06);
      color:var(--txt);border:1px solid var(--line);font-family:inherit;font-size:13px">
      <option value="safe">Stream safe</option><option value="crew">Crew</option></select>
  </div>
  <div class="vol"><span>Volume</span><input type="range" id="vol" min="0" max="100" value="70"><span id="vn">70</span></div>
  <p class="bad" id="err" hidden></p>
  <div class="q"><div class="qh">Queue</div><div id="q"></div></div>
  <p class="hint">Requests from the site play first, then it shuffles the deck. Leave this tab open while you
    stream. The now-playing overlay follows this player whenever it is running.</p>
</div>
<audio id="au"></audio>
</div>
<script>
var KEY=${JSON.stringify(key)};
var au=document.getElementById('au'),panel=document.getElementById('panel');
var T=document.getElementById('t'),A=document.getElementById('a'),R=document.getElementById('r');
var playB=document.getElementById('play'),skipB=document.getElementById('skip');
var deckS=document.getElementById('deck'),vol=document.getElementById('vol'),vn=document.getElementById('vn');
var errP=document.getElementById('err'),qBox=document.getElementById('q');
var running=false,cur=null;
deckS.value=${JSON.stringify(deck)};
au.volume=0.7;
vol.addEventListener('input',function(){au.volume=vol.value/100;vn.textContent=vol.value;});
function err(m){errP.hidden=!m;errP.textContent=m||'';}
function q(path){return path+(path.indexOf('?')>-1?'&':'?')+'k='+encodeURIComponent(KEY);}
function next(){
  fetch(q('/api/radio/next?deck='+encodeURIComponent(deckS.value)),{cache:'no-store'})
    .then(function(r){return r.json();})
    .then(function(b){
      if(!b||!b.track){err('Nothing on this deck. Add tracks on the site.');stopAll();return;}
      err('');
      cur=b.track;
      au.src=b.track.url;
      au.play().then(function(){
        T.textContent=b.track.name;
        A.textContent=b.track.artist||(b.track.byName?'added by '+b.track.byName:'');
        R.hidden=!b.requested;
        panel.classList.add('on');
        fetch(q('/api/radio/playing'),{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id:b.track.id,deck:deckS.value})});
      }).catch(function(e){err('The browser would not start audio. Click Play once.');});
    }).catch(function(){err('Could not reach the site.');});
}
function stopAll(){
  running=false;au.pause();panel.classList.remove('on');
  playB.textContent='Play';T.textContent='Nothing playing';A.textContent='';R.hidden=true;
  fetch(q('/api/radio/playing'),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stop:true})});
}
playB.addEventListener('click',function(){
  if(running){stopAll();return;}
  running=true;playB.textContent='Stop';next();
});
skipB.addEventListener('click',function(){if(running)next();});
au.addEventListener('ended',function(){if(running)next();});
au.addEventListener('error',function(){if(running){err('That file would not play, skipping.');setTimeout(next,600);}});
deckS.addEventListener('change',function(){if(running)next();});
setInterval(function(){
  if(!running)return;
  fetch(q('/api/radio/beat'),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({deck:deckS.value,paused:au.paused})}).catch(function(){});
},10000);
function paintQ(){
  fetch(q('/api/radio/state'),{cache:'no-store'}).then(function(r){return r.json();})
    .then(function(b){
      var list=(b&&b.queue)||[];
      if(!list.length){qBox.innerHTML='<p style="font-size:12.5px;color:var(--faint);margin:0">Nothing requested.</p>';return;}
      qBox.innerHTML=list.map(function(x,i){
        return '<div class="qr"><span>'+(i+1)+'</span><span class="n"></span><span class="w"></span></div>';
      }).join('');
      var rows=qBox.querySelectorAll('.qr');
      list.forEach(function(x,i){
        rows[i].querySelector('.n').textContent=x.name;
        rows[i].querySelector('.w').textContent=x.byName||'';
      });
    }).catch(function(){});
}
paintQ();setInterval(paintQ,6000);
</script></body></html>`;
}

module.exports.playerPage = playerPage;
