const fs = require('fs');
const path = require('path');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const cache = {};

function file(name) {
  return path.join(DIR, name.endsWith('.json') ? name : name + '.json');
}

function read(name, fallback) {
  if (cache[name] !== undefined) return cache[name];
  const f = file(name);
  if (!fs.existsSync(f)) {
    cache[name] = fallback === undefined ? {} : fallback;
    return cache[name];
  }
  try {
    cache[name] = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    cache[name] = fallback === undefined ? {} : fallback;
  }
  return cache[name];
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
