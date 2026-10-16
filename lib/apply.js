const S = require('./store');
const D = require('./discord');
const G = require('./gateway');
const E = require('./embeds');
const ML = require('./modlog');

const KEY = 'applications';

function log() { console.log.apply(console, ['[apply]'].concat([].slice.call(arguments))); }

function cfg() { return S.read('config', {}); }

function all() {
  const r = S.read(KEY, null);
  return Array.isArray(r) ? r : [];
}

function save(v) { S.write(KEY, v); return v; }

function get(id) { return all().find(a => a.id === id) || null; }

function forUser(uid) { return all().find(a => a.uid === uid && a.state === 'open') || null; }

function open() { return all().filter(a => a.state === 'open'); }

function need() { return Math.max(1, Number(cfg().applyVotes) || 1); }

function tally(a) {
  const yes = (a.votes || []).filter(v => v.yes).length;
  const no = (a.votes || []).filter(v => !v.yes).length;
  return { yes: yes, no: no, need: need() };
}

function create(user, answers) {
  if (!user || !user.id) throw new Error('No account.');
  const existing = forUser(user.id);
  if (existing) return existing;
  const row = {
    id: S.id(),
    uid: user.id,
    name: user.name || user.username || 'Someone',
    avatar: user.avatar || null,
    why: String(answers.why || '').slice(0, 600),
    who: String(answers.who || '').slice(0, 120),
    games: String(answers.games || '').slice(0, 200),
    at: Date.now(),
    state: 'open',
    votes: [],
    message: '',
    decidedBy: '',
    decidedAt: 0
  };
  const list = all();
  list.unshift(row);
  save(list.slice(0, 200));
  return row;
}

function embedFor(a) {
  const t = tally(a);
  const e = {
    color: a.state === 'approved' ? 0x4ADE80 : a.state === 'denied' ? 0xF87171 : E.C.night,
    author: { name: a.name },
    title: a.state === 'open' ? 'Wants in' : a.state === 'approved' ? 'Approved' : 'Turned down',
    fields: [],
    footer: E.footer(a.state === 'open'
      ? t.yes + ' yes · ' + t.no + ' no · ' + t.need + ' needed'
      : (a.decidedByName || 'Staff') + ' decided'),
    timestamp: new Date(a.at).toISOString()
  };
  if (a.avatar) e.author.icon_url = a.avatar;
  if (a.who) e.fields.push({ name: 'Who they know', value: a.who, inline: false });
  if (a.games) e.fields.push({ name: 'What they play', value: a.games, inline: false });
  if (a.why) e.fields.push({ name: 'Why', value: a.why.slice(0, 1000), inline: false });
  e.fields.push({ name: 'Account', value: '<@' + a.uid + '>', inline: true });
  const m = G.live.members[a.uid];
  if (m && m.joined_at) {
    e.fields.push({ name: 'In the server since', value: E.rel(Date.parse(m.joined_at)), inline: true });
  }
  if ((a.votes || []).length) {
    e.fields.push({
      name: 'Votes',
      value: a.votes.map(v => (v.yes ? '✅ ' : '❌ ') + (v.name || v.uid)).join('\n'),
      inline: false
    });
  }

  const body = { embeds: [e], allowed_mentions: { parse: [] } };
  if (a.state === 'open') {
    body.components = [{ type: 1, components: [
      { type: 2, style: 3, label: 'Let them in', custom_id: 'app:yes:' + a.id },
      { type: 2, style: 4, label: 'No', custom_id: 'app:no:' + a.id }
    ] }];
  }
  return body;
}

async function post(a) {
  const ch = cfg().applyChannel;
  if (!ch || !D.botConfigured()) return;
  try {
    if (a.message) {
      await D.editMessage(ch, a.message, embedFor(a));
    } else {
      const made = await D.post(ch, embedFor(a));
      if (made && made.id) {
        const list = all();
        const row = list.find(x => x.id === a.id);
        if (row) { row.message = made.id; save(list); }
      }
    }
  } catch (e) {
    log('post', e.message);
  }
}

async function vote(id, uid, name, yes) {
  const list = all();
  const a = list.find(x => x.id === id);
  if (!a) return { ok: false, why: 'That application is gone.' };
  if (a.state !== 'open') return { ok: false, why: 'That one was already decided.' };

  a.votes = (a.votes || []).filter(v => v.uid !== uid);
  a.votes.push({ uid: uid, name: name, yes: !!yes, at: Date.now() });
  save(list);

  const t = tally(a);
  if (t.no >= t.need) return finish(a.id, 'denied', uid, name);
  if (t.yes >= t.need) return finish(a.id, 'approved', uid, name);

  await post(a);
  return { ok: true, state: 'open', tally: t };
}

async function finish(id, state, byId, byName) {
  const list = all();
  const a = list.find(x => x.id === id);
  if (!a) return { ok: false, why: 'That application is gone.' };
  a.state = state;
  a.decidedBy = byId || '';
  a.decidedByName = byName || '';
  a.decidedAt = Date.now();
  save(list);

  let gave = null;
  if (state === 'approved') {
    const role = cfg().applyRole;
    if (role && (G.live.roles || []).some(r => r.id === role)) {
      try {
        await D.addRole(a.uid, role);
        gave = role;
      } catch (e) {
        log('grant', e.message);
      }
    }
  }

  ML.record(state === 'approved' ? 'role' : 'unnote', {
    who: a.uid, whoName: a.name, by: byId, byName: byName,
    detail: state === 'approved'
      ? 'Application approved' + (gave ? ', given ' + roleName(gave) : ', but no rank was set to give')
      : 'Application turned down'
  });

  await post(a);
  return { ok: true, state: state, gave: gave };
}

function roleName(id) {
  const r = (G.live.roles || []).find(x => x.id === id);
  return r ? r.name : 'a role';
}

function start() {}

module.exports = {
  all, get, open, forUser, create, vote, finish, post, embedFor, tally, need, roleName, start
};
