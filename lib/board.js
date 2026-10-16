const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');
const VR = require('./voicerooms');

const TICK_MS = Number(process.env.BOARD_TICK_MS || 60000);

let timer = null;
let lastShape = '';

function log() { console.log.apply(console, ['[board]'].concat([].slice.call(arguments))); }

function cfg() { return S.read('config', {}); }

function state() {
  const b = S.read('board', null);
  return b && typeof b === 'object' ? b : { message: '', channel: '', at: 0, error: '' };
}

function save(v) { S.write('board', v); }

function online() {
  return Object.values(G.live.members).filter(m => !m.bot).filter(m => statusOf(m.id) !== 'offline');
}

const DOT = { online: '\u{1F7E2}', idle: '\u{1F7E1}', dnd: '\u{1F534}', offline: '\u26AB' };

function statusOf(uid) {
  const p = G.live.presence[uid];
  if (G.live.voice[uid] && G.live.voice[uid].channel) {
    return (p && p.status && p.status !== 'offline') ? p.status : 'online';
  }
  return (p && p.status) || 'offline';
}

function flagsFor(uid) {
  const v = G.live.voice[uid] || {};
  const out = [];
  if (v.stream) out.push('\u{1F3A5}');
  if (v.video) out.push('\u{1F4F8}');
  if (v.deaf) out.push('\u{1F515}');
  else if (v.mute) out.push('\u{1F507}');
  return out.join(' ');
}

function build() {
  const rooms = VR.roomsWithPeople();
  const ids = Object.keys(rooms).sort((a, b) => rooms[b].length - rooms[a].length);
  const everyone = Object.values(G.live.members).filter(m => !m.bot);
  const inVoice = ids.reduce((n, id) => n + rooms[id].length, 0);
  const on = everyone.filter(m => statusOf(m.id) !== 'offline');

  const fields = ids.map(id => {
    const who = rooms[id];
    const room = (G.live.channels[id] || {}).name || 'a room';
    const top = VR.topGame(who);
    const lines = who.map(uid => {
      const g = VR.gameOf(uid);
      const f = flagsFor(uid);
      return '> ' + DOT[statusOf(uid)] + '  **' + E.nameOf(uid) + '**' +
        (g ? '  \u00b7  ' + g : '') + (f ? '  ' + f : '');
    });
    return {
      name: '\u{1F50A}  ' + room + '  \u2014  ' + who.length +
        (top && top.count > 1 ? '  \u00b7  ' + top.name : ''),
      value: lines.join('\n'),
      inline: false
    };
  });

  const idle = on.filter(m => !(G.live.voice[m.id] && G.live.voice[m.id].channel));
  if (idle.length) {
    const lines = idle.slice(0, 15).map(m => {
      const g = VR.gameOf(m.id);
      return '> ' + DOT[statusOf(m.id)] + '  ' + E.nameOf(m.id) + (g ? '  \u00b7  ' + g : '');
    });
    if (idle.length > 15) lines.push('> \u2026and ' + (idle.length - 15) + ' more');
    fields.push({ name: '\u{1F4AC}  Around, not in voice  \u2014  ' + idle.length, value: lines.join('\n'), inline: false });
  }

  const head = inVoice
    ? inVoice + ' of you in voice'
    : on.length ? 'Nobody in voice yet' : 'All quiet';

  const sub = inVoice
    ? ids.length + (ids.length === 1 ? ' room going' : ' rooms going') + '  \u00b7  ' +
      on.length + ' of ' + everyone.length + ' online'
    : on.length
      ? on.length + ' of ' + everyone.length + ' online \u2014 somebody start it off'
      : 'Nobody is about.';

  const e = {
    color: inVoice ? 0x4ADE80 : on.length ? E.C.night : 0x3A3A4A,
    title: head,
    description: sub + '\n\u200b',
    fields: fields.slice(0, 12),
    footer: E.footer(E.brand() + ' \u00b7 this message updates itself'),
    timestamp: new Date().toISOString()
  };
  if (!fields.length) e.description = sub;

  const pic = E.imageFor('board') || E.imageFor('icon');
  if (pic) e.thumbnail = { url: pic };

  const url = E.site();
  const row = [];
  if (url) row.push({ type: 2, style: 5, label: 'Open the site', url: url });
  if (url && inVoice) row.push({ type: 2, style: 5, label: 'What to play', url: url + '/play/library' });

  return {
    embeds: [e],
    allowed_mentions: { parse: [] },
    components: row.length ? [{ type: 1, components: row }] : []
  };
}

function shapeOf() {
  const rooms = VR.roomsWithPeople();
  return Object.keys(rooms).sort().map(id =>
    id + ':' + rooms[id].slice().sort().map(u => u + '/' + (VR.gameOf(u) || '')).join(',')
  ).join('|') + '#' + online().map(m => m.id + (G.live.presence[m.id] || {}).status).sort().join(',');
}

async function refresh(force) {
  const c = cfg();
  const st = state();
  if (!c.boardChannel || !D.botConfigured()) return;

  const shape = shapeOf();
  if (!force && shape === lastShape) return;
  lastShape = shape;

  const body = build();
  try {
    if (st.channel !== c.boardChannel) { st.message = ''; st.channel = c.boardChannel; }
    let have = null;
    if (st.message) have = await D.getMessage(c.boardChannel, st.message).catch(() => null);
    if (have) {
      await D.editMessage(c.boardChannel, st.message, body);
    } else {
      const made = await D.post(c.boardChannel, body);
      st.message = made && made.id ? made.id : '';
    }
    st.at = Date.now();
    st.error = '';
  } catch (e) {
    st.error = e.message;
    log('refresh', e.message);
  }
  save(st);
}

function start() {
  if (timer) return;
  setTimeout(() => refresh(true).catch(() => {}), 12000);
  timer = setInterval(() => refresh(false).catch(() => {}), TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() { clearInterval(timer); timer = null; }

module.exports = { start, stop, refresh, build, state, save, shapeOf, online };
