<script setup>
import { ref, computed, watch } from 'vue'
import { useCallStore } from '../stores/call.js'
import { usePeer }      from '../composables/usePeer.js'

const callStore = useCallStore()
const { cancelCall, endCall, toggleMute, startScreenShare, stopScreenShare } = usePeer()

const remoteAudioEl = ref(null)

// Attach remote stream to the <audio> element whenever it arrives
watch(() => callStore.remoteStream, stream => {
  if (remoteAudioEl.value && stream) {
    remoteAudioEl.value.srcObject = stream
    remoteAudioEl.value.play().catch(() => {})
  }
})

const isRingingOut = computed(() => callStore.callState === 'ringing-out')
const isInCall     = computed(() => callStore.callState === 'in-call')
const visible      = computed(() => isRingingOut.value || isInCall.value)
const peerName     = computed(() => callStore.callerName || 'Peer')
</script>

<template>
  <Teleport to="body">
    <!-- Hidden audio element — always in DOM so the stream can be attached -->
    <audio ref="remoteAudioEl" id="remoteAudio" autoplay playsinline></audio>

    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="opacity-0 translate-y-full"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-full"
    >
      <div
        v-if="visible"
        class="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      >
        <div
          class="pointer-events-auto flex items-center gap-3 sm:gap-4
                 bg-slate-900/95 backdrop-blur-md text-white
                 px-4 sm:px-5 py-3 rounded-2xl shadow-2xl border border-slate-700
                 w-full max-w-sm sm:max-w-md"
        >
          <!-- Status dot + name + duration -->
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :class="isInCall ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'"
            ></div>
            <div class="min-w-0">
              <p class="text-xs text-slate-400 leading-none mb-0.5">
                {{ isInCall ? 'In call with' : 'Calling…' }}
              </p>
              <p class="font-semibold text-sm truncate">{{ peerName }}</p>
            </div>
            <span v-if="isInCall" class="text-sm font-mono text-emerald-400 flex-shrink-0 ml-auto mr-2">
              {{ callStore.callDuration }}
            </span>
          </div>

          <!-- Controls -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Screen share toggle (only while in call) -->
            <button
              v-if="isInCall"
              @click="callStore.isSharingScreen ? stopScreenShare() : startScreenShare()"
              :title="callStore.isSharingScreen ? 'Stop sharing' : 'Share screen'"
              class="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              :class="callStore.isSharingScreen
                ? 'bg-indigo-500/80 text-white hover:bg-indigo-600'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6v2H8v2h8v-2h-2v-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/>
              </svg>
            </button>

            <!-- Mute (only while in call) -->
            <button
              v-if="isInCall"
              @click="toggleMute"
              :title="callStore.isMuted ? 'Unmute' : 'Mute'"
              class="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              :class="callStore.isMuted
                ? 'bg-red-500/30 text-red-400 hover:bg-red-500/50'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <template v-if="callStore.isMuted">
                  <!-- mic-off -->
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                </template>
                <template v-else>
                  <!-- mic-on -->
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </template>
              </svg>
            </button>

            <!-- End / Cancel -->
            <button
              @click="isInCall ? endCall() : cancelCall()"
              :title="isInCall ? 'End call' : 'Cancel call'"
              class="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700
                     flex items-center justify-center transition-colors"
            >
              <!-- phone-hang-up icon -->
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.68.28-.28 0-.53-.11-.72-.29L.29 13.08C.11 12.9 0 12.65 0 12.37c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.19.19-.44.29-.72.29-.25 0-.5-.1-.68-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
