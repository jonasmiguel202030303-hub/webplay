var CACHE_NAME = 'webplay-v11';
var STATIC_ASSETS = [
    '/',
    '/index.html',
    '/player.html',
    '/css/style.css',
    '/js/app.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install - cache static assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(STATIC_ASSETS);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// Activate - clean old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Fetch - Network first, fallback to cache (for HTML/CSS/JS)
// API calls always go to network
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip non-http(s) schemes (chrome-extension://, etc.)
    if (!url.protocol.startsWith('http')) return;

    // Skip API/proxy calls - always network
    if (url.pathname.indexOf('/api/') >= 0) return;

    // Icons — never cache; always fetch fresh so branding changes apply immediately
    if (url.pathname.indexOf('/icons/') >= 0) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Skip external resources (CDN, fonts, etc.)
    if (url.origin !== location.origin) {
        // Cache CDN resources (fonts, FA, hls.js)
        event.respondWith(
            caches.match(event.request).then(function(cached) {
                if (cached) return cached;
                return fetch(event.request).then(function(response) {
                    if (response.ok) {
                        var clone = response.clone();
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                }).catch(function() {
                    return cached;
                });
            })
        );
        return;
    }

    // Local assets - Network first, cache fallback
    event.respondWith(
        fetch(event.request).then(function(response) {
            if (response.ok) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, clone);
                });
            }
            return response;
        }).catch(function() {
            return caches.match(event.request);
        })
    );
});
