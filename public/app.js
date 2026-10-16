(function () {
  var ME = window.ME || { perms: {} };

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hold(el) { if (el) el.disabled = true; }

  document.addEventListener('click', function (e) {
    var j = e.target.closest('[data-join]');
    if (j) { hold(j); post('/api/session/' + j.dataset.join + '/join').then(reload); return; }

    var s = e.target.closest('[data-slot]');
    if (s) { hold(s); post('/api/slot/' + s.dataset.slot).then(reload); return; }

    var o = e.target.closest('[data-own]');
    if (o) { hold(o); post('/api/own/' + o.dataset.own).then(reload); return; }

    var r = e.target.closest('[data-rsvp]');
    if (r) { hold(r); post('/api/rsvp').then(reload); return; }

    var p = e.target.closest('[data-pin]');
    if (p) {
      hold(p);
      var bits = p.dataset.pin.split('|');
      post('/api/pin', { channel: bits[0], message: bits[1], on: bits[2] === 'on' }).then(function (res) {
        if (res && res.ok) reload();
        else { p.disabled = false; flash(p, (res && res.error) || 'Discord turned that down'); }
      });
      return;
    }

    if (e.target.id === 'editMe') {
      var f = document.getElementById('meForm');
      var l = document.getElementById('meLinks');
      var open = f ? f.hidden : (l && l.hidden);
      if (f) f.hidden = !open;
      if (l) l.hidden = !open;
      if (open && f) f.querySelector('textarea').focus();
      e.target.textContent = open ? 'Done' : 'Edit profile';
      return;
    }

    if (e.target.id === 'newSess') {
      var game = prompt('What are you playing?');
      if (!game) return;
      var w = prompt('When? e.g. Tonight 8pm', 'Tonight') || 'Tonight';
      var cap = Number(prompt('How many spots?', '4')) || 4;
      post('/api/session', { game: game, when: w, cap: cap }).then(reload);
    }
  });

  function reload() { location.reload(); }

  function flash(el, msg) {
    var n = document.createElement('span');
    n.className = 'note';
    n.style.marginLeft = '8px';
    n.textContent = msg;
    el.parentNode.appendChild(n);
    setTimeout(function () { n.remove(); }, 4000);
  }

  /* ---------- picture and video slots ---------- */
  function mb(n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + 'MB'; }

  var CHUNK = 2 * 1024 * 1024;

  function post(url, body, type, ms) {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('Content-Type', type || 'application/octet-stream');
      x.timeout = ms || 60000;
      x.onload = function () {
        var j = {};
        try { j = JSON.parse(x.responseText); } catch (e) {}
        resolve({ status: x.status, body: j });
      };
      x.onerror = function () { resolve({ status: 0, body: {}, net: true }); };
      x.ontimeout = function () { resolve({ status: 0, body: {}, timeout: true }); };
      x.send(body);
    });
  }

  document.addEventListener('change', function (e) {
    var input = e.target.closest('[data-ph]');
    if (!input) return;
    var f = input.files && input.files[0];
    if (!f) return;

    var isVid = /^video\//.test(f.type);
    var cap = isVid ? 64 : 12;
    if (f.size > cap * 1024 * 1024) {
      alert('That file is ' + mb(f.size) + '. The limit is ' + cap + 'MB for ' + (isVid ? 'video' : 'a picture') + '.');
      input.value = '';
      return;
    }

    var label = input.closest('.rep');
    var was = label.textContent;
    var slot = input.dataset.ph;
    label.classList.add('busy');
    label.textContent = 'Checking…';

    var holder = input.closest('.photo');
    var url = URL.createObjectURL(f);
    holder.querySelectorAll('video.vid,img.real').forEach(function (n) { n.remove(); });
    if (isVid) {
      var v = document.createElement('video');
      v.className = 'vid';
      v.src = url; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
      holder.appendChild(v);
      holder.classList.add('hasvid');
      holder.classList.remove('hasimg');
    } else {
      var img = document.createElement('img');
      img.className = 'real';
      img.src = url;
      holder.appendChild(img);
      holder.classList.add('hasimg');
      holder.classList.remove('hasvid');
    }

    function done(msg) {
      label.classList.remove('busy');
      label.textContent = was;
      input.value = '';
      if (msg) alert(msg);
    }

    /* A proxy that will not pass one 60MB body will usually pass thirty small
       ones, and when it still will not, the failure has a chunk number on it
       instead of being a spinner that never stops. */
    function run() {
      post('/api/upload/ping', new Blob([new Uint8Array(8)]), 'application/octet-stream', 20000)
        .then(function (r) {
          if (r.status !== 200 || !r.body.ok) {
            return done(r.timeout || r.net
              ? 'The server never answered. Something between this page and the site is blocking uploads.'
              : (r.body.error || 'The server turned the upload down (' + r.status + ').'));
          }

          var id = Math.random().toString(36).slice(2) + Date.now().toString(36);
          var n = Math.max(1, Math.ceil(f.size / CHUNK));
          var i = 0;

          function step() {
            var from = i * CHUNK;
            var piece = f.slice(from, Math.min(from + CHUNK, f.size));
            var q = '/api/upload/chunk?slot=' + encodeURIComponent(slot) +
              '&id=' + id + '&i=' + i + '&n=' + n +
              '&size=' + f.size + '&ct=' + encodeURIComponent(f.type || '');
            label.textContent = n === 1 ? 'Saving…' : Math.round((i / n) * 100) + '% of ' + mb(f.size);

            post(q, piece, 'application/octet-stream', 120000).then(function (r) {
              if (r.status === 200 && r.body.ok) {
                i++;
                if (i < n) return step();
                return done('');
              }
              if (r.timeout) return done('Piece ' + (i + 1) + ' of ' + n + ' timed out. Try again, or use a smaller file.');
              if (r.net) return done('The connection dropped on piece ' + (i + 1) + ' of ' + n + '.');
              done(r.body.error || ('The server refused piece ' + (i + 1) + ' (' + r.status + ').'));
            });
          }
          step();
        });
    }
    run();
  });

  /* ---------- live refresh ---------- */
  var presEl = document.getElementById('presence');
  var voiceEl = document.getElementById('voice');
  if (presEl || voiceEl) {
    setInterval(function () {
      if (document.hidden) return;
      fetch('/api/live').then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) return;
        if (presEl) {
          presEl.innerHTML = d.roster.length ? d.roster.map(function (m) {
            var dot = { online: '#4ADE80', idle: '#FBBF24', dnd: '#FB7185', offline: '#64647E' }[m.status] || '#64647E';
            var inner = m.avatar ? '<img src="' + esc(m.avatar) + '" alt="">' : esc((m.name || '?').slice(0, 1).toUpperCase());
            var av = '<span class="pav" style="background:' + esc(m.tint) + '">' + inner +
              '<span class="st" style="background:' + dot + '"></span></span>';
            return '<div class="prow">' + av +
              '<span style="min-width:0;flex:1"><span class="pn">' + esc(m.name) +
              ' <span class="rk" style="color:' + esc(m.colour) + '">' + esc((m.rank || '').toUpperCase()) + '</span>' +
              (m.live ? '<span class="pb ' + (m.live === 'twitch' ? 'tw' : 'yt') + '">LIVE</span>' : '') + '</span>' +
              '<span class="pd">' + esc(m.doing) + '</span></span>' +
              (m.liveUrl ? '<a class="jb" href="' + esc(m.liveUrl) + '" target="_blank" rel="noopener">Watch</a>' : '') +
              '</div>';
          }).join('') : '<p class="empty">Nobody loaded yet.</p>';
        }
        if (voiceEl) {
          voiceEl.innerHTML = d.voice.length ? d.voice.map(function (r) {
            var talk = r.people.some(function (p) { return !p.mute; });
            return '<div class="vch"><div class="vct"><span>&#9834; ' + esc(r.name) +
              (talk ? '<span class="bars"><i></i><i></i><i></i></span>' : '') +
              '</span><span class="note">' + r.people.length + '</span></div>' +
              '<div class="vcw">' + esc(r.people.map(function (p) { return p.name; }).join(' & ')) + '</div></div>';
          }).join('') : '<p class="empty">Nobody in voice.</p>';
        }
      }).catch(function () {});
    }, 12000);
  }
})();
