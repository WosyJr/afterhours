(function () {
  var root = document.getElementById('lib');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';

  var q = root.querySelector('#libq');
  var chips = [].slice.call(root.querySelectorAll('[data-f]'));
  var groups = [].slice.call(root.querySelectorAll('.ggrp'));
  var none = root.querySelector('.gnone');
  var filter = 'all';
  var opened = {};

  function matches(row, term) {
    if (term && row.dataset.name.indexOf(term) === -1) return false;
    if (filter === 'everyone') return row.dataset.all === '1';
    if (filter === 'never') return row.dataset.never === '1';
    if (filter === 'missing') return row.dataset.mine === '0';
    if (filter === 'mine') return row.dataset.mine === '1';
    return true;
  }

  function apply() {
    var term = (q && q.value || '').trim().toLowerCase();
    var narrowed = !!term || filter !== 'all';
    var shown = 0;

    groups.forEach(function (g) {
      var body = g.querySelector('.gbody');
      var head = g.querySelector('.ghead');
      var rows = [].slice.call(g.querySelectorAll('.gr'));
      var hits = 0;

      rows.forEach(function (r) {
        var ok = matches(r, term);
        r.hidden = !ok;
        if (ok) hits++;
      });

      shown += hits;
      g.hidden = hits === 0;

      var count = head.querySelector('.note');
      if (count) {
        count.textContent = narrowed
          ? hits + ' of ' + rows.length
          : rows.length + ' game' + (rows.length === 1 ? '' : 's');
      }

      if (narrowed) {
        if (!(g.dataset.grp in opened)) opened[g.dataset.grp] = !body.hidden;
        body.hidden = false;
        head.classList.add('open');
      } else if (g.dataset.grp in opened) {
        body.hidden = !opened[g.dataset.grp];
        head.classList.toggle('open', !body.hidden);
        delete opened[g.dataset.grp];
      }
    });

    if (none) none.hidden = shown !== 0;
  }

  if (q) {
    q.addEventListener('input', apply);
    q.addEventListener('search', apply);
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var want = c.getAttribute('data-f');
      filter = filter === want && want !== 'all' ? 'all' : want;
      chips.forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-f') === filter); });
      apply();
    });
  });

  root.addEventListener('click', function (e) {
    var h = e.target.closest('[data-grphead]');
    if (!h) return;
    var body = h.parentElement.querySelector('.gbody');
    body.hidden = !body.hidden;
    h.classList.toggle('open', !body.hidden);
  });

  apply();
})();
