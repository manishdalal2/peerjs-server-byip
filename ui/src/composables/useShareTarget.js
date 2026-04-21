import { ref, onMounted, onUnmounted } from 'vue'

const FILE_CACHE = 'share-target-files-v1'
const META_CACHE = 'share-target-meta-v1'

export function useShareTarget() {
  const sharedFiles = ref([])
  const isLoading   = ref(false)

  async function loadFromCache() {
    if (isLoading.value) return
    isLoading.value = true
    try {
      const metaCache = await caches.open(META_CACHE)
      const metaRes   = await metaCache.match('/share-meta')
      if (!metaRes) return

      const { ts, fileCount } = await metaRes.json()

      // Discard stale shares older than 1 hour
      if (Date.now() - ts > 3_600_000) {
        await _clearCache(ts, fileCount)
        return
      }

      const fileCache = await caches.open(FILE_CACHE)
      const files = []
      for (let i = 0; i < fileCount; i++) {
        const res = await fileCache.match(`/share-files/${ts}/${i}`)
        if (!res) continue
        const blob = await res.blob()
        const name = decodeURIComponent(res.headers.get('X-File-Name') || `file-${i}`)
        files.push(new File([blob], name, { type: blob.type }))
      }
      if (files.length) sharedFiles.value = files
    } catch (err) {
      console.error('[useShareTarget] load failed:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function clearSharedFiles() {
    sharedFiles.value = []
    try {
      const metaCache = await caches.open(META_CACHE)
      const metaRes   = await metaCache.match('/share-meta')
      if (!metaRes) return
      const { ts, fileCount } = await metaRes.json()
      await _clearCache(ts, fileCount)
    } catch (err) {
      console.error('[useShareTarget] clear failed:', err)
    }
  }

  async function _clearCache(ts, fileCount) {
    const [fc, mc] = await Promise.all([caches.open(FILE_CACHE), caches.open(META_CACHE)])
    await Promise.all([
      mc.delete('/share-meta'),
      ...Array.from({ length: fileCount }, (_, i) => fc.delete(`/share-files/${ts}/${i}`)),
    ])
  }

  function onSwMessage(e) {
    if (e.data?.type === 'SHARE_TARGET') loadFromCache()
  }

  onMounted(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('shareTarget') === '1') {
      window.history.replaceState({}, '', window.location.pathname)
      loadFromCache()
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
  })

  onUnmounted(() => {
    navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  })

  return { sharedFiles, isLoading, clearSharedFiles }
}
