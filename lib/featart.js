const S = require('./store');
const G = require('./gateway');
const Cal = require('./calendar');
const V = require('./views');

const esc = V.esc;
const CAP = appid => 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + encodeURIComponent(appid) + '/header.jpg';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function topGames(n) {
  const lib = S.read('library', []).filter(g => g.appid);
  lib.sort((a, b) => ((b.owners || []).length - (a.owners || []).length) ||
    String(a.name).localeCompare(String(b.name)));
  return lib.slice(0, n || 12);
}

function libraryArt() {
  const games = topGames(14);
  if (!games.length) return '';
  const tiles = games.map((g, i) => {
    const owners = (g.owners || []).length;
    return `<figure class="gt" style="--i:${i}">
      <img src="${esc(CAP(g.appid))}" alt="${esc(g.name)}" loading="lazy" decoding="async">
      ${owners > 1 ? `<figcaption class="go">${owners}</figcaption>` : ''}
    </figure>`;
  }).join('');
  return `<div class="liveart libgrid" aria-hidden="true">${tiles}</div>`;
}

function seatsArt() {
  const roster = G.roster().filter(m => !m.bot);
  if (!roster.length) return '';
  const on = roster.filter(m => (m.presence && m.presence.status) &&
    m.presence.status !== 'offline');
  const show = on.concat(roster.filter(m => on.indexOf(m) === -1)).slice(0, 4);
  const seats = show.map((m, i) => {
    const status = (m.presence && m.presence.status) || 'offline';
    const nm = m.nick || m.global_name || m.username;
    return `<div class="seat took" style="--i:${i}">
      ${m.avatar
        ? `<img src="${esc(m.avatar)}" alt="" loading="lazy" decoding="async">`
        : `<span class="ini" style="background:${V.tint(m)}">${esc(V.initial(m))}</span>`}
      <span class="sdot" style="background:${V.DOT[status]}"></span>
      <span class="snm">${esc(nm)}</span>
    </div>`;
  }).join('');
  const open = [0, 1].map(i => `<div class="seat free" style="--i:${show.length + i}">
    <span class="plus"></span></div>`).join('');
  return `<div class="liveart seatrow" aria-hidden="true">${seats}${open}</div>`;
}

function monthPanel(y, m, marks) {
  const weeks = Cal.monthOf(y, m);
  const rows = weeks.map(w => w.map(d => {
    const hit = marks[d.iso];
    const cls = ['cd'];
    if (!d.inMonth) cls.push('out');
    if (d.isToday) cls.push('now');
    if (hit) cls.push('hit');
    return `<span class="${cls.join(' ')}"${hit ? ` title="${esc(hit.label)}"` : ''}>${d.date}${hit ? '<i></i>' : ''}</span>`;
  }).join('')).join('');
  return `<div class="cpanel" data-m="${y}-${m}">
    <div class="cgrid">${DAYS.map(d => `<span class="cdh">${d}</span>`).join('')}${rows}</div>
  </div>`;
}

function nightsArt() {
  const up = Cal.upcoming(60);
  const marks = {};
  up.forEach(x => {
    if (!marks[x.day]) marks[x.day] = { label: (x.game || x.label || 'Night') + (x.time ? ' · ' + x.time : '') };
  });
  const now = new Date();
  const panels = [0, 1, 2].map(k => {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    return { y: d.getFullYear(), m: d.getMonth(), html: monthPanel(d.getFullYear(), d.getMonth(), marks) };
  });
  const heads = panels.map((p, i) =>
    `<span class="cmn"${i ? ' hidden' : ''}>${MONTHS[p.m]} ${p.y}</span>`).join('');
  const body = panels.map((p, i) =>
    p.html.replace('<div class="cpanel"', `<div class="cpanel"${i ? ' hidden' : ''}`)).join('');
  const n = Object.keys(marks).length;
  return `<div class="liveart cal" data-cal>
    <div class="chead">
      <button type="button" class="cnav" data-cal-prev aria-label="Previous month">&#8249;</button>
      <span class="cmwrap">${heads}</span>
      <button type="button" class="cnav" data-cal-next aria-label="Next month">&#8250;</button>
    </div>
    ${body}
    ${n ? `<div class="cfoot">${n} night${n === 1 ? '' : 's'} on the board</div>` : ''}
  </div>`;
}

function forSlot(slot) {
  if (slot === 'feat-1') return seatsArt();
  if (slot === 'feat-2') return libraryArt();
  if (slot === 'feat-3') return nightsArt();
  return '';
}

module.exports = { forSlot, libraryArt, seatsArt, nightsArt, topGames, CAP };
