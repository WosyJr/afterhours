const fs = require('fs');
const path = require('path');

/* Static files are served with an hour of cache, so a changed script only
   reaches anyone if its URL changes too. Hand-written version numbers get
   forgotten exactly once and then a fix sits on the server while every browser
   keeps the broken copy. The file's own modified time cannot be forgotten. */

const PUB = path.join(__dirname, '..', 'public');
const seen = {};

function stamp(name) {
  if (seen[name]) return seen[name];
  let v = 'x';
  try { v = Math.round(fs.statSync(path.join(PUB, name)).mtimeMs).toString(36); } catch (e) {}
  seen[name] = v;
  return v;
}

function url(name) { return '/' + name + '?v=' + stamp(name); }

module.exports = { stamp, url };
