const CACHE_NAME = 'simplifica-crm-v2.0';
const STATIC_CACHE = 'simplifica-static-v2.0';
const DYNAMIC_CACHE = 'simplifica-dynamic-v2.0';
const API_CACHE = 'simplifica-api-v2.0';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json',
  // Angular bundles will be added dynamically
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
  console.log('[SW] Installing service worker');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(DYNAMIC_CACHE),
      caches.open(API_CACHE)
    ]).then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== API_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
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
    return; // no procesar extensiones u otros esquemas
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    // API requests - Network First with fallback
    event.respondWith(handleAPIRequest(request));
  } else if (isStaticAsset(url.pathname)) {
    // Static assets - Cache First
    event.respondWith(handleStaticAsset(request));
  } else {
    // Navigation requests - Network First with App Shell fallback
    event.respondWith(handleNavigationRequest(request));
  }
});

// Handle API requests with Network First strategy
async function handleAPIRequest(request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed for API request, checking cache');
    
    // Fallback to cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // Add offline header to indicate cached response
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-Served-From', 'cache');
      
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: headers
      });
    }
    
    // Return offline fallback
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
    console.log('[SW] Failed to fetch static asset:', request.url);
    return new Response('Asset not available offline', { status: 404 });
  }
}

// Handle navigation requests
async function handleNavigationRequest(request) {
  try {
    // Try network first
    return await fetch(request);
  } catch (error) {
    // Fallback to app shell
    const cache = await caches.open(STATIC_CACHE);
    const appShell = await cache.match('/index.html');
    return appShell || new Response('App not available offline', { status: 404 });
  }
}

function isStaticAsset(pathname) {
  return pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
}

// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions());
  }
});

async function syncOfflineActions() {
  console.log('[SW] Syncing offline actions');
  
  try {
    // Get pending actions from IndexedDB
    const db = await openOfflineDB();
    const transaction = db.transaction(['pending_actions'], 'readonly');
    const store = transaction.objectStore('pending_actions');
    const actions = await getAllFromStore(store);
    
    console.log('[SW] Found', actions.length, 'pending actions');
    
    for (const action of actions) {
      try {
        await executeOfflineAction(action);
        
        // Remove successful action from DB
        const deleteTransaction = db.transaction(['pending_actions'], 'readwrite');
        const deleteStore = deleteTransaction.objectStore('pending_actions');
        await deleteFromStore(deleteStore, action.id);
        
        console.log('[SW] Successfully synced action:', action.id);
      } catch (error) {
        console.error('[SW] Failed to sync action:', action.id, error);
      }
    }
    
    db.close();
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

async function executeOfflineAction(action) {
  const { type, entity, data } = action;
  const url = `/api/${entity}${type === 'update' ? `/${data.id}` : ''}`;
  
  const options = {
    method: type === 'create' ? 'POST' : type === 'update' ? 'PUT' : 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
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

// Push notification event
self.addEventListener('push', event => {
  console.log('[SW] Push message received');
  
  if (!event.data) {
    return;
  }
  
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

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const data = event.notification.data;
  const action = event.action;
  
  event.waitUntil(
    handleNotificationAction(action, data)
  );
});

async function handleNotificationAction(action, data) {
  const clients = await self.clients.matchAll({ type: 'window' });
  
  // If app is already open, focus it
  if (clients.length > 0) {
    const client = clients[0];
    client.focus();
    
    if (data.url) {
      client.postMessage({
        type: 'navigate',
        url: data.url
      });
    }
    
    if (action) {
      client.postMessage({
        type: 'notification-action',
        action: action,
        data: data
      });
    }
  } else {
    // Open new window
    const url = data.url || '/';
    await self.clients.openWindow(url);
  }
}

// Periodic background sync
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupOldCache());
  }
});

async function cleanupOldCache() {
  console.log('[SW] Cleaning up old cache entries');
  
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
        console.log('[SW] Deleted old cache entry:', request.url);
      }
    }
  }
}
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Handle background sync here
  console.log('Background sync triggered');
  return Promise.resolve();
}

// Push notifications
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Nueva notificación de Simplifica CRM',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('Simplifica CRM', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});

// Update available notification
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// App badge API for unread counts
self.addEventListener('badgechange', event => {
  // Handle badge updates
  console.log('Badge changed:', event.badge);
});
