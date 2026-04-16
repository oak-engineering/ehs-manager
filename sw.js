// ═══════════════════════════════════════════════════════════
// EHS Manager – Service Worker v1
// Offline-Fähigkeit: Cache-First für statische Assets
// Sync-Queue: Schreiboperationen offline speichern + sync
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'ehs-v1';
const SYNC_TAG   = 'ehs-sync';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/datenbank.html',
  '/gbu.html',
  '/schulungen.html',
  '/unfaelle.html',
  '/sifa.html',
  '/db-bereiche.html',
  '/db-maschinen.html',
  '/db-gefahrstoffe.html',
  '/db-arbeitsmittel.html',
  '/db-psa.html',
  '/db-taetigkeiten.html',
  '/db-beauftragte.html',
  '/db-besucher.html',
  '/db-rechtskataster.html',
  '/auth.js',
  '/style.css',
  '/logo.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase.co')) {
    if (['POST','PATCH','PUT','DELETE'].includes(event.request.method)) {
      event.respondWith(networkOrQueue(event.request));
      return;
    }
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline', data: null }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function networkOrQueue(request) {
  try {
    return await fetch(request.clone());
  } catch {
    await queueRequest(request.clone());
    return new Response(JSON.stringify({ offline: true, queued: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function queueRequest(request) {
  const body = await request.text().catch(() => '');
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2),
    url: request.url, method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body, timestamp: new Date().toISOString(),
  };
  const db = await openSyncDB();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').add(entry);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  db.close();
  if (self.registration.sync) self.registration.sync.register(SYNC_TAG).catch(() => {});
}

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ehs-sync-db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('queue', { keyPath: 'id' });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) event.waitUntil(flushQueue());
});

async function flushQueue() {
  const db = await openSyncDB();
  const tx = db.transaction('queue', 'readonly');
  const all = await new Promise((res, rej) => {
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
  db.close();
  for (const entry of all) {
    try {
      await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.method !== 'GET' ? entry.body : undefined,
      });
      const db2 = await openSyncDB();
      const tx2 = db2.transaction('queue', 'readwrite');
      tx2.objectStore('queue').delete(entry.id);
      await new Promise((res, rej) => { tx2.oncomplete = res; tx2.onerror = rej; });
      db2.close();
    } catch {}
  }
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: 'sync-complete' }));
}