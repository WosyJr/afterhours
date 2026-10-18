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
  const plain = !(o.panel === '1' || o.panel === 1 || o.panel === true);
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
.np{position:relative;display:flex;align-items:center;gap:.8em;background:rgba(9,9,15,.72);
  border:1px solid rgba(255,255,255,.14);border-radius:.9em;padding:.62em .95em .78em;
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
.txt{min-width:0;display:flex;flex-direction:column}
.t{display:block;font-weight:800;font-size:1em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a{display:block;font-weight:500;font-size:.78em;color:#C9C6DA;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a:empty{display:none}
.tag{font-size:.62em;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
  color:#86EFAC;background:rgba(74,222,128,.14);border-radius:.4em;padding:.18em .5em;flex:none}
.tm{font-size:.68em;color:#A5A2BC;font-variant-numeric:tabular-nums;flex:none}
.trk{position:absolute;left:.95em;right:.95em;bottom:.42em;height:2px;
  background:rgba(255,255,255,.14);border-radius:2px;overflow:hidden}
.fil{height:100%;width:0;background:#A78BFA;border-radius:2px;transition:width .4s linear}
@media (prefers-reduced-motion:reduce){.bars i{animation:none}.np{transition:none}}
${plain ? `.np{background:transparent;border:0;backdrop-filter:none;box-shadow:none;padding:0 0 .5em;max-width:none}
.t{text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.8)}
.a{text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.8);color:#D6D2E6}
.tm{text-shadow:0 2px 10px rgba(0,0,0,.95);color:#C3BFD6}
.trk{left:0;right:0;background:rgba(255,255,255,.22);box-shadow:0 1px 4px rgba(0,0,0,.6)}
.fil{box-shadow:0 0 8px rgba(167,139,250,.9)}
.bars i{box-shadow:0 0 6px rgba(167,139,250,.8)}
.tag{box-shadow:0 2px 8px rgba(0,0,0,.6)}` : ''}
</style></head><body>
<div class="np" id="np" hidden>
  <span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
  <span class="txt"><span class="t" id="t"></span><span class="a" id="a"></span></span>
  <span class="tm" id="tm"></span>
  <span class="trk" aria-hidden="true"><span class="fil" id="fil"></span></span>
</div>
<script>
var KEY=${JSON.stringify(key)};
var box=document.getElementById('np'),T=document.getElementById('t'),
    A=document.getElementById('a'),
    TM=document.getElementById('tm'),FIL=document.getElementById('fil');
var last='';
function clock(x){if(!isFinite(x)||x<0)x=0;var m=Math.floor(x/60),s=Math.floor(x%60);
  return m+':'+(s<10?'0':'')+s;}
function paint(s){
  var on=s&&s.on&&s.track;
  if(!on){box.hidden=true;box.classList.remove('on');last='';return;}
  var id=s.track.id+'|'+s.track.name;
  if(id!==last){
    last=id;
    T.textContent=s.track.name||'';
    A.textContent=s.track.artist||(s.track.byName?'added by '+s.track.byName:'');
    A.hidden=!A.textContent;
  }
  if(s.len&&isFinite(s.len)&&s.len>0){
    TM.textContent=clock(s.pos)+' / '+clock(s.len);
    FIL.style.width=Math.min(100,(s.pos/s.len)*100).toFixed(2)+'%';
  }else{TM.textContent='';FIL.style.width='0';}
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
  const bare = o.bare === '1' || o.bare === 1 || o.bare === true;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radio</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap">
<style>
:root{--line:rgba(255,255,255,.13);--txt:#F3F4F8;--dim:#9B9BB2;--faint:#6C6C86;
  --iris:#7C5CFF;--iris2:#A78BFA;--rose:#FB7185}
*{box-sizing:border-box;margin:0}
html,body{background:${bare ? 'transparent' : '#09090F'};min-height:100%}
body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:var(--txt);padding:14px;
  display:flex;align-items:flex-start;justify-content:${bare ? 'flex-start' : 'center'}}
.bar{width:max-content;max-width:100%;background:rgba(9,9,15,.78);border:1px solid var(--line);
  border-radius:13px;padding:12px 14px;backdrop-filter:blur(14px)}
.bar[hidden]{display:none}
.meta{max-width:min(46ch,100%)}
.top{display:flex;align-items:center;gap:10px;min-width:0}
.eq{display:flex;align-items:flex-end;gap:2px;height:22px;flex:none}
.eq i{width:3px;background:var(--iris2);border-radius:2px;height:12%;
  transform-origin:bottom;transition:height .07s linear}
.meta{min-width:0;flex:1;display:flex;flex-direction:column}
.t{display:block;font-size:14px;font-weight:800;line-height:1.3;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.a{display:block;font-size:11.5px;font-weight:500;color:var(--dim);line-height:1.3;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a:empty{display:none}
.time{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;flex:none}
.track{height:3px;background:rgba(255,255,255,.12);border-radius:2px;margin-top:10px;overflow:hidden}
.fill{height:100%;width:0;background:var(--iris2);border-radius:2px;transition:width .25s linear}
.ctl{display:flex;align-items:center;gap:7px;margin-top:11px}
button,select{font-family:inherit;font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;
  border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--txt);cursor:pointer}
button.go{background:var(--iris);border-color:var(--iris);color:#fff}
input[type=range]{flex:1;min-width:50px;accent-color:var(--iris);height:3px}
.err{font-size:11.5px;color:var(--rose);margin-top:8px}
${bare ? `.ctl,.err{display:none}
body{padding:10px}
.track{max-width:320px}
.bar{background:transparent;border:0;backdrop-filter:none;padding:0;max-width:none}
.t{text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.8);font-size:16px}
.a{text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.8);color:#D6D2E6;font-size:12.5px}
.time{text-shadow:0 2px 10px rgba(0,0,0,.95);color:#C3BFD6}
.track{background:rgba(255,255,255,.22);height:2px;box-shadow:0 1px 4px rgba(0,0,0,.6)}
.fill{box-shadow:0 0 8px rgba(167,139,250,.9)}
.eq i{box-shadow:0 0 6px rgba(167,139,250,.8)}` : ''}
</style></head><body>
<div class="bar" id="bar"${bare ? ' hidden' : ''}>
  <div class="top">
    <span class="eq" id="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <span class="meta"><span class="t" id="t">Nothing playing</span><span class="a" id="a"></span></span>
    <span class="time" id="tm"></span>
  </div>
  <div class="track"><div class="fill" id="f"></div></div>
  <div class="ctl">
    <button class="go" id="play">Play</button>
    <button id="skip">Skip</button>
    <input type="range" id="vol" min="0" max="100" value="70" aria-label="Volume">
    <select id="deck"><option value="safe">Safe</option><option value="crew">Crew</option></select>
  </div>
  <p class="err" id="err" hidden></p>
</div>
<audio id="au"></audio>
<script>
var KEY=${JSON.stringify(key)};
var au=document.getElementById('au'),bar=document.getElementById('bar');
var T=document.getElementById('t'),A=document.getElementById('a'),TM=document.getElementById('tm');
var F=document.getElementById('f'),E=document.getElementById('err');
var playB=document.getElementById('play'),skipB=document.getElementById('skip');
var deckS=document.getElementById('deck'),vol=document.getElementById('vol');
var running=false;
deckS.value=${JSON.stringify(deck)};
au.volume=0.7;
au.crossOrigin='anonymous';

var bars=[].slice.call(document.querySelectorAll('#eq i'));
var ac=null,an=null,src=null,freq=null,raf=null;
function startViz(){
  if(an)return;
  try{
    var AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    ac=new AC();
    src=ac.createMediaElementSource(au);
    an=ac.createAnalyser();
    an.fftSize=64;
    an.smoothingTimeConstant=0.75;
    src.connect(an);
    an.connect(ac.destination);
    freq=new Uint8Array(an.frequencyBinCount);
    draw();
  }catch(e){}
}
function draw(){
  raf=requestAnimationFrame(draw);
  if(!an||!freq)return;
  an.getByteFrequencyData(freq);
  for(var i=0;i<bars.length;i++){
    var lo=Math.floor(i*freq.length/bars.length/1.6);
    var hi=Math.floor((i+1)*freq.length/bars.length/1.6);
    var sum=0,n=0;
    for(var j=lo;j<=hi&&j<freq.length;j++){sum+=freq[j];n++;}
    var v=n?sum/n:0;
    var pct=Math.max(10,Math.min(100,(v/255)*140));
    bars[i].style.height=pct.toFixed(0)+'%';
  }
}
function idleViz(){
  for(var i=0;i<bars.length;i++)bars[i].style.height='12%';
}
vol.addEventListener('input',function(){au.volume=vol.value/100;});
function err(m){E.hidden=!m;E.textContent=m||'';}
function q(p){return p+(p.indexOf('?')>-1?'&':'?')+'k='+encodeURIComponent(KEY);}
function clock(x){
  if(!isFinite(x)||x<0)x=0;
  var m=Math.floor(x/60),s=Math.floor(x%60);
  return m+':'+(s<10?'0':'')+s;
}
function tick(){
  if(!au.duration||!isFinite(au.duration)){TM.textContent='';F.style.width='0';return;}
  TM.textContent=clock(au.currentTime)+' / '+clock(au.duration);
  F.style.width=((au.currentTime/au.duration)*100).toFixed(2)+'%';
}
au.addEventListener('timeupdate',tick);
au.addEventListener('loadedmetadata',tick);
function next(){
  fetch(q('/api/radio/next?deck='+encodeURIComponent(deckS.value)),{cache:'no-store'})
    .then(function(r){return r.json();})
    .then(function(b){
      if(!b||!b.track){err('Nothing on this deck.');stopAll();return;}
      err('');au.src=b.track.url;
      au.play().then(function(){
        setBusy();
        startViz();
        if(ac&&ac.state==='suspended')ac.resume();
        T.textContent=b.track.name;
        A.textContent=b.track.artist||(b.track.byName?'added by '+b.track.byName:'');
        bar.classList.add('on');
        fetch(q('/api/radio/playing'),{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id:b.track.id,deck:deckS.value})});
      }).catch(function(){err('Click Play once to let the browser start audio.');});
    }).catch(function(){err('Could not reach the site.');});
}
var HIDE_WHEN_IDLE=${bare ? 'true' : 'false'};
function setIdle(){
  T.textContent='Nothing playing';A.textContent='';TM.textContent='';F.style.width='0';
  idleViz();
  if(HIDE_WHEN_IDLE)bar.hidden=true;
}
function setBusy(){ bar.hidden=false; }
function stopAll(){
  running=false;au.pause();bar.classList.remove('on');playB.textContent='Play';
  setIdle();
  fetch(q('/api/radio/playing'),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stop:true})});
}
playB.addEventListener('click',function(){
  if(running){stopAll();return;}
  running=true;playB.textContent='Stop';next();
});
skipB.addEventListener('click',function(){if(running)next();});
au.addEventListener('ended',function(){if(running)next();});
au.addEventListener('error',function(){if(running){err('Skipping a bad file.');setTimeout(next,600);}});
deckS.addEventListener('change',function(){if(running)next();});
setInterval(function(){
  if(!running)return;
  fetch(q('/api/radio/beat'),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({deck:deckS.value,paused:au.paused,
      at:au.currentTime,len:au.duration})}).catch(function(){});
},5000);

function clock2(x){if(!isFinite(x)||x<0)x=0;var m=Math.floor(x/60),sx=Math.floor(x%60);
  return m+':'+(sx<10?'0':'')+sx;}
function follow(){
  if(running)return;
  fetch(q('/api/radio/state'),{cache:'no-store'}).then(function(r){return r.json();})
    .then(function(st){
      if(running)return;
      if(st&&st.live&&st.track){
        setBusy();
        bar.classList.add('on');
        T.textContent=st.track.name;
        A.textContent=st.track.artist||(st.track.byName?'added by '+st.track.byName:'');
        if(st.len>0){
          TM.textContent=clock2(st.pos)+' / '+clock2(st.len);
          F.style.width=Math.min(100,(st.pos/st.len)*100).toFixed(1)+'%';
        }
        playB.textContent='Take over';
        for(var i=0;i<bars.length;i++){
          bars[i].style.height=(14+Math.round(Math.random()*70))+'%';
        }
      }else{
        bar.classList.remove('on');
        if(T.textContent!=='Nothing playing')setIdle();
        else if(HIDE_WHEN_IDLE)bar.hidden=true;
        playB.textContent='Play';
      }
    }).catch(function(){});
}
follow();
setInterval(follow,2000);
</script></body></html>`;
}

module.exports.playerPage = playerPage;

function srPage(opts) {
  const o = opts || {};
  const key = String(o.key || '');
  const compact = o.compact === '1' || o.compact === 1 || o.compact === true;
  const plain = !(o.panel === '1' || o.panel === 1 || o.panel === true);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Song requests</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap">
<style>
:root{--line:rgba(255,255,255,.13);--txt:#F3F4F8;--dim:#9B9BB2;--faint:#6C6C86;
  --iris:#7C5CFF;--iris2:#A78BFA;--rose:#FB7185;--lime:#4ADE80}
*{box-sizing:border-box;margin:0}
html,body{background:transparent;height:100%}
body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:var(--txt);padding:${compact ? '12px' : '0'};
  display:flex;flex-direction:column;gap:10px;align-items:${compact ? 'flex-start' : 'stretch'}}
#yt{border:0;border-radius:${compact ? '8px' : '0'};background:#000;
  ${compact ? 'width:200px;height:113px;flex:none' : 'width:100%;height:100%;flex:1'}}
.bar{display:flex;align-items:center;gap:10px;background:rgba(9,9,15,.8);border:1px solid var(--line);
  border-radius:12px;padding:10px 13px;backdrop-filter:blur(14px);max-width:460px;
  ${compact ? '' : 'position:fixed;left:14px;bottom:14px;right:14px;max-width:460px'}}
.bar[hidden]{display:none}
.eq{display:flex;align-items:flex-end;gap:2.5px;height:16px;flex:none}
.eq i{width:3px;background:var(--iris2);border-radius:2px;height:45%;animation:b .9s ease-in-out infinite}
.eq i:nth-child(2){height:100%;animation-delay:.18s}.eq i:nth-child(3){height:65%;animation-delay:.36s}
@keyframes b{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
.meta{min-width:0;flex:1}
.t{font-size:13.5px;font-weight:800;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.a{font-size:11px;color:var(--dim);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.who{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--lime);
  background:rgba(74,222,128,.14);border-radius:6px;padding:2px 7px;flex:none;max-width:120px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${plain ? `.bar{background:transparent;border:0;backdrop-filter:none;padding:0}
.t{text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.8)}
.a{text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.8);color:#D6D2E6}
.idle{background:transparent;border:0;text-shadow:0 2px 10px rgba(0,0,0,.9)}
.eq i{box-shadow:0 0 6px rgba(167,139,250,.8)}
.who{box-shadow:0 2px 8px rgba(0,0,0,.6)}` : ''}
.start{position:fixed;inset:0;display:grid;place-items:center;background:rgba(9,9,15,.9);z-index:9}
.start button{font-family:inherit;font-size:15px;font-weight:800;padding:14px 28px;border-radius:12px;
  border:0;background:var(--iris);color:#fff;cursor:pointer}
.idle{font-size:12.5px;color:var(--faint);padding:10px 13px;background:rgba(9,9,15,.7);
  border:1px solid var(--line);border-radius:12px;max-width:460px}
</style></head><body>
<div class="start" id="start" style="display:none">
  <button id="go">Click once to start audio</button></div>
<iframe id="yt" allow="autoplay; encrypted-media" allowfullscreen
  src="about:blank" title="Song requests"></iframe>
<div class="bar" id="bar" hidden>
  <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
  <span class="meta"><span class="t" id="t"></span><span class="a" id="a"></span></span>
  <span class="who" id="w" hidden></span>
</div>
<p class="idle" id="idle" hidden>Queue is empty. Requests play as they come in.</p>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
var KEY=${JSON.stringify(key)};
var player=null,ready=false,started=false,cur=null,polling=false,playing=false,autoTried=false;
var bar=document.getElementById('bar'),T=document.getElementById('t'),A=document.getElementById('a'),
    Wd=document.getElementById('w'),idle=document.getElementById('idle'),startBox=document.getElementById('start');
function q(p){return p+(p.indexOf('?')>-1?'&':'?')+'k='+encodeURIComponent(KEY);}
function onYouTubeIframeAPIReady(){
  player=new YT.Player('yt',{
    events:{
      onReady:function(){ready=true;tryAuto();},
      onStateChange:function(e){
        if(e.data===YT.PlayerState.PLAYING){
          playing=true;hideStart();
          if(mode==='playlist'){
            try{
              var d=player.getVideoData&&player.getVideoData();
              if(d&&d.title){T.textContent=d.title;A.textContent=d.author||listName||'';}
            }catch(err){}
          }
        }
        if(e.data===YT.PlayerState.ENDED){
          if(mode==='playlist'){setTimeout(playList,500);return;}
          advance();
        }
      },
      onError:function(){setTimeout(advance,800);}
    },
    playerVars:{autoplay:1,mute:0,controls:${compact ? 0 : 1},rel:0,modestbranding:1,playsinline:1}
  });
}
window.onYouTubeIframeAPIReady=onYouTubeIframeAPIReady;
function show(row){
  cur=row;
  if(!row){bar.hidden=true;idle.hidden=false;return;}
  idle.hidden=true;bar.hidden=false;
  T.textContent=row.title||row.id;
  A.textContent=row.author||'';
  if(row.byName){Wd.hidden=false;Wd.textContent=row.byName;}else{Wd.hidden=true;}
}
function load(row){
  show(row);
  if(!row||!ready||!player)return;
  try{player.loadVideoById(row.id);}catch(e){}
}
var mode='queue',listId=null,listName='';
function playList(){
  if(!listId||!ready||!player)return;
  mode='playlist';
  cur=null;
  idle.hidden=true;bar.hidden=false;
  T.textContent=listName||'Playlist';
  A.textContent='playing through';
  Wd.hidden=true;
  try{player.loadPlaylist({list:listId,listType:'playlist',index:0,suggestedQuality:'small'});}catch(e){}
}
function advance(){
  fetch(q('/api/sr/advance'),{method:'POST'}).then(function(r){return r.json();})
    .then(function(j){
      if(j&&j.track){mode='queue';load(j.track);return;}
      cur=null;
      if(listId){playList();return;}
      show(null);setTimeout(poll,5000);
    }).catch(function(){setTimeout(poll,5000);});
}
function poll(){
  if(polling)return;polling=true;
  fetch(q('/api/sr/state'),{cache:'no-store'}).then(function(r){return r.json();})
    .then(function(j){
      polling=false;
      if(j&&j.playlist){listId=j.playlist.id;listName=j.playlist.name||'';}
      else{listId=null;listName='';}
      if(!started)return;
      var waiting=j&&j.queue&&j.queue.length;
      if(waiting){advance();return;}
      if(!cur&&mode!=='playlist'&&listId){playList();return;}
      if(!cur)setTimeout(poll,5000);
    }).catch(function(){polling=false;setTimeout(poll,6000);});
}
function hideStart(){startBox.style.display='none';}
function showStart(){startBox.style.display='grid';}
function begin(){
  if(started)return;
  started=true;
  poll();
  advance();
  setInterval(function(){
    fetch(q('/api/sr/beat'),{method:'POST'}).catch(function(){});
    poll();
  },8000);
}
function tryAuto(){
  if(autoTried)return;
  autoTried=true;
  begin();
  setTimeout(function(){
    if(playing){hideStart();return;}
    try{ if(player&&player.getPlayerState&&player.getPlayerState()===YT.PlayerState.PLAYING){hideStart();return;} }catch(e){}
    if(cur)showStart(); else hideStart();
  },4500);
}
document.getElementById('go').addEventListener('click',function(){
  hideStart();
  started=false;
  begin();
  try{ if(player&&player.playVideo)player.playVideo(); }catch(e){}
});
hideStart();
</script></body></html>`;
}

module.exports.srPage = srPage;
