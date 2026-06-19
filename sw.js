/* ========================================
   Papyrus Reader - Service Worker
   Fase 3 Final
   ======================================== */

const CACHE_NAME = 'papyrus-v1';
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png',
    // Libraries
    'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
    'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    // JS Files
    '/js/utils/helpers.js',
    '/js/engines/base.js',
    '/js/engines/epub.js',
    '/js/engines/pdf.js',
    '/js/engines/txt.js',
    '/js/engines/markdown.js',
    '/js/paginator.js',
    '/js/flipbook.js',
    '/js/features/bookmark.js',
    '/js/features/highlight.js',
    '/js/features/search.js',
    '/js/features/settings.js',
    '/js/features/tts.js',
    '/js/reader.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching assets');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    // Biarkan CDN request langsung ke network
    if (url.hostname !== self.location.hostname && 
        !url.hostname.includes('cdnjs') && 
        !url.hostname.includes('jsdelivr')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then((response) => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, clone);
                                });
                        }
                        return response;
                    })
                    .catch(() => {
                        return new Response('Offline - konten tidak tersedia', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});