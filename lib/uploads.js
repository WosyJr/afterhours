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
  'video/quicktime': 'mov'
};

const LIMIT = { img: 12 * 1024 * 1024, vid: 64 * 1024 * 1024 };

function kindOf(ct) { return /^video\//.test(String(ct)) ? 'vid' : 'img'; }

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
  if (!ext) return { error: 'That file type will not work here. Use PNG, JPEG, WebP, GIF, MP4 or WebM.' };
  if (!buf || !buf.length) return { error: 'Nothing arrived' };
  const kind = kindOf(contentType);
  if (buf.length > LIMIT[kind]) {
    return { error: 'Too big. Keep images under 12MB and video under 64MB.' };
  }
  clear(name);
  const file = name + '.' + ext;
  fs.writeFileSync(path.join(DIR, file), buf);
  return { url: '/uploads/' + file + '?v=' + Date.now().toString(36), kind: kind };
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
    fs.readdirSync(DIR).forEach(f => { bytes += fs.statSync(path.join(DIR, f)).size; n++; });
  } catch (e) {}
  return { files: n, bytes: bytes, mb: Math.round(bytes / 104857600) / 10 };
}

module.exports = { DIR, TYPES, LIMIT, save, clear, shape, siteImage, setSiteImage, bannerOf, setBanner, usage, kindOf, extFor, slotName, limitFor };
