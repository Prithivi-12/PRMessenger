/**
 * ═══════════════════════════════════════════════════════════════════
 * PRMessenger - Service Worker
 * Version: 6.1
 * Features: Offline support, Caching strategy, Push notifications
 * ═══════════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'prmessenger-v6.1';
const CACHE_VERSION = 6.1;

// Static assets to cache on install
const urlsToCache = [
    '/',
    '/index.html',
    '/front.css',
    '/front.js',
    '/manifest.json',
    'https://res.cloudinary.com/df8eafxtd/image/upload/v1758912201/cropped_circle_image_foloco.png'
];

// Resources that should never be cached
const CACHE_BLACKLIST = [
    '/socket.io/',
    '/upload',
    '/uploads/',
    '/api/'
];

// ═════════════════════════════════════════════════════════════════════
// INSTALL EVENT
// Pre-cache static assets
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
    console.log(`[Service Worker] Installing version ${CACHE_VERSION}...`);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching static assets');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('[Service Worker] Installation complete');
                // Force the waiting service worker to become the active service worker
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Installation failed:', error);
            })
    );
});

// ═════════════════════════════════════════════════════════════════════
// ACTIVATE EVENT
// Clean up old caches
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('activate', (event) => {
    console.log(`[Service Worker] Activating version ${CACHE_VERSION}...`);
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Delete old cache versions
                        if (cacheName !== CACHE_NAME) {
                            console.log('[Service Worker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[Service Worker] Activation complete');
                // Take control of all pages immediately
                return self.clients.claim();
            })
            .catch((error) => {
                console.error('[Service Worker] Activation failed:', error);
            })
    );
});

// ═════════════════════════════════════════════════════════════════════
// FETCH EVENT
// Network-first strategy with cache fallback
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const requestUrl = new URL(request.url);
    
    // ─────────────────────────────────────────────────────────────────
    // SKIP CACHING FOR SPECIFIC REQUESTS
    // ─────────────────────────────────────────────────────────────────
    
    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Don't cache blacklisted URLs
    if (CACHE_BLACKLIST.some(path => requestUrl.pathname.includes(path))) {
        return;
    }
    
    // Don't cache Socket.IO connections
    if (requestUrl.pathname.includes('socket.io')) {
        return;
    }
    
    // ─────────────────────────────────────────────────────────────────
    // CACHING STRATEGY: Network First, Cache Fallback
    // ─────────────────────────────────────────────────────────────────
    
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Check if response is valid
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }
                
                // Clone the response (can only be consumed once)
                const responseToCache = response.clone();
                
                // Cache successful responses
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(request, responseToCache);
                    })
                    .catch((error) => {
                        console.warn('[Service Worker] Cache put failed:', error);
                    });
                
                return response;
            })
            .catch((error) => {
                console.log('[Service Worker] Fetch failed, trying cache:', error);
                
                // Try to get from cache
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            console.log('[Service Worker] Serving from cache:', request.url);
                            return cachedResponse;
                        }
                        
                        // For document requests, return cached index.html
                        if (request.destination === 'document') {
                            return caches.match('/');
                        }
                        
                        // Return offline page or error response
                        return new Response('Offline - Resource not available', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({
                                'Content-Type': 'text/plain'
                            })
                        });
                    });
            })
    );
});

// ═════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION EVENT
// Handle incoming push notifications
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push notification received');
    
    // Default notification options
    let notificationData = {
        title: 'PRMessenger',
        body: 'You have a new message',
        icon: 'https://res.cloudinary.com/df8eafxtd/image/upload/v1758912201/cropped_circle_image_foloco.png',
        badge: 'https://res.cloudinary.com/df8eafxtd/image/upload/v1758912201/cropped_circle_image_foloco.png',
        vibrate: [200, 100, 200],
        tag: 'prmessenger-notification',
        requireInteraction: false,
        data: {}
    };
    
    // Parse push data if available
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                ...notificationData,
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                data: data
            };
        } catch (error) {
            console.error('[Service Worker] Failed to parse push data:', error);
        }
    }
    
    // Show notification
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            vibrate: notificationData.vibrate,
            tag: notificationData.tag,
            requireInteraction: notificationData.requireInteraction,
            data: notificationData.data
        })
    );
});

// ═════════════════════════════════════════════════════════════════════
// NOTIFICATION CLICK EVENT
// Handle notification clicks
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification clicked');
    
    // Close the notification
    event.notification.close();
    
    // Determine URL to open
    const urlToOpen = event.notification.data?.url || '/';
    
    // Open or focus the app
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        })
        .then((clientList) => {
            // Check if app is already open
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Open new window if app is not open
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
        .catch((error) => {
            console.error('[Service Worker] Failed to open window:', error);
        })
    );
});

// ═════════════════════════════════════════════════════════════════════
// MESSAGE EVENT
// Handle messages from clients
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('message', (event) => {
    console.log('[Service Worker] Message received:', event.data);
    
    // Handle skip waiting command
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    // Handle cache clear command
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then((cacheNames) => {
                    return Promise.all(
                        cacheNames.map((cacheName) => {
                            return caches.delete(cacheName);
                        })
                    );
                })
                .then(() => {
                    console.log('[Service Worker] All caches cleared');
                    return self.registration.showNotification('Cache Cleared', {
                        body: 'All cached data has been removed',
                        icon: 'https://res.cloudinary.com/df8eafxtd/image/upload/v1758912201/cropped_circle_image_foloco.png'
                    });
                })
        );
    }
});

// ═════════════════════════════════════════════════════════════════════
// BACKGROUND SYNC EVENT
// Handle background sync (optional feature)
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-messages') {
        event.waitUntil(
            // Sync logic here (e.g., send pending messages)
            Promise.resolve()
        );
    }
});

// ═════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════

/**
 * Check if a URL should be cached
 * @param {string} url - URL to check
 * @returns {boolean} - True if URL should be cached
 */
function shouldCache(url) {
    return !CACHE_BLACKLIST.some(path => url.includes(path));
}

/**
 * Get cache size
 * @returns {Promise<number>} - Cache size in bytes
 */
async function getCacheSize() {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let size = 0;
    
    for (const request of keys) {
        const response = await cache.match(request);
        const blob = await response.blob();
        size += blob.size;
    }
    
    return size;
}

// ═════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═════════════════════════════════════════════════════════════════════

self.addEventListener('error', (event) => {
    console.error('[Service Worker] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('[Service Worker] Unhandled promise rejection:', event.reason);
});

// ═════════════════════════════════════════════════════════════════════
// LOG SERVICE WORKER INFO
// ═════════════════════════════════════════════════════════════════════

console.log(`
╔═══════════════════════════════════════════════════════════╗
║         PRMessenger Service Worker v${CACHE_VERSION}              ║
║                                                           ║
║  Features:                                                ║
║  ✓ Offline support                                        ║
║  ✓ Network-first caching strategy                         ║
║  ✓ Push notifications                                     ║
║  ✓ Background sync                                        ║
║  ✓ Cache management                                       ║
╚═══════════════════════════════════════════════════════════╝
`);
