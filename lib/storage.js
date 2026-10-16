const fs = require('fs');
const path = require('path');
const S = require('./store');


const MARK = '.storage.json';

function mountPath() {
  return process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.VOLUME_MOUNT_PATH || '';
}

function volumeName() {
  return process.env.RAILWAY_VOLUME_NAME || process.env.VOLUME_NAME || '';
}

function under(dir, mount) {
  if (!mount) return false;
  const d = path.resolve(dir);
  const m = path.resolve(mount);
  return d === m || d.startsWith(m + path.sep);
}

let state = null;


function boot() {
  const dir = S.DIR;
  const file = path.join(dir, MARK);
  let rec = null;
  let writable = true;

  try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { rec = null; }
  const firstEver = !rec;
  rec = rec || { firstSeen: new Date().toISOString(), boots: 0 };
  rec.boots = (rec.boots || 0) + 1;
  rec.lastSeen = new Date().toISOString();
  try { fs.writeFileSync(file, JSON.stringify(rec, null, 2)); } catch (e) { writable = false; }

  const mount = mountPath();
  const name = volumeName();
  const mounted = !!mount && under(dir, mount);

  let level = 'ok';
  let message = '';
  if (!writable) {
    level = 'bad';
    message = 'Nothing can be written to ' + dir + '. Check the mount path and that the volume is attached.';
  } else if (!mount) {
    level = 'bad';
    message = 'No volume is attached, so everything here is wiped on the next deploy. ' +
      'Add a volume to this service and mount it at ' + dir + '.';
  } else if (!mounted) {
    level = 'bad';
    message = 'A volume is mounted at ' + mount + ' but the site is writing to ' + dir +
      ', which is not on it. Set DATA_DIR to ' + mount + ', or remount the volume at ' + dir + '.';
  } else if (firstEver) {
    message = 'Volume' + (name ? ' "' + name + '"' : '') + ' mounted at ' + mount + '. Nothing stored yet.';
  } else {
    message = 'Volume' + (name ? ' "' + name + '"' : '') + ' mounted at ' + mount + '.';
  }

  state = {
    dir, mount, name, mounted, writable, level, message,
    firstEver, firstSeen: rec.firstSeen, boots: rec.boots
  };
  return state;
}

function status() { return state || boot(); }

function usage() {
  let bytes = 0, files = 0;
  const walk = d => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    list.forEach(e => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) return walk(f);
      try { bytes += fs.statSync(f).size; files++; } catch (x) {}
    });
  };
  walk(S.DIR);
  return { files, bytes, mb: Math.round(bytes / 104857.6) / 10 };
}

function report() {
  const s = status();
  const lines = ['[storage] writing to ' + s.dir];
  if (s.mount) lines.push('[storage] volume' + (s.name ? ' "' + s.name + '"' : '') + ' mounted at ' + s.mount);
  lines.push('[storage] boot ' + s.boots + (s.firstEver ? ' (nothing was here)' : ', first written ' + s.firstSeen));
  if (s.level !== 'ok') {
    lines.push('[storage] ---------------------------------------------');
    lines.push('[storage] ' + s.message);
    lines.push('[storage] ---------------------------------------------');
  }
  lines.forEach(l => console.log(l));
  return s;
}

module.exports = { boot, status, report, usage, under, mountPath, volumeName };
