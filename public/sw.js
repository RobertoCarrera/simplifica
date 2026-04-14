const CACHE_NAME = 'simplifica-crm-v2.2';
const STATIC_CACHE = 'simplifica-static-v2.2';
const DYNAMIC_CACHE = 'simplifica-dynamic-v2.2';
const API_CACHE = 'simplifica-api-v2.2';

// API cache TTL: 5 minutes
const API_CACHE_TTL_MS = 5 * 60 * 1000;

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json',
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/customers',
  '/api/tickets',
  '/api/works',
  '/api/products',
  '/api/companies'
];

// Install event - cache static resources
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(DYNAMIC_CACHE),
      caches.open(API_CACHE)
    ]).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE &&
                cacheName !== DYNAMIC_CACHE &&
                cacheName !== API_CACHE) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch event - implement sophisticated caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar esquemas no http/https (evita error chrome-extension)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Always bypass cache for runtime config to avoid stale Supabase keys
  if (url.pathname === '/assets/runtime-config.json') {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }

  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
  } else if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(request));
  } else {
    event.respondWith(handleNavigationRequest(request));
  }
});

// Handle API requests with Network First strategy
async function handleAPIRequest(request) {
  const cache = await caches.open(API_CACHE);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const headers = new Headers(networkResponse.headers);
      headers.set('X-SW-Cached-At', String(Date.now()));
      const cloned = new Response(await networkResponse.clone().arrayBuffer(), {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers
      });
      cache.put(request, cloned);
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      const cachedAt = parseInt(cachedResponse.headers.get('X-SW-Cached-At') || '0', 10);
      if (Date.now() - cachedAt <= API_CACHE_TTL_MS) {
        const headers = new Headers(cachedResponse.headers);
        headers.set('X-Served-From', 'cache');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers
        });
      }
    }

    return new Response(JSON.stringify({
      error: 'offline',
      message: 'No hay conexión a internet y no se encontraron datos en caché'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle static assets with Cache First strategy
async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Asset not available offline', { status: 404 });
  }
}

// Handle navigation requests
async function handleNavigationRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(STATIC_CACHE);
    const appShell = await cache.match('/index.html');
    return appShell || new Response('App not available offline', { status: 404 });
  }
}

function isStaticAsset(pathname) {
  return pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
}

// Security: Clear sensitive API cache on logout signal from Angular app.
// This prevents cached customer/ticket data from leaking to subsequent users
// on shared or public devices.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'LOGOUT') {
    Promise.all([
      caches.delete(API_CACHE),
      caches.delete(DYNAMIC_CACHE)
    ]).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }

  // Update available notification
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions());
  }

  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function syncOfflineActions() {
  try {
    const db = await openOfflineDB();
    const transaction = db.transaction(['pending_actions'], 'readonly');
    const store = transaction.objectStore('pending_actions');
    const actions = await getAllFromStore(store);

    for (const action of actions) {
      try {
        await executeOfflineAction(action);
        const deleteTransaction = db.transaction(['pending_actions'], 'readwrite');
        const deleteStore = deleteTransaction.objectStore('pending_actions');
        await deleteFromStore(deleteStore, action.id);
      } catch (error) {
        // Silent fail for individual action sync
      }
    }

    db.close();
  } catch (error) {
    // Silent fail for entire sync
  }
}

async function doBackgroundSync() {
  return Promise.resolve();
}

async function executeOfflineAction(action) {
  const { type, entity, data } = action;
  const url = `/api/${entity}${type === 'update' ? `/${data.id}` : ''}`;

  const options = {
    method: type === 'create' ? 'POST' : type === 'update' ? 'PUT' : 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: type !== 'delete' ? JSON.stringify(data) : undefined
  };

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response;
}

// IndexedDB helpers
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SimplificaOfflineDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteFromStore(store, id) {
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Push notifications
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag,
    renotify: data.renotify || false,
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data;
  const action = event.action;

  event.waitUntil(handleNotificationAction(action, data));
});

async function handleNotificationAction(action, data) {
  const clients = await self.clients.matchAll({ type: 'window' });

  if (clients.length > 0) {
    const client = clients[0];
    client.focus();

    if (data.url) {
      client.postMessage({ type: 'navigate', url: data.url });
    }
    if (action) {
      client.postMessage({ type: 'notification-action', action, data });
    }
  } else {
    const url = data.url || '/';
    await self.clients.openWindow(url);
  }
}

// Periodic background sync - cache cleanup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupOldCache());
  }
});

async function cleanupOldCache() {
  const cache = await caches.open(API_CACHE);
  const requests = await cache.keys();
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const request of requests) {
    const response = await cache.match(request);
    const dateHeader = response.headers.get('date');
    if (dateHeader) {
      const responseDate = new Date(dateHeader).getTime();
      if (now - responseDate > maxAge) {
        await cache.delete(request);
      }
    }
  }
}

// App badge API for unread counts
self.addEventListener('badgechange', event => {
  // Badge updates handled by the app via setAppBadge()/clearAppBadge()
});
