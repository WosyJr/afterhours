const dns = require('dns').promises;
const U = require('./uploads');
const Radio = require('./radio');

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 25000;
const OK_EXT = /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)(\?|#|$)/i;

const BLOCKED_HOSTS = [
  { rx: /(^|\.)youtube\.com$/i, why: 'YouTube' },
  { rx: /(^|\.)youtu\.be$/i, why: 'YouTube' },
  { rx: /(^|\.)music\.youtube\.com$/i, why: 'YouTube Music' },
  { rx: /(^|\.)spotify\.com$/i, why: 'Spotify' },
  { rx: /(^|\.)soundcloud\.com$/i, why: 'SoundCloud' },
  { rx: /(^|\.)bandcamp\.com$/i, why: 'Bandcamp' },
  { rx: /(^|\.)apple\.com$/i, why: 'Apple Music' },
  { rx: /(^|\.)deezer\.com$/i, why: 'Deezer' },
  { rx: /(^|\.)tidal\.com$/i, why: 'Tidal' },
  { rx: /(^|\.)mixcloud\.com$/i, why: 'Mixcloud' }
];

function privateIp(ip) {
  if (!ip) return true;
  if (ip.indexOf(':') > -1) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (/^f[cd]/.test(low)) return true;
    if (/^fe80/.test(low)) return true;
    if (/^::ffff:/.test(low)) return privateIp(low.replace(/^::ffff:/, ''));
    return false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(x => isNaN(x))) return true;
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] >= 224) return true;
  return false;
}

async function safeHost(host) {
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    return 'That address does not resolve.';
  }
  if (!addrs.length) return 'That address does not resolve.';
  if (addrs.some(a => privateIp(a.address))) return 'That address is not allowed.';
  return '';
}

function nameFrom(url, header) {
  if (header) {
    const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
    if (m) return decodeURIComponent(m[1]).replace(/\.[^.]+$/, '').slice(0, 80);
  }
  try {
    const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(p).replace(/\.[^.]+$/, '').slice(0, 80) || 'Untitled';
  } catch (e) { return 'Untitled'; }
}

async function grab(raw, who, opts) {
  const o = opts || {};
  const link = String(raw || '').trim();
  if (!link) return { error: 'Paste a link first.' };

  let url;
  try { url = new URL(link); } catch (e) { return { error: 'That is not a link.' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { error: 'Only http and https links work.' };
  }

  const blocked = BLOCKED_HOSTS.find(b => b.rx.test(url.hostname));
  if (blocked) {
    return { error: blocked.why + ' links will not work. Pulling audio out of ' + blocked.why +
      ' breaks their terms, and it would not be licensed for stream anyway. ' +
      'Paste a direct link to an audio file instead, like the download link from StreamBeats or NCS.' };
  }

  const bad = await safeHost(url.hostname);
  if (bad) return { error: bad };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url.href, { redirect: 'follow', signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    return { error: 'Could not fetch that link.' };
  }
  clearTimeout(timer);

  if (!res.ok) return { error: 'That link answered ' + res.status + '.' };

  try {
    const got = new URL(res.url);
    if (got.hostname !== url.hostname) {
      const b2 = await safeHost(got.hostname);
      if (b2) return { error: b2 };
    }
  } catch (e) {}

  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  const looksAudio = /^audio\//.test(ct) || ct === 'application/ogg' || OK_EXT.test(url.pathname);
  if (!looksAudio) {
    return { error: 'That link is not an audio file' + (ct ? ' (it is ' + ct.split(';')[0] + ')' : '') +
      '. It has to point straight at an mp3 or similar, not at a page about the song.' };
  }

  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > MAX_BYTES) {
    return { error: 'That file is ' + Math.round(len / 1048576) + 'MB. The limit is 20MB.' };
  }

  let buf;
  try {
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return { error: 'That download did not finish.' };
  }
  if (!buf.length) return { error: 'That file came back empty.' };
  if (buf.length > MAX_BYTES) {
    return { error: 'That file is ' + Math.round(buf.length / 1048576) + 'MB. The limit is 20MB.' };
  }

  const type = /^audio\//.test(ct) ? ct.split(';')[0] : 'audio/mpeg';
  const saved = U.saveBlob(buf, type, 'radio');
  if (saved.error) return { error: saved.error };

  const row = Radio.add({
    name: String(o.name || '').trim().slice(0, 80) ||
      nameFrom(url.href, res.headers.get('content-disposition')),
    artist: String(o.artist || '').trim().slice(0, 80),
    deck: o.deck === 'safe' ? 'safe' : 'crew',
    url: saved.url
  }, who);

  return { ok: true, track: row, bytes: buf.length };
}

module.exports = { grab, privateIp, BLOCKED_HOSTS, MAX_BYTES };
