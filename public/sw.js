// Service worker: guarda a "casca" do app para abrir rápido e funcionar sem sinal.
// Os dados (API) nunca são guardados: sempre vêm do servidor.
const VERSAO = 'v9';
const CACHE = `jussara-${VERSAO}`;
const CASCA = [
  '/', '/admin/', '/css/app.css', '/js/comum.js', '/js/cliente.js', '/js/pix.js', '/js/vendor/qrcode.js',
  '/admin/admin.js', '/img/logo.png', '/bio/bio.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
      if (resp.ok || resp.type === 'opaque') { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return resp;
    })));
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return resp;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate'
        ? (await caches.match(url.pathname.startsWith('/admin') ? '/admin/' : '/')) : Response.error()))
  );
});

// ---------- Web Push Event Handlers ----------
self.addEventListener('push', (e) => {
  let dados = {};
  try {
    dados = e.data ? e.data.json() : {};
  } catch {
    dados = { body: e.data ? e.data.text() : '' };
  }

  const title = dados.title || 'Jerusa Beauty';
  const options = {
    body: dados.body || 'Novo agendamento recebido!',
    icon: dados.icon || '/img/icon-192.png',
    badge: dados.badge || '/img/favicon.png',
    vibrate: dados.vibrate || [200, 100, 200],
    tag: dados.tag || `push-${Date.now()}`,
    renotify: true,
    data: dados.data || { url: '/admin/' },
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const urlDestino = (e.notification.data && e.notification.data.url) || '/admin/';
  const urlCompleta = new URL(urlDestino, self.location.origin).href;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.includes('/admin') && 'focus' in j) {
          if ('navigate' in j && urlDestino) {
            j.navigate(urlCompleta);
          }
          return j.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlCompleta);
      }
    })
  );
});
