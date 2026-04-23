import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'

// Take control of all pages immediately when a new SW version installs,
// without waiting for tabs to close. This makes normal refreshes pick up new builds.
self.skipWaiting()
clientsClaim()

// ── Precache (manifest injected by vite-plugin-pwa at build time) ─────────────
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── SPA navigation fallback ───────────────────────────────────────────────────
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/share$/],
  })
)

// ── Google Fonts runtime cache ────────────────────────────────────────────────
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  'GET'
)

// ── Web Share Target ──────────────────────────────────────────────────────────
const FILE_CACHE = 'share-target-files-v1'
const META_CACHE = 'share-target-meta-v1'

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(handleShare(event.request))
  }
})

async function handleShare(request) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files').filter(f => f instanceof File && f.size > 0)
    if (!files.length) return Response.redirect('/', 303)

    const ts = Date.now()

    // Store each file in Cache API
    const fileCache = await caches.open(FILE_CACHE)
    await Promise.all(files.map((file, i) =>
      fileCache.put(
        new Request(`/share-files/${ts}/${i}`),
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name':  encodeURIComponent(file.name),
            'X-File-Size':  String(file.size),
          },
        })
      )
    ))

    // Store metadata so the app can enumerate files
    const metaCache = await caches.open(META_CACHE)
    await metaCache.put(
      '/share-meta',
      new Response(JSON.stringify({ ts, fileCount: files.length }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // If app window is already open: notify it and bring it to foreground
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    if (clients.length > 0) {
      for (const c of clients) c.postMessage({ type: 'SHARE_TARGET' })
      clients[0].focus()
      return new Response('', { status: 204 })
    }

    // App was closed: redirect to app with signal param
    return Response.redirect('/?shareTarget=1', 303)
  } catch {
    return Response.redirect('/', 303)
  }
}
