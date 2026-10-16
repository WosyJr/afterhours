const G = require('./gateway');

const GENERAL = [
  ['Good nights start here', 'Find who’s on, grab an open spot, pick something to play.'],
  ['The night’s wide open', 'See who’s around and make something of it.'],
  ['Somebody’s always down', 'Check who’s on and start something.'],
  ['Pick a thing, press start', 'Deciding is most of the battle.'],
  ['The crew’s assembling', 'Find a room and fall into it.'],
  ['No plans? Good.', 'That’s how the better ones start.'],
  ['Something’s usually running', 'Find it, join it.'],
  ['Grab a seat', 'There’s normally one open.'],
  ['Let’s make it a night', 'Who’s on, what’s open, what to play.'],
  ['The lobby’s warm', 'Come sit in it.'],
  ['You know the drill', 'Find the room, join the room.'],
  ['It’s on if you want it', 'Someone just has to say go first.'],
  ['Round up the usual suspects', 'They’re probably already on.'],
  ['Back for more', 'Can’t say we’re surprised.'],
  ['Here we go again', 'And that’s the whole point.'],
  ['Nothing planned, everything possible', 'Start with who’s online.'],
  ['The good part of the day', 'Right about now.'],
  ['Clock out, log in', 'The rest can wait.'],
  ['Your people are here', 'Or they will be shortly.'],
  ['One more round', 'It’s never one more round.'],
  ['Make something happen', 'Or wait for someone else to. Both work.'],
  ['Doors are open', 'Walk in.'],
  ['Pick your poison', 'The library’s right there.'],
  ['This is the part you look forward to', 'Don’t waste it in the menu.'],
  ['Let’s hear it', 'Voice first, game second.'],
  ['The night is young and so are we', 'Debatable on the second one.'],
  ['Everyone’s somewhere', 'Usually in voice.'],
  ['Find the room', 'The rest sorts itself out.'],
  ['Say the word', 'Someone will join. They always do.'],
  ['Start the night properly', 'With a plan or without one.'],
  ['What are we doing tonight', 'Genuine question, scroll down.'],
  ['The usual, then?', 'Thought so.'],
  ['Still your favourite server', 'Low bar, but we’ll take it.'],
  ['Something to play, someone to play it with', 'Both are downstairs.'],
  ['Idle hands', 'Go on, pick something.'],
  ['The queue awaits', 'It always awaits.'],
  ['Plans are optional', 'Showing up isn’t.'],
  ['Rally point', 'You’re standing on it.'],
  ['Welcome to the good bit', 'The day’s over, this starts now.'],
  ['Who’s up for it', 'Find out below.'],
  ['Don’t overthink it', 'Just join a room.'],
  ['There’s a night in here somewhere', 'Go and find it.'],
  ['Better than scrolling', 'Marginally.'],
  ['Log in, shut up, have fun', 'In that order.'],
  ['We’ve been expecting you', 'Not in a creepy way.'],
  ['Right on time', 'For absolutely nothing in particular.'],
  ['Assemble', 'Dramatic, but accurate.'],
  ['Another one', 'Let’s make it count.']
];

const LATE = [
  ['Still up, then', 'Join the club.'],
  ['The best hours', 'Everyone sensible has gone to bed.'],
  ['Late crew only', 'You’ve earned the quiet.'],
  ['Nobody’s going to bed', 'Not while this is running.'],
  ['Three more games, tops', 'We both know that’s a lie.'],
  ['The night shift', 'Clocking in.'],
  ['It’s late and that’s fine', 'Find a room, keep it going.'],
  ['Past the point of reason', 'Perfect.'],
  ['One more won’t hurt', 'It might hurt tomorrow.'],
  ['Small hours, big plays', 'Or small plays. No judgement.'],
  ['Tomorrow’s problem', 'Tonight’s not done.'],
  ['The stragglers’ lounge', 'Pull up a chair.'],
  ['You should sleep', 'You won’t. See who’s on.'],
  ['Dark outside, loud inside', 'That’s the correct ratio.'],
  ['Last ones standing', 'Make it worth it.'],
  ['Nobody left to be responsible', 'Convenient.']
];

