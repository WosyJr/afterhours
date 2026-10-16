(function () {
  var host = document.getElementById('juke');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = '1';

  var C = window.JukeCore;
  var store = C.store, K = C.K;
  var CFG = window.JUKE || { auto: false, vol: 12 };

  var chan = null;
  try { chan = new BroadcastChannel('ahjuke'); } catch (e) { chan = null; }

  var state = { alive: false, title: '', playing: false, at: 0, win: false };
  var house = [];
  var player = null, now = store.get(K.now, null), armed = false, blocked = false;
  var vol = store.get(K.vol, null);
  if (vol === null) vol = Math.max(0, Math.min(100, Number(CFG.vol) || 12));

  host.className = 'juke';
  document.body.classList.add('hasjuke');
  host.innerHTML =
    '<div class="jukehint" data-hint hidden role="status">' +
      '<b>Music for the room</b>' +
      '<span>The house list plays right here. Pop it out into its own window and it keeps going without a gap when you move between tabs.</span>' +
      '<div class="row"><button type="button" class="btn sm" data-open>Pop it out</button>' +
      '<button type="button" class="btn sm ghost" data-hintok>Keep it here</button></div></div>' +
    '<div class="jukemini"><div class="jukebar">' +
      '<button type="button" class="jukebtn" data-toggle aria-label="Play or pause">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 3 9 5.2v9.4a3.6 3.6 0 1 0 2 3.2V9.1l7-1.4v5.2a3.6 3.6 0 1 0 2 3.2Z"/></svg></button>' +
      '<button type="button" class="juketitle" data-title>Jukebox</button>' +
      '<button type="button" class="jukebtn" data-next aria-label="Next" hidden>&#9197;</button>' +
      '<button type="button" class="jukebtn" data-open aria-label="Open the Jukebox in its own window" title="Open in its own window">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>' +
    '</div><p class="note jukenote" data-note hidden></p></div>';

  var q = function (s) { return host.querySelector(s); };
  var winAlive = function () { return state.alive && state.win && Date.now() - state.at < 3500; };
  var anyAlive = function () { return state.alive && Date.now() - state.at < 3500; };

  function playing() {
    try { var s = player && player.getPlayerState ? player.getPlayerState() : -1; return s === 1 || s === 3; }
    catch (e) { return false; }
  }
  function track() { return now && house[now.idx] ? house[now.idx] : null; }
  function titleOf() { var t = track(); return t ? (t.title || 'A track') : ''; }

  function paint() {
    var on = anyAlive();
    q('[data-title]').textContent = on && state.title ? state.title : 'Jukebox';
    q('[data-next]').hidden = !on;
    /* The pop-out stays on offer whether or not anything is playing; it only
       goes away once that window is the thing playing. Scoped to the bar,
       because the first-run hint carries a pop-out button of its own. */
    q('.jukebar [data-open]').hidden = state.win;
    host.classList.toggle('playing', on && state.playing);
    host.classList.toggle('open', on);
    host.classList.toggle('blocked', blocked);
  }

  function hear(m) {
    if (!m || m.type !== 'state') return;
    if (m.closed) {
      if (m.win) { state.alive = false; paint(); resume(); }
      return;
    }
    /* The pop-out window always wins; the inline player stands down for it. */
    if (m.win && player) { stopInline(); }
    state = { alive: true, title: m.title || '', playing: !!m.playing, at: Date.now(), win: !!m.win };
    paint();
  }

  function tell() {
    var msg = { type: 'state', title: titleOf(), playing: playing(), at: Date.now(), win: false };
    if (chan) chan.postMessage(msg);
    store.set(K.beat, msg);
    state = { alive: true, title: msg.title, playing: msg.playing, at: Date.now(), win: false };
    paint();
  }

  function save() {
    if (!now) return;
    try { if (player && player.getCurrentTime) now.t = Math.floor(player.getCurrentTime() || 0); } catch (e) {}
    now.playing = playing();
    now.src = 'house';
    store.set(K.now, now);
  }

  function stopInline() {
    if (!player) return;
    try { player.destroy(); } catch (e) {}
    player = null;
    var box = document.getElementById('jukeinline');
    if (box) box.remove();
  }

  function mount() {
    var box = document.getElementById('jukeinline');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'jukeinline';
    box.innerHTML = '<div id="jukeinlineplayer"></div>';
    document.body.appendChild(box);
    return box;
  }

  function start(idx, t, quiet) {
    if (!house.length || winAlive()) return;
    idx = ((idx % house.length) + house.length) % house.length;
    var tr = house[idx];
    now = { src: 'house', idx: idx, t: t || 0, playing: true };
    store.set(K.now, now);
    mount();
    C.api(function (ok) {
      if (!ok) { note('YouTube would not load, so the music is off.'); return; }
      stopInline();
      mount();
      player = new window.YT.Player('jukeinlineplayer', {
        host: C.HOST, width: '300', height: '170',
        videoId: tr.id || undefined,
        playerVars: C.varsFor(tr, t),
        events: {
          onReady: function (e) {
            try { e.target.setVolume(vol); e.target.playVideo(); } catch (x) {}
            if (tr.list) setTimeout(function () { if (!playing()) C.kick(player, tr); }, 900);
            setTimeout(function () {
              if (playing()) { blocked = false; paint(); return; }
              /* Every browser refuses sound until this page has been
                 interacted with, so we wait for the first click instead. */
              blocked = true;
              paint();
              if (quiet) arm(); else note('Press play to start the music.');
            }, 1400);
          },
          onStateChange: function (e) {
            if (e.data === 1) { blocked = false; q('[data-note]').hidden = true; }
            if (e.data === 0 && !tr.list) return start(now.idx + 1, 0, true);
            save(); tell();
          },
          onError: function (e) {
            /* A track that refuses to embed inside a playlist can often still
               play on its own, so try that before giving up on it. */
            if (tr.list && tr.id) { house[idx] = { id: tr.id, list: '', title: tr.title }; return start(idx, 0, true); }
            note((tr.title || 'That one') + ' — ' + C.why(e && e.data) + '.');
            if (house.length > 1) setTimeout(function () { start(now.idx + 1, 0, true); }, 2000);
          }
        }
      });
    });
  }

  function note(txt) {
    var n = q('[data-note]');
    n.hidden = false;
    n.textContent = txt;
  }

  function arm() {
    if (armed) return;
    armed = true;
    var fire = function () {
      document.removeEventListener('pointerdown', fire, true);
      document.removeEventListener('keydown', fire, true);
      armed = false;
      try { if (player) { player.setVolume(vol); player.playVideo(); } } catch (e) {}
    };
    document.addEventListener('pointerdown', fire, true);
    document.addEventListener('keydown', fire, true);
  }

  function toggle() {
    if (winAlive()) { if (chan) chan.postMessage({ type: 'cmd', cmd: 'toggle' }); return; }
    if (!player) { start(now ? now.idx : 0, now ? now.t : 0, false); return; }
    try { if (playing()) player.pauseVideo(); else player.playVideo(); } catch (e) {}
    setTimeout(function () { save(); tell(); }, 200);
  }

  function openWin() {
    store.set(K.seen, true);
    var w = null;
    try { w = window.open('', 'ahjuke', 'popup=yes,width=460,height=700'); } catch (e) { w = null; }
    if (!w) { note('Your browser blocked the music window. Allow pop-ups for this site, then try again.'); return; }
    save();
    stopInline();
    var blank = true;
    try { blank = !w.location.href || w.location.href === 'about:blank'; } catch (e) { blank = false; }
    if (blank) w.location.href = '/music';
    try { w.focus(); } catch (e) {}
    q('[data-note]').hidden = true;
  }

  host.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-hintok]')) { store.set(K.seen, true); q('[data-hint]').hidden = true; return; }
    if (t.closest('[data-open]')) { q('[data-hint]').hidden = true; openWin(); return; }
    if (t.closest('[data-toggle]') || t.closest('[data-title]')) { q('[data-hint]').hidden = true; toggle(); return; }
    if (t.closest('[data-next]')) {
      if (winAlive()) { if (chan) chan.postMessage({ type: 'cmd', cmd: 'next' }); return; }
      if (now) start(now.idx + 1, 0, true);
    }
  });

  if (chan) {
    chan.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === 'ping') { if (player) tell(); return; }
      hear(m);
    };
    chan.postMessage({ type: 'ping' });
  }
  window.addEventListener('storage', function (e) {
    if (e.key !== K.beat) return;
    var m = store.get(K.beat, null);
    if (m && Date.now() - (m.at || 0) < 3500) hear(m);
  });
  window.addEventListener('pagehide', function () { save(); });
  setInterval(function () { if (player) { save(); tell(); } else paint(); }, 1200);

  /* Carry on from wherever the last page left off, rather than restarting. */
  function resume() {
    if (winAlive() || player || !house.length) return;
    var auto = CFG.auto && !store.get(K.off, false);
    if (now && now.playing) return start(now.idx, now.t, true);
    if (now && !now.playing) return;
    if (auto) start(0, 0, true);
  }

  var beat = store.get(K.beat, null);
  if (beat && !beat.closed && Date.now() - (beat.at || 0) < 3500) hear(beat);

  fetch('/music.json', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      house = j.list || [];
      if (j.vol !== undefined && store.get(K.vol, null) === null) vol = j.vol;
      if (j.auto !== undefined) CFG.auto = j.auto;
    })
    .catch(function () {})
    .then(function () {
      paint();
      setTimeout(resume, 120);
      /* Shown once, whether or not the music is already going — it is the
         only moment anyone finds out the pop-out exists. */
      if (house.length && !store.get(K.seen, false)) {
        setTimeout(function () { if (!state.win) q('[data-hint]').hidden = false; }, 3000);
      }
    });
})();
