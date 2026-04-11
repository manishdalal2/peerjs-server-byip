import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Call state machine
 *   idle → ringing-out  (we placed the call, waiting for answer)
 *        → ringing-in   (someone is calling us)
 *        → in-call      (both sides connected)
 *        → idle         (call ended / rejected / cancelled)
 */
export const useCallStore = defineStore('call', () => {
  const callState    = ref('idle')   // 'idle' | 'ringing-out' | 'ringing-in' | 'in-call'
  const localStream  = ref(null)     // our microphone MediaStream
  const remoteStream = ref(null)     // remote peer's MediaStream
  const isMuted      = ref(false)
  const callerName   = ref('')       // display name of the peer calling us
  const callSeconds  = ref(0)

  let _timer = null

  const callDuration = computed(() => {
    const m = String(Math.floor(callSeconds.value / 60)).padStart(2, '0')
    const s = String(callSeconds.value % 60).padStart(2, '0')
    return `${m}:${s}`
  })

  function startTimer() {
    callSeconds.value = 0
    _timer = setInterval(() => { callSeconds.value++ }, 1000)
  }

  function stopTimer() {
    if (_timer) { clearInterval(_timer); _timer = null }
  }

  function reset() {
    // Stop all local tracks before clearing the ref
    localStream.value?.getTracks().forEach(t => t.stop())
    stopTimer()
    callState.value    = 'idle'
    localStream.value  = null
    remoteStream.value = null
    isMuted.value      = false
    callerName.value   = ''
    callSeconds.value  = 0
  }

  return {
    callState, localStream, remoteStream, isMuted, callerName,
    callSeconds, callDuration,
    startTimer, stopTimer, reset,
  }
})
