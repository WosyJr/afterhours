(function () {
  var C = window.JukeCore;
  var LIST = window.JUKETEST || [];
  var rows = [];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function paint(row, state, text, detail) {
    row.pill.className = 'tpill ' + state;
    row.pill.textContent = text;
    row.detail.textContent = detail || '';
    row.detail.hidden = !detail;
  }

  function verdictFor(code, track) {
    if (code === 101 || code === 150) {
      return track.list
        ? 'The rights holder blocks these tracks from playing outside YouTube. Most music on YouTube Music is licensed this way, so a playlist of chart music will not play here however it is shared.'
        : 'The rights holder blocks this track from playing outside YouTube.';
    }
    if (code === 100) return 'YouTube cannot find it. It has been deleted, or set to Private.';
    if (code === 2) return 'YouTube says the id is malformed.';
    if (code === 5) return 'The player could not open it.';
    return 'YouTube refused it without saying why.';
  }

  function run(row, andThen) {
    var track = row.track;
    var done = false;
    var holder = row.frame;
    holder.innerHTML = '';
    var mount = el('div');
    holder.appendChild(mount);
    paint(row, 'wait', 'Asking YouTube…');

    var guard = setTimeout(function () {
      if (done) return;
      var n = 0;
      try { n = ((row.player && row.player.getPlaylist && row.player.getPlaylist()) || []).length; } catch (err) {}
      if (track.list && n) {
        finish('warn', 'Loads but will not start', 'YouTube handed over ' + n + ' track' + (n === 1 ? '' : 's') + ' and then played none of them. That is what a licensed music playlist does when the rights holder blocks off-site playback.');
      } else if (!row.player) {
        finish('bad', 'YouTube never answered', 'The player script did not load or never called back within 15 seconds. An ad blocker or a privacy extension blocking youtube.com is the usual cause — try again with it off for this site.');
      } else {
        finish('warn', 'No answer', 'YouTube neither played it nor gave an error within 15 seconds. Usually that means the embed is being blocked before it loads.');
      }
    }, 15000);

    function finish(state, text, detail) {
      if (done) return;
      done = true;
      clearTimeout(guard);
      paint(row, state, text, detail);
      setTimeout(function () {
        try { row.player && row.player.destroy && row.player.destroy(); } catch (e) {}
        holder.innerHTML = '';
        andThen && andThen();
      }, 300);
    }

    C.api(function (okApi) {
      if (!okApi) return finish('bad', 'Could not reach YouTube', 'The iframe API script did not load. Something on this network or an extension is blocking youtube.com.');

      var vars = { autoplay: 1, mute: 1, playsinline: 1, rel: 0, origin: location.origin };
      if (track.list) { vars.listType = 'playlist'; vars.list = track.list; }

      row.player = new YT.Player(mount, {
        host: C.HOST,
        width: 200,
        height: 120,
        videoId: track.id || undefined,
        playerVars: vars,
        events: {
          onReady: function (e) {
            try { e.target.mute(); e.target.playVideo(); } catch (err) {}
            if (track.list) setTimeout(function () { if (!done) C.kick(e.target, track); }, 900);
          },
          onStateChange: function (e) {
            if (done) return;
            if (e.data !== 1 && e.data !== 3) return;
            var n = 0, name = '';
            try {
              var pl = e.target.getPlaylist();
              n = pl && pl.length ? pl.length : 0;
              var d = e.target.getVideoData();
              name = d && d.title ? d.title : '';
            } catch (err) {}
            if (track.list) {
              finish('good', 'Plays', n
                ? 'YouTube loaded ' + n + ' track' + (n === 1 ? '' : 's') + (name ? ', starting on “' + name + '”' : '') + '.'
                : 'It started playing' + (name ? ' on “' + name + '”' : '') + '.');
            } else {
              finish('good', 'Plays', name ? 'YouTube served “' + name + '”.' : 'It started playing.');
            }
          },
          onError: function (e) {
            var code = e && e.data;
            finish('bad', 'Refused — error ' + code, verdictFor(code, track));
          }
        }
      });

    });
  }

  function build() {
    var wrap = document.querySelector('[data-rows]');
    if (!LIST.length) return;
    LIST.forEach(function (track) {
      var row = { track: track };
      var box = el('div', 'trow');
      var head = el('div', 'thead');
      head.appendChild(el('span', 'tname', track.title || 'Untitled'));
      head.appendChild(el('span', 'note', track.list ? 'playlist' : 'single track'));
      row.pill = el('span', 'tpill wait', 'Waiting');
      head.appendChild(row.pill);
      box.appendChild(head);
      row.detail = el('p', 'tdetail', '');
      row.detail.hidden = true;
      box.appendChild(row.detail);
      row.frame = el('div', 'tframe');
      box.appendChild(row.frame);
      wrap.appendChild(box);
      rows.push(row);
    });
  }

  function runAll() {
    var btn = document.querySelector('[data-run]');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    document.body.removeAttribute('data-done');
    var i = 0;
    (function next() {
      if (i >= rows.length) {
        btn.disabled = false;
        btn.textContent = 'Check them again';
        document.body.setAttribute('data-done', '1');
        return;
      }
      run(rows[i++], next);
    })();
  }

  build();
  var btn = document.querySelector('[data-run]');
  if (btn) btn.addEventListener('click', runAll);
  if (rows.length) runAll();
})();
