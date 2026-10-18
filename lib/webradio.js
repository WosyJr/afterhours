const S = require('./store');
const Radio = require('./radio');

const ALIVE_MS = 25000;

const state = { track: null, at: 0, beat: 0, deck: 'safe', paused: false };

function live() {
  return !!(state.beat && Date.now() - state.beat < ALIVE_MS);
}

function deck() {
  return state.deck === 'crew' ? 'crew' : 'safe';
}

function setDeck(d) {
  state.deck = d === 'crew' ? 'crew' : 'safe';
  return state.deck;
}

function beat(info) {
  state.beat = Date.now();
  if (info && typeof info.paused === 'boolean') state.paused = info.paused;
  if (info && info.deck) setDeck(info.deck);
  return live();
}

function setPlaying(id) {
  const t = Radio.tracks().find(x => x.id === id);
  if (!t) { state.track = null; return null; }
  state.track = { id: t.id, name: t.name, artist: t.artist || '', byName: t.byName || '', deck: Radio.deckOf(t) };
  state.at = Date.now();
  state.beat = Date.now();
  const all = Radio.tracks();
  const row = all.find(x => x.id === id);
  if (row) { row.plays = (row.plays || 0) + 1; S.write('radio', all); }
  return state.track;
}

function stop() {
  state.track = null;
  state.beat = 0;
  state.paused = false;
}

function nextTrack() {
  const want = deck();
  const pool = Radio.tracks().filter(t => Radio.deckOf(t) === want);
  if (!pool.length) return null;

  const q = Radio.queue();
  while (q.length) {
    const asked = q.shift();
    const hit = pool.find(x => x.id === asked.id);
    if (hit) {
      Radio.saveQueue(q);
      return { track: pub(hit), requested: true, by: asked.byName || '' };
    }
  }
  if (q.length !== Radio.queue().length) Radio.saveQueue(q);

  const lastId = state.track && state.track.id;
  const choices = pool.length > 1 ? pool.filter(t => t.id !== lastId) : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  return { track: pub(pick), requested: false, by: '' };
}

function pub(t) {
  return {
    id: t.id,
    name: t.name,
    artist: t.artist || '',
    byName: t.byName || '',
    url: t.url,
    deck: Radio.deckOf(t)
  };
}

function status() {
  return {
    live: live(),
    paused: state.paused,
    deck: deck(),
    track: state.track,
    since: state.at,
    queue: Radio.queueView(),
    counts: Radio.counts()
  };
}

module.exports = { live, deck, setDeck, beat, setPlaying, stop, nextTrack, status, state, ALIVE_MS };
