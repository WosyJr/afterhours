const fs = require('fs');
const path = require('path');

const FEATURES = [
  ['raid', 'Raid list', '../lib/raid.js'],
  ['clips', 'Twitch clips', '../lib/twitchclips.js'],
  ['golive', 'Go live makes a night', '../lib/golive.js'],
  ['streamstats', 'Stream stats on crew', '../lib/streamstats.js'],
  ['featart', 'Live feature cards', '../lib/featart.js'],
  ['webradio', 'Web player', '../lib/webradio.js'],
  ['fetchtrack', 'Add a track from a link', '../lib/fetchtrack.js'],
  ['sreq', 'Song requests', '../lib/sreq.js'],
  ['joinpage', 'Public join page', '../lib/joinpage.js'],
  ['hero', 'Rotating headlines', '../lib/hero.js']
];

function has(rel) {
  try {
    return fs.existsSync(path.join(__dirname, rel.replace('../lib/', '')));
  } catch (e) { return false; }
}

function list() {
  return FEATURES.map(f => ({ key: f[0], name: f[1], on: has(f[2]) }));
}

function stamp() {
  try {
    const st = fs.statSync(path.join(__dirname, 'pages.js'));
    return st.mtime.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  } catch (e) { return 'unknown'; }
}

function missing() {
  return list().filter(f => !f.on).length;
}

module.exports = { list, stamp, missing, FEATURES };
