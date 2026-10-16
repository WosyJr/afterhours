const fs = require('fs');
const path = require('path');


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
