(function () {
  var K = {
    now: 'ahJukeNow', mine: 'ahJukeMine', vol: 'ahJukeVol',
    beat: 'ahJukeBeat', seen: 'ahJukeSeen', off: 'ahJukeOff', shuf: 'ahJukeShuf', tiny: 'ahJukeTiny', eng: 'ahJukeEngaged'
  };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  function parse(link) {
    var s = String(link || '').trim();
    if (!s) return null;

    if (/(?:music\.)?youtube\.com\/(?:browse|channel)\//i.test(s) || /\bMPREb_|\bMPSP|\bMPLA/.test(s)) {
      return { bad: 'album-page' };
    }

    var m = s.match(/[?&]list=([A-Za-z0-9_-]{10,128})/);
    var list = m ? m[1] : '';
    m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    var id = m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(s) ? s : '');

    if (!id && !list && /^(?:PL|OLAK5uy_|RDCLAK5uy_|UU|LL|FL)[A-Za-z0-9_-]{8,}$/.test(s)) list = s;
    if (!id && !list) return null;

    
    var radio = /^(?:RDAMVM|RDAO|RDEM|RDTM|RDGM|RMCM)/.test(list) || /^RD[A-Za-z0-9_-]{11}$/.test(list);
    if (radio) {
      if (id) return { id: id, list: '', note: 'mix-dropped' };
      return { bad: 'mix' };
    }
    return { id: id, list: list };
  }

  function api(then) {
    var fired = false;
    var once = function (ok) { if (fired) return; fired = true; then(ok); };
    if (window.YT && window.YT.Player) return once(true);

    setTimeout(function () { once(!!(window.YT && window.YT.Player)); }, 10000);

    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      once(true);
    };
    if (document.getElementById('ytapi')) return;
    var s = document.createElement('script');
    s.id = 'ytapi';
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { once(false); };
    document.head.appendChild(s);
  }

  function varsFor(track, t) {
    var v = { autoplay: 1, playsinline: 1, rel: 0, enablejsapi: 1, origin: location.origin };
    if (track.list) { v.listType = 'playlist'; v.list = track.list; }
    if (t) v.start = Math.floor(t);
    return v;
  }

  function shuffled(n, avoid) {
    var order = [];
    for (var i = 0; i < n; i++) order.push(i);
    for (var j = order.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = order[j]; order[j] = order[k]; order[k] = tmp;
    }
    if (n > 1 && avoid != null && order[0] === avoid) {
      var sw = order[0]; order[0] = order[1]; order[1] = sw;
    }
    return order;
  }

  function pick(n, avoid) {
    if (n <= 1) return 0;
    var i = Math.floor(Math.random() * n);
    if (i === avoid) i = (i + 1) % n;
    return i;
  }

  
  function kick(player, track) {
    if (!track || !track.list || !player || !player.loadPlaylist) return;
    try { player.loadPlaylist({ list: track.list, listType: 'playlist', index: 0, startSeconds: 0 }); }
    catch (e) {}
  }

  var WHY = {
    2: 'that link is malformed',
    5: 'the player could not open it',
    100: 'it is private or no longer there',
    101: 'the owner does not allow it off YouTube',
    150: 'the owner does not allow it off YouTube'
  };
  function why(code, track) {
    var base = WHY[code] || 'YouTube would not play it';
    if (track && track.list && !track.id) {
      base += ' — a playlist has to be set to Public, not Unlisted';
    }
    return base;
  }

  
  window.JukeCore = {
    K: K, store: store, parse: parse, api: api, varsFor: varsFor, kick: kick, why: why,
    shuffled: shuffled, pick: pick, HOST: 'https://www.youtube.com'
  };
})();
