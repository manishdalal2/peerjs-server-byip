<script setup>
import { computed, watch } from 'vue'
import { useCallStore } from '../stores/call.js'
import { usePeer }      from '../composables/usePeer.js'
import { useAudio }     from '../composables/useAudio.js'

const callStore = useCallStore()
const { acceptCall, rejectCall } = usePeer()
const { stopRingtone } = useAudio()

const visible = computed(() => callStore.callState === 'ringing-in')

// Safety net: stop ringtone when this overlay disappears for any reason
watch(visible, v => { if (!v) stopRingtone() })
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="opacity-0 translate-y-8"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div
        v-if="visible"
        class="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:left-auto z-50
               w-full sm:w-80"
        role="alertdialog"
        aria-live="assertive"
        aria-label="Incoming call"
      >
        <div class="bg-slate-900 sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-700">

          <!-- Pulsing ring animation strip -->
          <div class="h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400
                      animate-pulse"></div>

          <div class="px-5 py-5">
            <!-- Caller avatar + info -->
            <div class="flex items-center gap-4 mb-5">
              <div class="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600
                          flex items-center justify-center text-white text-2xl flex-shrink-0
                          shadow-lg animate-pulse">
                📞
              </div>
              <div>
                <p class="text-xs text-slate-400 font-medium uppercase tracking-wider mb-0.5">
                  Incoming audio call
                </p>
                <p class="text-white font-bold text-lg leading-tight truncate max-w-[160px]">
                  {{ callStore.callerName }}
                </p>
              </div>
            </div>

            <!-- Accept / Reject -->
            <div class="flex gap-3">
              <button
                @click="rejectCall"
                class="flex-1 flex items-center justify-center gap-2
                       bg-red-500 hover:bg-red-600 active:bg-red-700
                       text-white font-bold py-3 rounded-xl transition-colors"
                aria-label="Decline call"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                </svg>
                Decline
              </button>
              <button
                @click="acceptCall"
                class="flex-1 flex items-center justify-center gap-2
                       bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                       text-white font-bold py-3 rounded-xl transition-colors"
                aria-label="Accept call"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                </svg>
                Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
