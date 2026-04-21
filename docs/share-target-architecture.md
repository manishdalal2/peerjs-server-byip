# Web Share Target Architecture

Explains how "Share by Air" appears in Android's share sheet and receives files without sending them to the server.

## How Service Workers intercept requests

```
Normal request (no SW):
App → Network → Server → Response → App

With Service Worker:
App → SW fetch event → (SW decides) → Network or Cache → Response → App
```

The Service Worker registers itself as a proxy for all network requests within its scope (`/`). Every fetch — HTML, JS, images, API calls — passes through the SW's `fetch` event first.

## Full share flow

```
Android Share Sheet
       │
       │  POST /share (multipart form with the file)
       ▼
┌─────────────────┐
│  Service Worker │  ← intercepts BEFORE it reaches the network
│   (ui/src/sw.js)│
└─────────────────┘
       │
       ├─ Reads file from request.formData()
       ├─ Stores file in Cache API (on-device browser storage)
       ├─ Stores metadata (filename, count, timestamp)
       │
       ├─ App already open? → postMessage to window (no reload)
       └─ App was closed?  → Response.redirect('/?shareTarget=1', 303)
                                      │
                                      ▼
                             App boots, onMounted() in
                             useShareTarget.js sees
                             ?shareTarget=1 in URL,
                             reads files from Cache API,
                             shows ShareTargetModal
```

**The file never leaves the device.** `server.js` only has a fallback `POST /share` handler for the rare case the service worker isn't installed yet — in normal operation Express never sees the request.

## Why event.respondWith() is the key

```js
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  if (event.request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(handleShare(event.request))  // ← SW takes over, network never called
    return
  }
  // Everything else falls through to Workbox/network normally
})
```

`event.respondWith()` tells the browser: **"I am handling this request — do not send it to the network."** Whatever `Response` is returned is what the browser gets back. The server is completely bypassed.

## The Cache API hand-off

The SW and the Vue app run in **separate JS contexts** and cannot share variables or memory directly:

```
┌─────────────────────────────┐    ┌──────────────────────────────┐
│     Service Worker          │    │      App (Vue page)           │
│     (background thread)     │    │      (main thread)            │
│                             │    │                               │
│  Has the File object        │    │  Needs the File object        │
│  from formData              │    │  to show ShareTargetModal     │
│                             │    │                               │
│  Cannot pass directly  ─────┼────┼──→ different memory space    │
└─────────────────────────────┘    └──────────────────────────────┘
```

Cache API acts as a **shared mailbox** — both contexts can read and write it:

```js
// SW writes (ui/src/sw.js):
const cache = await caches.open('share-target-files-v1')
await cache.put('/share-files/123/0', new Response(file, { headers: { 'X-File-Name': '...' } }))

// App reads (ui/src/composables/useShareTarget.js):
const cache = await caches.open('share-target-files-v1')
const res   = await cache.match('/share-files/123/0')
const blob  = await res.blob()
const file  = new File([blob], filename)
```

## Complete picture

```
Android Share
     │
     │ POST /share + file bytes
     ▼
Service Worker (fetch event)          ui/src/sw.js
     │
     ├─ reads file from request.formData()
     ├─ writes file ──────────────► Cache API (share-target-files-v1)
     ├─ writes metadata ──────────► Cache API (share-target-meta-v1)
     │
     └─ returns redirect → browser opens app
                                │
                                ▼
                         Vue app boots              ui/src/App.vue
                         useShareTarget.js          ui/src/composables/useShareTarget.js
                         reads file ◄────────────── Cache API
                                │
                                ▼
                         ShareTargetModal           ui/src/components/ShareTargetModal.vue
                         shows file preview
                         + peer picker
                                │
                                ▼
                         User picks peer
                         sendFile(file, peerId)     ui/src/composables/usePeer.js
                                │
                                ▼
                         WebRTC P2P transfer
                         (file never touches server)
```

## Relevant source files

| File | Role |
|------|------|
| `ui/src/sw.js` | Service worker — intercepts POST /share, stores to Cache API |
| `ui/src/composables/useShareTarget.js` | Reads files from Cache API on boot or SW message |
| `ui/src/components/ShareTargetModal.vue` | UI — file preview, peer picker, send button |
| `ui/vite.config.js` | PWA manifest — declares `share_target` so Android registers the app |
| `server.js` | Has a fallback `POST /share` redirect (only hit if SW not yet installed) |

## Debugging tips

**Simulate a share in the browser console** (no phone needed):
```js
const fd = new FormData()
fd.append('files', new File(['test'], 'test.pdf', { type: 'application/pdf' }))
fetch('/share', { method: 'POST', body: fd })
```

**Inspect the SW on a connected Android device:**
Open `chrome://inspect/#service-workers` on desktop → find the device → click **inspect** on the SW → its `console.log` output appears there in real time.

**Inspect cached files:**
DevTools → Application → Cache Storage → `share-target-files-v1` / `share-target-meta-v1`
