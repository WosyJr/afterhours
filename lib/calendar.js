const S = require('./store');

const KEY = 'calendar';
const MAX = 400;

function all() {
  const r = S.read(KEY, null);
  return Array.isArray(r) ? r : [];
}

function save(list) {
  S.write(KEY, list.slice(0, MAX));
  return list;
}

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function today() { return iso(new Date()); }

function validDay(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  if (iso(d) !== s) return null;
  return s;
}

function validTime(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, '0') + ':' + m[2];
}

function add(entry) {
  const day = validDay(entry.day);
  if (!day) throw new Error('That date does not look right.');
  const time = validTime(entry.time);
  if (time === null) throw new Error('Use a 24-hour time like 20:30.');
  const title = String(entry.title || '').trim().slice(0, 80);
  if (!title) throw new Error('Give it a name.');
  const row = {
    id: S.id(),
    day: day,
    time: time,
    title: title,
    note: String(entry.note || '').trim().slice(0, 200),
    game: String(entry.game || '').trim().slice(0, 60),
    host: entry.host,
    hostName: entry.hostName || '',
    cap: Math.max(0, Math.min(99, Number(entry.cap) || 0)),
    going: [entry.host].filter(Boolean),
    at: Date.now()
  };
  const list = all();
  list.push(row);
  list.sort(byWhen);
  save(list);
  return row;
}

function byWhen(a, b) {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  const at = a.time || '99:99';
  const bt = b.time || '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.at - b.at;
}

function get(id) { return all().find(x => x.id === id) || null; }

function remove(id, byId, isStaff) {
  const list = all();
  const i = list.findIndex(x => x.id === id);
  if (i === -1) return { gone: false };
  if (list[i].host !== byId && !isStaff) return { gone: false, denied: true };
  const row = list[i];
  list.splice(i, 1);
  save(list);
  return { gone: true, row: row };
}

function rsvp(id, uid, on) {
  const list = all();
  const row = list.find(x => x.id === id);
  if (!row) return null;
  row.going = row.going || [];
  const at = row.going.indexOf(uid);
  if (on && at === -1) {
    if (row.cap && row.going.length >= row.cap) return { full: true, row: row };
    row.going.push(uid);
  }
  if (!on && at > -1) row.going.splice(at, 1);
  save(list);
  return { row: row };
}

function prune() {
  const cut = today();
  const list = all().filter(x => x.day >= cut);
  if (list.length !== all().length) save(list);
  return list;
}

function upcoming(n) {
  const cut = today();
  return all().filter(x => x.day >= cut).sort(byWhen).slice(0, n || 50);
}

function forDay(day) { return all().filter(x => x.day === day).sort(byWhen); }

function monthOf(y, m) {
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const weeks = [];
  const cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      row.push({
        iso: iso(cur),
        date: cur.getDate(),
        inMonth: cur.getMonth() === m,
        isToday: iso(cur) === today()
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
    if (cur.getMonth() !== m && w >= 3) break;
  }
  return weeks;
}

function label(day, time) {
  const d = new Date(day + 'T12:00:00');
  const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const base = wd + ' ' + d.getDate() + ' ' + mo;
  if (!time) return base;
  const h = Number(time.slice(0, 2));
  const mi = time.slice(3);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return base + ' · ' + h12 + (mi === '00' ? '' : ':' + mi) + ' ' + ampm;
}

function stamp(day, time) {
  const d = new Date(day + 'T' + (time || '20:00') + ':00');
  return Math.floor(d.getTime() / 1000);
}

module.exports = {
  all, add, get, remove, rsvp, upcoming, forDay, monthOf, prune,
  today, iso, validDay, validTime, label, stamp, byWhen
};
