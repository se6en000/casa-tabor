// Casa Tabor Service Worker — push notifications + app-shell offline caching
//
// Bump CACHE_NAME whenever the CACHING STRATEGY below changes (not on every
// deploy — deploys are handled correctly regardless, see below). Bumping
// forces old cache generations to be cleared on the next activate.
const CACHE_NAME = 'casa-tabor-shell-v2'; // v2 (2026-09-25): drops v1 caches that stored an HTML page as a script

// Correctness constraint (see tests/service-worker-offline-shell.test.mjs and
// the reload-loop incident documented in scripts/ship.sh/CLAUDE.md): this
// cache must never cause a stale app shell to persist after a real deploy.
//   - Navigations (HTML): NETWORK-FIRST, cache is only a fallback for when the
//     network fetch genuinely fails. Never cache-first — a live deploy must
//     always have the chance to be fetched fresh so useAppUpdater's own
//     reload-on-new-version logic keeps working exactly as before.
//   - Hashed static assets (/assets/*): CACHE-FIRST is safe *because* Vite
//     content-hashes these filenames — a given URL's bytes never change, so
//     there's no staleness risk, and a new deploy naturally produces new
//     URLs that simply miss the cache and get fetched fresh (the old ones
//     just become unreferenced, cleaned up opportunistically below).
//   - version.json: NEVER cached (network-only) — it's the one thing
//     useAppUpdater polls to detect a new deploy; vercel.json already marks
//     it no-store at the HTTP layer for the same reason, this just makes the
//     service worker itself honor that too.
//   - Cross-origin requests (all Supabase REST/RPC/Edge Function calls) and
//     non-GET requests are passed through untouched — this service worker
//     must never intercept, cache, or otherwise interfere with API traffic.
//     React Query's own IndexedDB persister (src/lib/eventsCachePersister.ts)
//     owns data-layer resilience at a more correct layer already.
const NAVIGATION_CACHE_KEY = '/index.html';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function isHtml(response) {
  return (response.headers.get('content-type') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache/intercept writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase/API/cross-origin traffic
  if (url.pathname === '/version.json') return; // always network-fresh, see above

  const isNavigation = request.mode === 'navigate' || request.destination === 'document';
  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          void cache.put(NAVIGATION_CACHE_KEY, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(NAVIGATION_CACHE_KEY);
          if (cached) return cached;
          throw new Error('offline and nothing cached yet');
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        // A hashed asset is never HTML. During a deploy the server can answer a
        // not-yet-live asset URL with the app's HTML page (200); caching that
        // cache-first left the kiosk blank until a hard reload (2026-09-25).
        if (cached && !isHtml(cached)) return cached;
        if (cached) await cache.delete(request);
        const fresh = await fetch(request);
        if (fresh.ok && !isHtml(fresh)) void cache.put(request, fresh.clone());
        return fresh;
      })()
    );
  }
  // Everything else (icons, manifest.json, etc.) passes through natively —
  // small, low-traffic, and the browser's own HTTP cache already handles them.
});

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
