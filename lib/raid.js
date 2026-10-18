const St = require('./streams');
const SP = require('./streampages');
const V = require('./views');

const esc = V.esc;

function dur(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function candidates(forUid) {
  const now = Date.now();
  return St.liveList()
    .filter(l => l.platform === 'twitch')
    .filter(l => !forUid || String(l.uid) !== String(forUid))
    .map(l => ({
      uid: l.uid,
      handle: l.handle,
      name: SP.memberName(l.uid) || l.name || l.handle,
      title: l.title || '',
      game: l.game || '',
      viewers: Number(l.viewers) || 0,
      upFor: l.started ? now - l.started : 0,
      url: 'https://twitch.tv/' + l.handle,
      cmd: '/raid ' + l.handle
    }))
    .sort((a, b) => a.viewers - b.viewers || b.upFor - a.upFor);
}

function pick(forUid) {
  const list = candidates(forUid);
  return list.length ? list[0] : null;
}

function card(forUid) {
  const list = candidates(forUid);
  if (!list.length) {
    return `<div class="card"><div class="ch"><h2>Raid</h2><span class="note">twitch</span></div>
      <div class="cb"><p class="empty">Nobody else from the crew is live on Twitch right now.</p></div></div>`;
  }
  const rows = list.map((r, i) => `<div class="raidrow${i === 0 ? ' best' : ''}">
    <span class="rwho">
      <span class="rn">${esc(r.name)}</span>
      <span class="rh">@${esc(r.handle)}</span>
    </span>
    <span class="rwhat">
      ${r.game ? `<span class="rg">${esc(r.game)}</span>` : ''}
      ${r.title ? `<span class="rt">${esc(r.title)}</span>` : ''}
    </span>
    <span class="rnum"><b>${r.viewers}</b><span>watching</span></span>
    <span class="rnum"><b>${esc(dur(r.upFor))}</b><span>live</span></span>
    <span class="ract">
      <button class="btn sm ghost" type="button" data-copy="${esc(r.cmd)}">Copy ${esc(r.cmd)}</button>
      <a class="btn sm ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Open</a>
    </span>
  </div>`).join('');

  return `<div class="card"><div class="ch"><h2>Raid</h2>
      <span class="note">${list.length} live &middot; smallest first</span></div>
    <div class="cb">
      <p class="raidhint">Raid the smallest stream that is still going. Copy the command and paste it in your own chat.</p>
      <div class="raidlist">${rows}</div>
    </div></div>`;
}

function line(forUid) {
  const best = pick(forUid);
  if (!best) return null;
  return {
    text: 'Raid ' + best.name + ' — ' + best.viewers + ' watching, up ' + dur(best.upFor),
    cmd: best.cmd,
    url: best.url
  };
}

module.exports = { candidates, pick, card, line, dur };
