(function () {
  var C = window.JukeCore;
  var store = C.store, K = C.K;
  var q = function (s) { return document.querySelector(s); };
  var esc = function (t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var house = [];
  var mine = store.get(K.mine, []);
  var now = store.get(K.now, null);
  var vol = store.get(K.vol, null);
  if (vol === null) vol = 12;
  var tab = now && now.src === 'mine' ? 'mine' : 'house';
  var player = null, chan = null;
  try { chan = new BroadcastChannel('ahjuke'); } catch (e) { chan = null; }

  function listOf(src) { return src === 'mine' ? mine : house; }
  function current() { if (!now) return null; return listOf(now.src)[now.idx] || null; }
  function playing() {
    try { var st = player && player.getPlayerState ? player.getPlayerState() : -1; return st === 1 || st === 3; }
    catch (e) { return false; }
  }
  function title() { var c = current(); return c ? (c.title || 'A track') : ''; }

  function tell() {
    var msg = { type: 'state', title: title(), playing: playing(), at: Date.now(), win: true };
    if (chan) chan.postMessage(msg);
    store.set(K.beat, msg);
  }

  function save() {
    if (now) {
      try { if (player && player.getCurrentTime) now.t = Math.floor(player.getCurrentTime() || 0); } catch (e) {}
      now.playing = playing() || (now.playing && !player);
    }
    store.set(K.now, now);
  }

  function paint() {
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
    var l = listOf(tab);
    q('[data-list]').innerHTML = l.length ? l.map(function (s, i) {
      var on = now && now.src === tab && now.idx === i;
      return '<li class="' + (on ? 'on' : '') + '">' +
        '<button type="button" class="jukesong" data-i="' + i + '">' + esc(s.title || 'Track ' + (i + 1)) + '</button>' +
        (tab === 'mine' ? '<button type="button" class="jukedel" data-del="' + i + '" aria-label="Remove">&#10005;</button>' : '') +
        '</li>';
    }).join('') : '<li class="note">' + (tab === 'house'
      ? 'Nobody has set the house list yet. Settings &rarr; Site.'
      : 'Paste a YouTube link below. Only you hear your own tracks.') + '</li>';
    q('[data-add]').hidden = tab !== 'mine';
    q('[data-note]').textContent = tab === 'mine' ? 'Your tracks stay in this browser.' : '';
    q('[data-title]').textContent = title() || 'Nothing playing';
    q('[data-empty]').hidden = !!current();
    document.title = (title() ? title() + ' · ' : '') + 'Jukebox';
  }

  function start(src, idx, t) {
    var l = listOf(src);
    if (!l.length) return;
    idx = ((idx % l.length) + l.length) % l.length;
    var c = l[idx];
    now = { src: src, idx: idx, t: t || 0, playing: true };
    tab = src;
    store.set(K.now, now);
    paint();
    C.api(function (ok) {
      if (!ok) { q('[data-title]').textContent = 'YouTube would not load.'; return; }
      if (player && player.destroy) { try { player.destroy(); } catch (e) {} }
      if (!document.getElementById('jukeplayer')) {
        q('.jwvideo').insertAdjacentHTML('afterbegin', '<div id="jukeplayer"></div>');
      }
      player = new window.YT.Player('jukeplayer', {
        host: C.HOST,
        width: '100%', height: '100%',
        videoId: c.id || undefined,
        playerVars: C.varsFor(c, t),
        events: {
          onReady: function (e) {
            try { e.target.setVolume(vol); e.target.playVideo(); } catch (x) {}
            setTimeout(function () { if (!playing()) q('[data-start]').hidden = false; }, 1800);
          },
          onStateChange: function (e) {
            if (e.data === 1) q('[data-start]').hidden = true;
            if (e.data === 0 && !c.list) start(now.src, now.idx + 1, 0);
            save(); tell(); paint();
          },
          onError: function () {
            q('[data-title]').textContent = 'That one will not play outside YouTube. Skipping…';
            setTimeout(function () { start(now.src, now.idx + 1, 0); }, 1500);
          }
        }
      });
    });
  }

  function toggle() {
    if (!player) {
      var c = current();
      if (c) start(now.src, now.idx, now.t);
      else if (house.length) start('house', 0, 0);
      else if (mine.length) start('mine', 0, 0);
      return;
    }
    try { if (playing()) player.pauseVideo(); else player.playVideo(); } catch (e) {}
    setTimeout(function () { save(); tell(); }, 200);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var tb = t.closest('[data-tab]');
    if (tb) { tab = tb.getAttribute('data-tab'); paint(); return; }
    var del = t.closest('[data-del]');
    if (del) {
      mine.splice(Number(del.getAttribute('data-del')), 1);
      store.set(K.mine, mine);
      paint();
      return;
    }
    var so = t.closest('[data-i]');
    if (so) { start(tab, Number(so.getAttribute('data-i')), 0); return; }
    if (t.closest('[data-toggle]')) return toggle();
    if (t.closest('[data-next]')) { if (now) start(now.src, now.idx + 1, 0); return; }
    if (t.closest('[data-prev]')) { if (now) start(now.src, now.idx - 1, 0); return; }
    if (t.closest('[data-start]')) {
      q('[data-start]').hidden = true;
      try { player.playVideo(); } catch (x) { if (now) start(now.src, now.idx, now.t); }
    }
  });

  var vin = q('[data-vol]');
  vin.value = vol;
  vin.addEventListener('input', function () {
    vol = Number(vin.value);
    store.set(K.vol, vol);
    try { if (player) player.setVolume(vol); } catch (x) {}
  });

  q('[data-add]').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, yt = C.parse(f.link.value);
    if (!yt) { q('[data-note]').textContent = 'That is not a YouTube or YouTube Music link.'; return; }
    if (yt.bad === 'album-page') { q('[data-note]').textContent = 'That is an album page, not a playable list. On YouTube Music open the album, press Share, and paste that link.'; return; }
    if (yt.bad === 'mix') { q('[data-note]').textContent = 'A radio or mix is made for you alone and will not play here. Use a real playlist or a single track.'; return; }
    mine.push({ title: f.title.value.trim() || 'My track ' + (mine.length + 1), id: yt.id, list: yt.list });
    mine = mine.slice(-40);
    store.set(K.mine, mine);
    f.reset();
    paint();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === K.mine) { mine = store.get(K.mine, []); paint(); }
  });

  if (chan) chan.onmessage = function (e) {
    var m = e.data || {};
    if (m.type === 'ping') return tell();
    if (m.type !== 'cmd') return;
    if (m.cmd === 'toggle') toggle();
    if (m.cmd === 'next' && now) start(now.src, now.idx + 1, 0);
    if (m.cmd === 'play' && !playing()) toggle();
  };

  setInterval(function () { save(); tell(); }, 1000);
  window.addEventListener('pagehide', function () {
    save();
    store.set(K.beat, { type: 'state', closed: true, at: Date.now(), win: true });
    if (chan) chan.postMessage({ type: 'state', closed: true, win: true });
  });

  fetch('/music.json', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (j) { house = j.list || []; if (j.vol !== undefined && store.get(K.vol, null) === null) vol = j.vol; })
    .catch(function () {})
    .then(function () {
      paint();
      if (now && current()) start(now.src, now.idx, now.t);
      else if (house.length) start('house', 0, 0);
    });
})();
