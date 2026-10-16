(function () {
  var host = document.getElementById('pushbox');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = '1';

  var btn = host.querySelector('[data-push]');
  var note = host.querySelector('[data-pushnote]');
  var pub = host.dataset.key || '';

  function say(t) { if (note) { note.textContent = t; note.hidden = !t; } }

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  if (!supported()) {
    btn.disabled = true;
    btn.textContent = 'Not supported here';
    say('This browser cannot do web push. On an iPhone you have to add the site to your home screen first.');
    return;
  }
  if (!pub) {
    btn.disabled = true;
    btn.textContent = 'Not set up';
    return;
  }

  function toBytes(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function paint(on) {
    btn.textContent = on ? 'Turn notifications off' : 'Turn notifications on';
    btn.dataset.on = on ? '1' : '';
    host.classList.toggle('on', !!on);
  }

  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    return reg.pushManager.getSubscription().then(function (sub) { paint(!!sub); });
  }).catch(function (e) { say('Could not start the service worker: ' + e.message); });

  btn.addEventListener('click', function () {
    btn.disabled = true;
    say('');
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub) {
          var ep = sub.endpoint;
          return sub.unsubscribe().then(function () {
            return fetch('/api/push/off', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: ep })
            });
          }).then(function () { paint(false); });
        }
        return Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') {
            say(perm === 'denied'
              ? 'Your browser is blocking notifications for this site. Allow them in the padlock menu, then try again.'
              : 'You did not allow notifications.');
            return;
          }
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toBytes(pub)
          }).then(function (s) {
            return fetch('/api/push/on', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sub: s.toJSON(), agent: navigator.userAgent })
            });
          }).then(function () { paint(true); say('Done. Send yourself a test below.'); });
        });
      });
    }).catch(function (e) {
      say(e.message);
    }).then(function () { btn.disabled = false; });
  });
})();
