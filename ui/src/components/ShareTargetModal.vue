<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { usePeersStore } from '../stores/peers.js'
import { usePeer }       from '../composables/usePeer.js'
import { fmtBytes }      from '../stores/messages.js'

const props = defineProps({
  files: { type: Array, required: true },
})
const emit = defineEmits(['close'])

const peersStore = usePeersStore()
const { sendFile, connectTo } = usePeer()

const selectedPeerId = ref(null)
const sendState      = ref('idle')   // 'idle' | 'connecting' | 'sending' | 'done' | 'error'
const currentFileIdx = ref(0)
const sendProgress   = ref(0)
const errorMsg       = ref('')

// ── Peer list: merge availPeers + openConversations ───────────────────────────
const allPeers = computed(() => {
  const result = []
  for (const [id, p] of peersStore.availPeers) {
    const conv = peersStore.openConversations.get(id)
    result.push({
      id,
      label:     p.displayName || p.alias || id.slice(0, 12) + '…',
      connected: conv?.connected ?? false,
      hasPin:    p.hasPin ?? false,
    })
  }
  // Also include already-open conversations not in availPeers
  for (const [id, conv] of peersStore.openConversations) {
    if (!peersStore.availPeers.has(id)) {
      result.push({ id, label: conv.label, connected: conv.connected, hasPin: false })
    }
  }
  return result
})

// ── Thumbnails for image files ────────────────────────────────────────────────
const thumbnailUrls = computed(() =>
  props.files.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
)
onUnmounted(() => thumbnailUrls.value.forEach(u => u && URL.revokeObjectURL(u)))

function fileEmoji(file) {
  if (file.type.startsWith('image/')) return '🖼️'
  if (file.type.startsWith('video/')) return '🎬'
  if (file.type.startsWith('audio/')) return '🎵'
  if (file.type === 'application/pdf') return '📕'
  if (file.type.includes('zip') || file.type.includes('tar')) return '📦'
  return '📄'
}

// ── Send logic ────────────────────────────────────────────────────────────────
async function sendToSelected() {
  if (!selectedPeerId.value) return
  const peerId = selectedPeerId.value
  sendState.value    = 'connecting'
  errorMsg.value     = ''
  sendProgress.value = 0

  try {
    const conv = peersStore.openConversations.get(peerId)
    if (!conv?.connected) {
      const peer = peersStore.availPeers.get(peerId)
      connectTo(peerId, peer?.displayName || peer?.alias || null, peer?.hasPin ?? false)
      await waitForConnection(peerId, 8000)
    }

    sendState.value = 'sending'
    for (let i = 0; i < props.files.length; i++) {
      currentFileIdx.value = i
      await sendFile(props.files[i], peerId)
      sendProgress.value = Math.round(((i + 1) / props.files.length) * 100)
    }

    sendState.value = 'done'
    setTimeout(() => emit('close'), 1500)
  } catch (err) {
    sendState.value = 'error'
    errorMsg.value  = err?.message || 'Failed to send. Try again.'
  }
}

function waitForConnection(peerId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (peersStore.openConversations.get(peerId)?.connected) { resolve(); return }
      if (Date.now() > deadline) { reject(new Error('Connection timed out')); return }
      setTimeout(check, 200)
    }
    check()
  })
}

