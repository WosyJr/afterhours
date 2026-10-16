(function () {
  var K = {
    now: 'ahJukeNow', mine: 'ahJukeMine', vol: 'ahJukeVol',
    beat: 'ahJukeBeat', seen: 'ahJukeSeen', off: 'ahJukeOff'
  };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* youtube.com and music.youtube.com share video ids and most playlist ids,
     so one parser covers both. What music.youtube.com adds is album playlists
     (OLAK5uy_), curated ones (RDCLAK5uy_), radio (RDAMVM / RD<videoid>) and
     browse ids (MPREb_), and only the last two of those can never be embedded. */
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

    /* A radio or mix list is generated per viewer and refuses to embed. When
       the link also names a track we keep the track and drop the mix. */
    var radio = /^(?:RDAMVM|RDAO|RDEM|RDTM|RDGM|RMCM)/.test(list) || /^RD[A-Za-z0-9_-]{11}$/.test(list);
    if (radio) {
      if (id) return { id: id, list: '', note: 'mix-dropped' };
      return { bad: 'mix' };
    }
    return { id: id, list: list };
  }

  function api(then) {
    if (window.YT && window.YT.Player) return then(true);
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      then(true);
    };
    if (document.getElementById('ytapi')) return;
    var s = document.createElement('script');
    s.id = 'ytapi';
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { then(false); };
    document.head.appendChild(s);
  }

  function varsFor(track, t) {
    var v = { autoplay: 1, start: Math.floor(t || 0), playsinline: 1, rel: 0, modestbranding: 1 };
    if (track.list) { v.listType = 'playlist'; v.list = track.list; }
    return v;
  }

  window.JukeCore = { K: K, store: store, parse: parse, api: api, varsFor: varsFor, HOST: 'https://www.youtube-nocookie.com' };
})();
