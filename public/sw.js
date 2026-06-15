// Casa Tabor Service Worker — handles push notifications
const CACHE_NAME = 'casa-tabor-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── Push handler ─────────────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Casa Tabor', body: event.data.text() };
  }

  const { title = 'Casa Tabor', body = '', url = '/', tag, icon, actions = [], data = {} } = payload;

  const options = {
    body,
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: tag || 'casa-tabor-default',
    renotify: true,
    requireInteraction: false,
    actions,
    data: { url, ...data },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click — open/focus the app ──────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const action = event.action || 'open';
  const eventId = data.eventId || null;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // If app is already open, focus it
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'PUSH_NOTIFICATION_ACTION', action, url: targetUrl, eventId });
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          const u = new URL(targetUrl, self.location.origin);
          if (action && action !== 'open') {
            u.searchParams.set('push_action', action);
            if (eventId) u.searchParams.set('event_id', eventId);
          }
          return self.clients.openWindow(u.toString());
        }
      })
  );
});
