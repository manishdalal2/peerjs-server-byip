import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Call state machine
 *   idle → ringing-out  (we placed the call, waiting for answer)
 *        → ringing-in   (someone is calling us)
 *        → in-call      (both sides connected)
 *        → idle         (call ended / rejected / cancelled)
 *
 * Screen share is independent of call state — either peer can share at any time
 * while a DataConnection is open.
 */
export const useCallStore = defineStore('call', () => {
  // ── Audio call ────────────────────────────────────────────────────────────
  const callState    = ref('idle')   // 'idle' | 'ringing-out' | 'ringing-in' | 'in-call'
  const localStream  = ref(null)     // our microphone MediaStream
  const remoteStream = ref(null)     // remote peer's audio MediaStream
  const isMuted      = ref(false)
  const callerName   = ref('')
  const callSeconds  = ref(0)

  const callDuration = computed(() => {
    const m = String(Math.floor(callSeconds.value / 60)).padStart(2, '0')
    const s = String(callSeconds.value % 60).padStart(2, '0')
    return `${m}:${s}`
  })

  let _timer = null
  function startTimer() { callSeconds.value = 0; _timer = setInterval(() => { callSeconds.value++ }, 1000) }
  function stopTimer()  { if (_timer) { clearInterval(_timer); _timer = null } }

  function reset() {
    localStream.value?.getTracks().forEach(t => t.stop())
    stopTimer()
    callState.value = 'idle'; localStream.value = null; remoteStream.value = null
    isMuted.value = false; callerName.value = ''; callSeconds.value = 0
  }

  // ── Screen share ──────────────────────────────────────────────────────────
  const screenStream       = ref(null)    // our getDisplayMedia stream (sharer side)
  const remoteScreenStream = ref(null)    // remote peer's screen stream (viewer side)
  const isSharingScreen    = ref(false)
  const isViewingScreen    = ref(false)

  function resetScreen() {
    screenStream.value?.getTracks().forEach(t => t.stop())
    screenStream.value       = null
    remoteScreenStream.value = null
    isSharingScreen.value    = false
    isViewingScreen.value    = false
  }

  return {
    // audio call
    callState, localStream, remoteStream, isMuted, callerName,
    callSeconds, callDuration,
    startTimer, stopTimer, reset,
    // screen share
    screenStream, remoteScreenStream, isSharingScreen, isViewingScreen,
    resetScreen,
  }
})