const WEEKEND = [
  ['It’s finally Friday', 'Act accordingly.'],
  ['No alarm tomorrow', 'Make full use of that.'],
  ['Weekend’s open', 'Nothing has to end early.'],
  ['This is what the week was for', 'Go on.'],
  ['All night if we want', 'And we usually want.'],
  ['Saturday rules apply', 'There are no rules.'],
  ['Nowhere to be', 'Beautiful, isn’t it.'],
  ['The long one', 'Clear the evening.'],
  ['Earned this', 'Every hour of it.'],
  ['Weekend crew’s in', 'Find them below.'],
  ['No excuses tonight', 'Everyone’s free and you know it.'],
  ['Big night energy', 'Let’s see if it holds.'],
  ['Two days of nothing', 'Starting now.'],
  ['The week can wait', 'It’ll still be there.']
];

const QUIET = [
  ['Quiet one tonight', 'Start a room and see who appears.'],
  ['You’re first in', 'Somebody has to be.'],
  ['Empty rooms, full library', 'Pick something and wait it out.'],
  ['Nobody’s on yet', 'They usually turn up when someone starts.'],
  ['Just you for now', 'That tends to change quickly.'],
  ['Light a signal', 'Hop in voice, they’ll follow.'],
  ['The calm before', 'Give it twenty minutes.'],
  ['Yours for the moment', 'Whole place to yourself.'],
  ['Be the reason tonight happens', 'Someone has to go first.'],
  ['All quiet', 'Put something on and see.'],
  ['Nothing running yet', 'Easily fixed.'],
  ['Start it off', 'The rest will follow.']
];

const BUSY = [
  ['It’s already going', 'Don’t be last in.'],
  ['They started without you', 'Rude. Go join them.'],
  ['You’re missing it', 'Not for much longer, hopefully.'],
  ['Voice is loud', 'Go and make it louder.'],
  ['Party’s underway', 'Jump in.'],
  ['They’re waiting on you', 'Probably.'],
  ['Room’s filling up', 'Get in before it doesn’t.'],
  ['Live right now', 'Downstairs, in voice.'],
  ['Everyone’s in', 'Except you, currently.'],
  ['Don’t make them wait', 'Two clicks.'],
  ['Something’s happening', 'And you’re not in it yet.'],
  ['The night’s running', 'Catch it.']
];

const DAY = [
  ['Early for you', 'Check who’s about anyway.'],
  ['Daylight hours', 'Bold choice.'],
  ['Getting a head start', 'Respect.'],
  ['Afternoon run', 'Why not.'],
  ['Before the rush', 'Pick something now, keep it later.'],
  ['Plan it now, play it later', 'Lock a night in while you’re here.'],
  ['Sun’s still up', 'Doesn’t mean much in here.'],
  ['Warming up', 'The real one starts later.'],
  ['Scouting ahead', 'See what’s on the list.'],
  ['Setting it up', 'Get a night on the board.']
];

const SEASONAL = [
  { line: ['Dark by five', 'Perfect gaming weather.'], when: d => [10, 11, 0].indexOf(d.getMonth()) > -1 },
  { line: ['Cold out, warm in here', 'Stay in.'], when: d => [11, 0, 1].indexOf(d.getMonth()) > -1 },
  { line: ['Nothing better to do in December', 'By design.'], when: d => d.getMonth() === 11 },
  { line: ['Happy new year', 'Same crew, new numbers.'], when: d => d.getMonth() === 0 && d.getDate() <= 7 },
  { line: ['Spooky season', 'Somebody’s going to suggest horror.'], when: d => d.getMonth() === 9 },
  { line: ['Long nights, long sessions', 'The good trade.'], when: d => [10, 11, 0, 1].indexOf(d.getMonth()) > -1 },
  { line: ['Too hot to go outside', 'Convenient excuse.'], when: d => [6, 7].indexOf(d.getMonth()) > -1 },
  { line: ['Light till ten', 'Doesn’t stop us.'], when: d => [5, 6].indexOf(d.getMonth()) > -1 },
  { line: ['Back to it', 'Holidays over, routine restored.'], when: d => d.getMonth() === 0 && d.getDate() >= 2 && d.getDate() <= 10 },
  { line: ['Long weekend', 'Use it properly.'], when: d => d.getDay() === 1 && isHolidayish(d) }
];

