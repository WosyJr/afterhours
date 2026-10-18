const S = require('./store');
const SP = require('./streampages');

const MAX = 20;

function cfg() { return S.read('config', {}); }

function on() { return cfg().goLiveNight !== false; }

function tagOf(uid) { return 'live-' + uid; }

function sessions() { return S.read('sessions', []); }

function existing(uid) {
  return sessions().find(s => s.live === tagOf(uid));
}

function onLive(uid, s) {
  if (!on()) return null;
  if (existing(uid)) return null;
  const name = SP.memberName(uid) || 'Someone';
  const game = (s && s.game) || 'Whatever is on';
  const list = sessions();
  const row = {
    id: S.id(),
    game: game,
    when: 'Live now',
    cap: 8,
    host: String(uid),
    hostName: name,
    players: [String(uid)],
    at: Date.now(),
    live: tagOf(uid),
    url: s && s.handle ? 'https://twitch.tv/' + s.handle : ''
  };
  list.unshift(row);
  S.write('sessions', list.slice(0, MAX));
  return row;
}

function onOff(uid) {
  const tag = tagOf(uid);
  const list = sessions();
  const keep = list.filter(s => {
    if (s.live !== tag) return true;
    return s.players.length > 1;
  });
  const closed = keep.filter(s => s.live === tag);
  closed.forEach(s => { s.when = 'Stream ended'; s.live = null; });
  if (keep.length !== list.length || closed.length) S.write('sessions', keep);
  return true;
}

function setOn(v) {
  const c = cfg();
  c.goLiveNight = !!v;
  S.write('config', c);
  return !!v;
}

module.exports = { onLive, onOff, on, setOn, tagOf };
