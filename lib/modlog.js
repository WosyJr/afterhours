const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');

const KEY = 'modlog';
const MAX = 300;

function log() { console.log.apply(console, ['[modlog]'].concat([].slice.call(arguments))); }

const KINDS = {
  warn: { word: 'Warning logged', colour: 0xF87171, icon: '⚠️' },
  unwarn: { word: 'Warning removed', colour: 0x4ADE80, icon: '↩️' },
  note: { word: 'Note added', colour: 0x64647E, icon: '✍️' },
  unnote: { word: 'Note removed', colour: 0x64647E, icon: '↩️' },
  role: { word: 'Role changed', colour: 0x7C5CFF, icon: '\u{1F3F7}️' },
  purge: { word: 'Messages cleared', colour: 0xFBBF24, icon: '\u{1F9F9}' },
  slowmode: { word: 'Slowmode changed', colour: 0xFBBF24, icon: '\u{1F40C}' },
  say: { word: 'Posted as the bot', colour: 0x64647E, icon: '\u{1F4AC}' },
  timeout: { word: 'Timed out', colour: 0xFBBF24, icon: '⏸️' },
  untimeout: { word: 'Timeout lifted', colour: 0x4ADE80, icon: '▶️' },
  kick: { word: 'Kicked', colour: 0xF87171, icon: '\u{1F6AA}' },
  ban: { word: 'Banned', colour: 0xF87171, icon: '\u{1F528}' },
  unban: { word: 'Unbanned', colour: 0x4ADE80, icon: '\u{1F54A}️' },
  join: { word: 'Joined', colour: 0x4ADE80, icon: '\u{1F44B}' },
  leave: { word: 'Left', colour: 0x9B9BB2, icon: '\u{1F6B6}' },
  selfrole: { word: 'Self-assigned a role', colour: 0x38D9F0, icon: '\u{1F518}' }
};

function all() {
  const r = S.read(KEY, null);
  return Array.isArray(r) ? r : [];
}

function recent(n) { return all().slice(0, n || 60); }

function forUser(id) { return all().filter(e => e.who === id); }

function channel() { return S.read('config', {}).logChannel || ''; }

function nameOf(id) {
  const m = G.live.members[id];
  if (m) return m.nick || m.global_name || m.username;
  const u = S.read('users', {})[id];
  return u ? u.name : null;
}

function record(kind, entry) {
  const row = Object.assign({ id: S.id(), kind: kind, at: Date.now() }, entry);
  const list = all();
  list.unshift(row);
  S.write(KEY, list.slice(0, MAX));
  post(row).catch(e => log(e.message));
  return row;
}

async function post(row) {
  const ch = channel();
  if (!ch || !D.botConfigured()) return;
  const k = KINDS[row.kind] || { word: row.kind, colour: 0x64647E, icon: '•' };
  const who = row.whoName || nameOf(row.who) || (row.who ? 'ID ' + row.who : null);
  const e = {
    color: k.colour,
    title: k.icon + '  ' + k.word,
    fields: [],
    footer: E.footer(E.brand()),
    timestamp: new Date(row.at).toISOString()
  };
  if (who) e.fields.push({ name: 'Who', value: row.who ? '<@' + row.who + '> (' + who + ')' : who, inline: true });
  if (row.byName) e.fields.push({ name: 'By', value: row.by ? '<@' + row.by + '>' : row.byName, inline: true });
  if (row.where) e.fields.push({ name: 'Where', value: '<#' + row.where + '>', inline: true });
  if (row.detail) e.fields.push({ name: 'Detail', value: String(row.detail).slice(0, 1000), inline: false });
  await D.post(ch, { embeds: [e], allowed_mentions: { parse: [] } });
}

function start() {
  G.on('join', m => {
    if (!m || !m.user || m.user.bot) return;
    record('join', {
      who: m.user.id,
      whoName: m.user.global_name || m.user.username,
      detail: 'Account made ' + E.rel(Number((BigInt(m.user.id) >> 22n) + 1420070400000n))
    });
  });
  G.on('leave', id => {
    if (!id) return;
    record('leave', { who: id, whoName: nameOf(id) });
  });
}

module.exports = { all, recent, forUser, record, post, channel, start, KINDS };