const US_MONDAYS = [[0, 15, 21], [1, 15, 21], [4, 25, 31], [8, 1, 7], [9, 8, 14], [10, 22, 28]];

function isHolidayish(d) {
  return US_MONDAYS.some(h => d.getMonth() === h[0] && d.getDate() >= h[1] && d.getDate() <= h[2]);
}

const POOLS = {
  general: GENERAL, late: LATE, weekend: WEEKEND, quiet: QUIET, busy: BUSY, day: DAY
};

function all() {
  return Object.keys(POOLS).reduce((n, k) => n + POOLS[k].length, 0) + SEASONAL.length;
}

function seasonalNow(d) {
  return SEASONAL.filter(s => s.when(d)).map(s => s.line);
}

function context(now, counts) {
  const d = now || new Date();
  const h = d.getHours();
  const day = d.getDay();
  const c = counts || {};
  const out = [];

  if (c.voice >= 2) out.push(['busy', 46]);
  else if (!c.online) out.push(['quiet', 46]);

  if (h >= 23 || h < 5) out.push(['late', 40]);
  else if (h < 18) out.push(['day', 26]);

  if ((day === 5 || day === 6) && h >= 17) out.push(['weekend', 30]);
  if ((day === 5 && h >= 23) || (day === 6 && h < 5)) out.push(['weekend', 14]);

  const season = seasonalNow(d);
  if (season.length) out.push(['season', 16]);

  out.push(['general', 52]);
  return { weights: out, season: season };
}

function poolFor(name, season) {
  return name === 'season' ? season : POOLS[name];
}

function weighted(weights, rnd) {
  const total = weights.reduce((n, w) => n + w[1], 0);
  let at = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    at -= weights[i][1];
    if (at <= 0) return weights[i][0];
  }
  return weights[weights.length - 1][0];
}

const recent = {};
const KEEP = 7;

function remember(who, key) {
  const k = who || 'anon';
  if (!recent[k]) recent[k] = [];
  recent[k].push(key);
  while (recent[k].length > KEEP) recent[k].shift();
}

function seenBy(who) {
  return recent[who || 'anon'] || [];
}

function counts() {
  try {
    const members = G.live.members || {};
    const voice = G.live.voice || {};
    const presence = G.live.presence || {};
    const human = Object.keys(members).filter(id => members[id] && !members[id].bot);
    return {
      online: human.filter(id => (presence[id] || {}).status && presence[id].status !== 'offline').length,
      voice: human.filter(id => (voice[id] || {}).channel).length
    };
  } catch (e) {
    return { online: 0, voice: 0 };
  }
}

function pick(who, now, rnd, stats) {
  const r = typeof rnd === 'function' ? rnd : Math.random;
  const ctx = context(now, stats || counts());
  const seen = seenBy(who);

  let name = weighted(ctx.weights, r);
  let pool = poolFor(name, ctx.season);
  if (!pool || !pool.length) { name = 'general'; pool = GENERAL; }

  let fresh = pool.filter(l => seen.indexOf(name + '|' + l[0]) === -1);
  if (!fresh.length) fresh = pool;

  const line = fresh[Math.floor(r() * fresh.length) % fresh.length];
  remember(who, name + '|' + line[0]);
  return { title: line[0], sub: line[1], pool: name };
}

function forHero(cfg, who) {
  if (cfg && cfg.heroTitle) {
    return { title: cfg.heroTitle, sub: cfg.heroSub || '', pool: 'custom' };
  }
  const got = pick(who);
  return { title: got.title, sub: cfg && cfg.heroSub ? cfg.heroSub : got.sub, pool: got.pool };
}

function reset() {
  Object.keys(recent).forEach(k => delete recent[k]);
}

module.exports = {
  pick, forHero, context, counts, all, seasonalNow, reset, recent,
  POOLS, SEASONAL, GENERAL, LATE, WEEKEND, QUIET, BUSY, DAY
};
