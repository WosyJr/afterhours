const S = require('./store');

function clean(s, n) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n || 80);
}

/* youtube.com and music.youtube.com use the same video ids and the same
   playlist ids, so one parser covers both. Album playlists (OLAK5uy_) and
   curated ones (RDCLAK5uy_) come from YouTube Music and embed fine. Two shapes
   never can: an album browse page, which is not a list at all, and a radio or
   mix, which is generated per viewer. Those are named so the person knows what
   to paste instead. */
function parse(link) {
  const s = String(link || '').trim();
  if (!s) return null;

  if (/(?:music\.)?youtube\.com\/(?:browse|channel)\//i.test(s) || /\bMPREb_|\bMPSP|\bMPLA/.test(s)) {
    return { bad: 'album-page' };
  }

  let m = s.match(/[?&]list=([A-Za-z0-9_-]{10,128})/);
  let list = m ? m[1] : '';
  m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  const id = m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(s) ? s : '');

  if (!id && !list && /^(?:PL|OLAK5uy_|RDCLAK5uy_|UU|LL|FL)[A-Za-z0-9_-]{8,}$/.test(s)) list = s;
  if (!id && !list) return null;

  const radio = /^(?:RDAMVM|RDAO|RDEM|RDTM|RDGM|RMCM)/.test(list) || /^RD[A-Za-z0-9_-]{11}$/.test(list);
  if (radio) {
    if (id) return { id, list: '' };
    return { bad: 'mix' };
  }
  return { id, list };
}

const WHY = {
  'album-page': 'that is an album page, not a playable list — open it on YouTube Music, press Share, and paste that link instead',
  'mix': 'a radio or mix is generated for one listener and will not play here — use a real playlist or a single track'
};

function house() {
  const b = S.read('music', {});
  return { list: b.list || [], by: b.by || '', at: b.at || '' };
}

function setHouse(text, by) {
  const out = [];
  String(text || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 60).forEach(line => {
    const parts = line.split('|');
    const link = parts.length > 1 ? parts.slice(1).join('|') : parts[0];
    const yt = parse(link);
    if (!yt) throw new Error('Not a YouTube or YouTube Music link: ' + line.slice(0, 80));
    if (yt.bad) throw new Error(WHY[yt.bad] + ' — ' + line.slice(0, 80));
    out.push({
      title: clean(parts.length > 1 ? parts[0] : '', 80) || 'Track ' + (out.length + 1),
      id: yt.id,
      list: yt.list
    });
  });
  S.write('music', { list: out, by: (by && by.name) || '', at: new Date().toISOString() });
  return out;
}

function houseText() {
  return house().list.map(x =>
    x.title + ' | ' + (x.id ? 'https://youtu.be/' + x.id : 'https://www.youtube.com/playlist?list=' + x.list) +
    (x.id && x.list ? '?list=' + x.list : '')).join('\n');
}

const esc = s => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* The player lives in its own small window so the music survives moving
   between tabs on the site. */
function windowHtml(cfg) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Jukebox · ${esc((cfg && cfg.siteName) || 'Afterhours')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/style.css?v=9">
<link rel="icon" type="image/svg+xml" href="/icon.svg?v=9">
<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png?v=9">
<link rel="apple-touch-icon" href="/icon-180.png?v=9">
<meta name="theme-color" content="#09090F">
</head><body class="jukewin">
<header class="jwhead"><b>Jukebox</b><span class="note">Leave this window open and the music keeps going while you move around the site. Drag the edges to size it.</span></header>
<div class="jwvideo"><div id="jukeplayer"></div>
  <button type="button" class="btn jwstart" data-start hidden>Start the music</button>
  <p class="jwempty" data-empty>Pick something below.</p></div>
<div class="jwctl">
  <button type="button" class="jukebtn" data-prev aria-label="Previous">&#9198;</button>
  <button type="button" class="jukebtn big" data-toggle aria-label="Play or pause">&#9199;</button>
  <button type="button" class="jukebtn" data-next aria-label="Next">&#9197;</button>
  <span class="jwtitle" data-title>Nothing playing</span>
  <label class="jwvol">Volume<input type="range" min="0" max="100" data-vol></label>
</div>
<div class="juketabs" role="tablist">
  <button type="button" data-tab="house">The house list</button>
  <button type="button" data-tab="mine">Yours</button>
</div>
<ul class="jukelist" data-list></ul>
<form class="jukeadd" data-add hidden>
  <input type="text" name="title" maxlength="60" placeholder="Name it (optional)" aria-label="Track name">
  <input type="text" name="link" placeholder="Paste a YouTube or YouTube Music link" aria-label="YouTube link" required>
  <button class="btn sm" type="submit">Add</button>
</form>
<p class="note" data-note></p>
<script src="/jukecore.js?v=8"></script>
<script src="/musicwin.js?v=8"></script>
</body></html>`;
}

const tag = cfg => '<div id="juke"></div>' +
  '<script>window.JUKE=' + JSON.stringify({
    auto: !!(cfg && cfg.musicAutoplay),
    vol: Math.max(0, Math.min(100, Number(cfg && cfg.musicVolume) || 12))
  }) + ';</script>' +
  '<script src="/jukecore.js?v=8"></script><script src="/music.js?v=8" defer></script>';

module.exports = { parse, house, setHouse, houseText, windowHtml, tag };
