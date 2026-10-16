const fs = require('fs');
const path = require('path');
const S = require('./store');

const DIR = path.join(S.DIR, 'uploads');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a'
};

const LIMIT = { img: 12 * 1024 * 1024, vid: 64 * 1024 * 1024, aud: 48 * 1024 * 1024 };

function kindOf(ct) {
  const c = String(ct);
  if (/^audio\//.test(c)) return 'aud';
  return /^video\//.test(c) ? 'vid' : 'img';
}

function extFor(ct) {
  return TYPES[String(ct || '').toLowerCase().split(';')[0].trim()] || null;
}

function slotName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 52);
}

function limitFor(ct) { return LIMIT[kindOf(ct)]; }

/* One file per slot. A new upload for a slot clears whatever was there, so the
   data directory does not grow every time someone changes the hero. */
function clear(slot) {
  try {
    fs.readdirSync(DIR).forEach(f => {
      if (f.slice(0, f.lastIndexOf('.')) === slot) fs.unlinkSync(path.join(DIR, f));
    });
  } catch (e) {}
}

function save(slot, buf, contentType) {
  const name = slotName(slot);
  if (!name) return { error: 'Bad slot' };
  const ext = extFor(contentType);
  if (!ext) return { error: 'That file type will not work here. Images, MP4 or WebM video, or MP3, OGG, WAV, FLAC or M4A audio.' };
  if (!buf || !buf.length) return { error: 'Nothing arrived' };
  const kind = kindOf(contentType);
  if (buf.length > LIMIT[kind]) {
    return { error: 'Too big. Images under 12MB, audio under 48MB, video under 64MB.' };
  }
  clear(name);
  const file = name + '.' + ext;
  fs.writeFileSync(path.join(DIR, file), buf);
  return { url: '/uploads/' + file + '?v=' + Date.now().toString(36), kind: kind };
}

/* Radio tracks are not slots — each one keeps its own file until it is
   deliberately removed, so they get a unique name rather than overwriting. */
function saveBlob(buf, contentType, tag) {
  const ext = extFor(contentType);
  if (!ext) return { error: 'That file type will not work here.' };
  if (!buf || !buf.length) return { error: 'Nothing arrived' };
  const kind = kindOf(contentType);
  if (buf.length > LIMIT[kind]) {
    return { error: 'Too big. Images under 12MB, audio under 48MB, video under 64MB.' };
  }
  const file = (tag || 'blob') + '-' + S.id() + '.' + ext;
  fs.writeFileSync(path.join(DIR, file), buf);
  return { url: '/uploads/' + file, kind: kind, file: file };
}

/* Older installs stored a data: URL string. Both shapes read the same way. */
function shape(v) {
  if (!v) return null;
  if (typeof v === 'string') return { url: v, kind: 'img' };
  if (!v.url) return null;
  return { url: v.url, kind: v.kind === 'vid' ? 'vid' : 'img' };
}

function siteImage(slot) {
  return shape((S.read('config', {}).images || {})[slot]);
}

function setSiteImage(slot, media) {
  const c = S.read('config', {});
  c.images = c.images || {};
  if (media) c.images[slot] = media; else delete c.images[slot];
  S.write('config', c);
  return media;
}

function bannerOf(uid) {
  return shape((S.read('profiles', {})[uid] || {}).banner);
}

function setBanner(uid, media) {
  const all = S.read('profiles', {});
  all[uid] = all[uid] || {};
  if (media) all[uid].banner = media; else delete all[uid].banner;
  S.write('profiles', all);
  return media;
}

function usage() {
  let bytes = 0, n = 0;
  try {
    fs.readdirSync(DIR, { withFileTypes: true }).forEach(e => {
      if (!e.isFile()) return;
      bytes += fs.statSync(path.join(DIR, e.name)).size;
      n++;
    });
  } catch (e) {}
  return { files: n, bytes: bytes, mb: Math.round(bytes / 104857600) / 10 };
}

/* Part files for chunked uploads. On the same volume as the finished ones but
   NOT inside the folder that gets served, or half an upload would be a public
   URL. Swept, so a dropped upload cannot pile up forever. */
const PART = path.join(S.DIR, 'parts');
if (!fs.existsSync(PART)) fs.mkdirSync(PART, { recursive: true });

function partPath(id) {
  const safe = String(id || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  return safe ? path.join(PART, safe + '.part') : null;
}

function appendPart(id, buf, first) {
  const f = partPath(id);
  if (!f) return { error: 'Bad upload id' };
  try {
    if (first) fs.writeFileSync(f, buf);
    else fs.appendFileSync(f, buf);
    return { size: fs.statSync(f).size };
  } catch (e) {
    return { error: 'Could not write the upload: ' + e.message };
  }
}

function readPart(id) {
  const f = partPath(id);
  try { return fs.readFileSync(f); } catch (e) { return null; }
}

function dropPart(id) {
  const f = partPath(id);
  try { if (f) fs.unlinkSync(f); } catch (e) {}
}

function sweepParts(maxAgeMs) {
  const cut = Date.now() - (maxAgeMs || 3600000);
  try {
    fs.readdirSync(PART).forEach(n => {
      const f = path.join(PART, n);
      try { if (fs.statSync(f).mtimeMs < cut) fs.unlinkSync(f); } catch (e) {}
    });
  } catch (e) {}
}

module.exports = { DIR, PART, TYPES, LIMIT, save, saveBlob, clear, shape, siteImage, setSiteImage, bannerOf, setBanner, usage, kindOf, extFor, slotName, limitFor, partPath, appendPart, readPart, dropPart, sweepParts };
