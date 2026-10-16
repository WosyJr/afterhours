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
  return Object.values(G.live.members)
    .filter(m => !m.bot)
    .filter(m => {
      const p = G.live.presence[m.id];
      return p && p.status && p.status !== 'offline';
    });
}

const DOT = { online: '\u{1F7E2}', idle: '\u{1F7E1}', dnd: '\u{1F534}', offline: '⚫' };

function build() {
  const rooms = VR.roomsWithPeople();
  const ids = Object.keys(rooms);
  const on = online();

  const fields = ids.map(id => {
    const who = rooms[id];
    const room = (G.live.channels[id] || {}).name || 'a room';
    const lines = who.map(uid => {
      const g = VR.gameOf(uid);
      const v = G.live.voice[uid] || {};
      const flags = [v.stream ? '\u{1F4FA}' : '', v.mute ? '\u{1F507}' : ''].filter(Boolean).join('');
      return ' ' + E.nameOf(uid) + (g ? ' — ' + g : '') + (flags ? '  ' + flags : '');
    });
    return { name: '\u{1F50A}  ' + room + '  (' + who.length + ')', value: lines.join('\n') || '​', inline: false };
  });

  const inVoice = ids.reduce((n, id) => n + rooms[id].length, 0);
  const idle = on.filter(m => !G.live.voice[m.id]);
  if (idle.length) {
    fields.push({
      name: 'Online, not in voice',
      value: idle.slice(0, 20).map(m => {
        const g = VR.gameOf(m.id);
        const p = G.live.presence[m.id] || {};
        return ' ' + (DOT[p.status] || '⚫') + ' ' + E.nameOf(m.id) + (g ? ' — ' + g : '');
      }).join('\n') + (idle.length > 20 ? '\n …and ' + (idle.length - 20) + ' more' : ''),
      inline: false
    });
  }

  const e = {
    color: inVoice ? 0x4ADE80 : E.C.staff,
    title: inVoice ? inVoice + ' in voice' : on.length ? 'Nobody in voice' : 'Quiet right now',
    description: on.length + ' online of ' + Object.values(G.live.members).filter(m => !m.bot).length + '.',
    fields: fields.slice(0, 20),
    footer: E.footer(E.brand() + ' · updates itself'),
    timestamp: new Date().toISOString()
  };
  if (!fields.length) e.description += '\nIt fills in as people come online.';

  const url = E.site();
  return {
    embeds: [e],
    allowed_mentions: { parse: [] },
    components: url ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Open the site', url: url }] }] : []
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
