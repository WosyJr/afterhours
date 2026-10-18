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


function shape(v) {
  if (!v) return null;
  if (typeof v === 'string') return { url: v, kind: 'img' };
  if (!v.url) return null;
  return { url: v.url, kind: v.kind === 'vid' ? 'vid' : 'img' };
}

const MAX_PER_SLOT = 8;
const spin = {};

function shapeAll(v) {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map(shape).filter(Boolean);
}

function siteImages(slot) {
  return shapeAll((S.read('config', {}).images || {})[slot]);
}

function siteImage(slot) {
  const all = siteImages(slot);
  if (!all.length) return null;
  if (all.length === 1) return Object.assign({}, all[0], { count: 1 });
  const was = spin[slot];
  let i = Math.floor(Math.random() * all.length);
  if (i === was) i = (i + 1) % all.length;
  spin[slot] = i;
  return Object.assign({}, all[i], { count: all.length });
}

function writeSlot(slot, list) {
  const c = S.read('config', {});
  c.images = c.images || {};
  if (!list || !list.length) delete c.images[slot];
  else c.images[slot] = list.length === 1 ? list[0] : list;
  S.write('config', c);
  delete spin[slot];
}

function setSiteImage(slot, media) {
  writeSlot(slot, media ? [media] : []);
  return media;
}

function addSiteImage(slot, media) {
  if (!media) return null;
  const list = siteImages(slot);
  if (list.some(x => x.url === media.url)) return media;
  list.push({ url: media.url, kind: media.kind === 'vid' ? 'vid' : 'img' });
  while (list.length > MAX_PER_SLOT) list.shift();
  writeSlot(slot, list);
  return media;
}

function dropSiteImage(slot, url) {
  const list = siteImages(slot).filter(x => x.url !== url);
  writeSlot(slot, list);
  return list;
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

module.exports = { DIR, PART, TYPES, LIMIT, MAX_PER_SLOT, save, saveBlob, clear, shape, shapeAll, siteImage, siteImages, setSiteImage, addSiteImage, dropSiteImage, bannerOf, setBanner, usage, kindOf, extFor, slotName, limitFor, partPath, appendPart, readPart, dropPart, sweepParts };
