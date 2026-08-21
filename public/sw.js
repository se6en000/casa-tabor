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

  const { title = 'Casa Tabor', body = '', url = '/', tag, icon, actions = [], data = {}, eventId, prepItemId } = payload;

  const options = {
    body,
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: tag || 'casa-tabor-default',
    renotify: payload.renotify ?? false,
    requireInteraction: false,
    actions,
    data: { url, eventId, prepItemId, ...data },
    vibrate: payload.vibrate ?? [100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Push action dispatcher ───────────────────────────────────────────────────
async function handlePushAction(action, eventId, prepItemId, snoozeMinutes = 15) {
  if (!action || action === 'open' || (!eventId && !prepItemId)) return;
  try {
    await fetch('/functions/v1/notification-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        event_id: eventId,
        prep_item_id: prepItemId,
        snooze_minutes: snoozeMinutes,
      }),
    });
  } catch (err) {
    console.warn('[SW] Push action fetch failed:', err);
  }
}

// ── Notification click — open/focus the app or execute action ────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const action = event.action || 'open';
  const eventId = data.eventId || null;
  const prepItemId = data.prepItemId || null;
  const snoozeMinutes = data.snoozeMinutes || 15;

  const isInlineAction = action && action !== 'open';

  event.waitUntil(
    (async () => {
      // If user clicked an action button (e.g. Done, Snooze, Thumbs Down), execute it
      if (isInlineAction) {
        await handlePushAction(action, eventId, prepItemId, snoozeMinutes);
      }

      // Notify any active window clients
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'PUSH_NOTIFICATION_ACTION', action, url: targetUrl, eventId, prepItemId });
          if (!isInlineAction) return client.focus();
          return;
        }
      }

      // If default notification body was clicked and no client is open, open a new window
      if (!isInlineAction && self.clients.openWindow) {
        const u = new URL(targetUrl, self.location.origin);
        if (eventId) u.searchParams.set('event_id', eventId);
        if (prepItemId) u.searchParams.set('prep_item_id', prepItemId);
        return self.clients.openWindow(u.toString());
      }
    })()
  );
});
