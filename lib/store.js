const fs = require('fs');
const path = require('path');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const cache = {};

function file(name) {
  return path.join(DIR, name.endsWith('.json') ? name : name + '.json');
}

/* The cache holds what is actually stored, never a caller's fallback. Two
   callers can ask for the same key with different fallbacks, and whichever
   ran first must not decide what the other one sees. */
function read(name, fallback) {
  const miss = fallback === undefined ? {} : fallback;
  if (!(name in cache)) {
    const f = file(name);
    let got = null;
    if (fs.existsSync(f)) {
      try { got = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { got = null; }
    }
    cache[name] = got;
  }
  const have = cache[name];
  return have === null || have === undefined ? miss : have;
}

function write(name, data) {
  cache[name] = data;
  const f = file(name);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, f);
  return data;
}

function update(name, fallback, fn) {
  const data = read(name, fallback);
  const out = fn(data);
  return write(name, out === undefined ? data : out);
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { read, write, update, id, DIR };