function dismiss() {
  if (sendState.value === 'sending' || sendState.value === 'connecting') return
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        class="fixed inset-0 bg-slate-900/75 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        @click.self="dismiss"
      >
        <div
          class="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style="max-height: calc(var(--vh, 1vh) * 90); max-height: 90svh;"
          role="dialog"
          aria-modal="true"
          aria-label="Share files via Share by Air"
        >

          <!-- Header -->
          <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-4 text-white flex-shrink-0 flex items-center gap-3">
            <span class="text-2xl" aria-hidden="true">✈️</span>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-base">Share by Air</div>
              <div class="text-xs opacity-80">{{ files.length }} file{{ files.length !== 1 ? 's' : '' }} ready to send</div>
            </div>
            <button
              v-if="sendState !== 'sending' && sendState !== 'connecting'"
              @click="dismiss"
              class="text-white/70 hover:text-white transition text-lg leading-none p-1"
              aria-label="Dismiss"
            >✕</button>
          </div>

          <!-- Scrollable body -->
          <div class="flex-1 overflow-y-auto">

            <!-- File previews -->
            <div class="p-4 border-b border-slate-100">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Files to send</div>
              <div class="space-y-2">
                <div
                  v-for="(file, i) in files"
                  :key="i"
                  class="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                >
                  <div class="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 bg-slate-100 border border-slate-200">
                    <img v-if="thumbnailUrls[i]" :src="thumbnailUrls[i]" class="w-full h-full object-cover" alt="" />
                    <span v-else class="text-xl" aria-hidden="true">{{ fileEmoji(file) }}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-semibold truncate">{{ file.name }}</div>
                    <div class="text-[10px] text-slate-500">{{ fmtBytes(file.size) }}</div>
                  </div>
                  <div v-if="sendState === 'sending' && i === currentFileIdx" class="text-[10px] text-indigo-500 flex-shrink-0 font-bold">sending…</div>
                  <div v-else-if="(sendState === 'done' || (sendState === 'sending' && i < currentFileIdx))" class="text-[10px] text-emerald-500 flex-shrink-0 font-bold">✓</div>
                </div>
              </div>
            </div>

            <!-- Peer picker -->
            <div class="p-4">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Send to</div>

              <p v-if="allPeers.length === 0" class="text-center text-slate-400 text-xs py-8 leading-relaxed">
                No peers found on your network.<br>
                <span class="text-[10px]">Make sure both devices are on the same Wi-Fi and the app is open.</span>
              </p>

              <div v-else class="space-y-1.5">
                <button
                  v-for="peer in allPeers"
                  :key="peer.id"
                  @click="selectedPeerId = peer.id"
                  :disabled="sendState === 'sending' || sendState === 'connecting'"
                  class="w-full text-left px-3 py-2.5 rounded-xl border transition-all disabled:opacity-40"
                  :class="selectedPeerId === peer.id
                    ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                    : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'"
                >
                  <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full flex-shrink-0"
                      :class="peer.connected ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-semibold truncate">{{ peer.label }}</div>
                      <div class="text-[10px] text-slate-400 font-mono truncate">{{ peer.id }}</div>
                    </div>
                    <span v-if="selectedPeerId === peer.id" class="text-indigo-500 text-sm flex-shrink-0">✓</span>
                    <span v-else-if="peer.hasPin" class="text-[10px] text-amber-500 font-bold flex-shrink-0">PIN</span>
                  </div>
                </button>
              </div>
            </div>

          </div>

          <!-- Sticky footer -->
          <div class="flex-shrink-0 px-4 pb-4 pt-3 border-t border-slate-100 bg-white">

            <!-- Progress bar -->
            <div v-if="sendState === 'sending'" class="mb-3">
              <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  :style="{ width: sendProgress + '%' }"></div>
              </div>
              <p class="text-[10px] text-slate-500 mt-1.5 text-center">
                Sending file {{ currentFileIdx + 1 }} of {{ files.length }}…
              </p>
            </div>

            <p v-if="sendState === 'done'" class="text-center text-emerald-600 font-bold text-sm mb-3">✓ Sent!</p>
            <p v-if="sendState === 'connecting'" class="text-center text-slate-500 text-xs mb-3">Connecting to peer…</p>
            <p v-if="sendState === 'error'" class="text-center text-red-500 text-xs mb-3 leading-relaxed">{{ errorMsg }}</p>

            <div class="flex gap-2">
              <button
                v-if="sendState !== 'sending' && sendState !== 'connecting' && sendState !== 'done'"
                @click="dismiss"
                class="flex-1 py-2.5 rounded-full border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition"
              >Cancel</button>

              <button
                v-if="sendState !== 'done'"
                @click="sendToSelected"
                :disabled="!selectedPeerId || sendState === 'sending' || sendState === 'connecting'"
                class="flex-1 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700
                       disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold transition"
              >
                <template v-if="sendState === 'connecting'">Connecting…</template>
                <template v-else-if="sendState === 'sending'">Sending…</template>
                <template v-else-if="sendState === 'error'">Retry</template>
                <template v-else>Send {{ files.length > 1 ? files.length + ' Files' : 'File' }}</template>
              </button>
            </div>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
