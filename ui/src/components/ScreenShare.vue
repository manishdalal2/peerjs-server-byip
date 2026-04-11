<script setup>
import { ref, computed, watch } from 'vue'
import { useCallStore }  from '../stores/call.js'
import { usePeersStore } from '../stores/peers.js'
import { usePeer }       from '../composables/usePeer.js'

const callStore  = useCallStore()
const peersStore = usePeersStore()
const { stopScreenShare } = usePeer()

const sharerVideoEl = ref(null)   // sharer's own preview
const viewerVideoEl = ref(null)   // viewer's received stream

const visible = computed(() => callStore.isSharingScreen || callStore.isViewingScreen)

// Attach sharer's own screen stream when it starts
watch(() => callStore.screenStream, stream => {
  if (sharerVideoEl.value && stream) {
    sharerVideoEl.value.srcObject = stream
    sharerVideoEl.value.play().catch(() => {})
  }
})

// Attach remote screen stream when it arrives (viewer side)
watch(() => callStore.remoteScreenStream, stream => {
  if (viewerVideoEl.value && stream) {
    viewerVideoEl.value.srcObject = stream
    viewerVideoEl.value.play().catch(() => {})
  }
})

const label = computed(() =>
  callStore.isSharingScreen
    ? 'You are sharing your screen'
    : `${peersStore.connectedLabel || 'Peer'} is sharing their screen`
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-200"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-50 bg-black/90 flex flex-col"
      >
        <!-- Toolbar -->
        <div class="flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur-sm flex-shrink-0">
          <!-- LIVE badge -->
          <span class="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">
            <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
            LIVE
          </span>

          <span class="text-white text-sm flex-1 truncate">{{ label }}</span>

          <!-- Stop / Close button -->
          <button
            v-if="callStore.isSharingScreen"
            @click="stopScreenShare"
            class="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800
                   text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
          >Stop sharing</button>

          <!-- Viewer just dismisses the overlay (stream keeps going until sharer stops) -->
          <button
            v-else
            @click="callStore.isViewingScreen = false"
            title="Hide overlay (stream stays active)"
            class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white
                   flex items-center justify-center transition-colors flex-shrink-0"
          >
            <!-- X icon -->
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Video area -->
        <div class="flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-4">
          <!-- Sharer preview -->
          <video
            v-if="callStore.isSharingScreen"
            ref="sharerVideoEl"
            autoplay
            playsinline
            muted
            class="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
          ></video>

          <!-- Viewer display -->
          <video
            v-else-if="callStore.isViewingScreen"
            ref="viewerVideoEl"
            autoplay
            playsinline
            class="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
          ></video>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
