import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Placeholder store for the upcoming audio call + screen share features.
 * State machine: idle → ringing → in-call → ended
 */
export const useCallStore = defineStore('call', () => {
  const callState    = ref('idle')      // 'idle' | 'ringing' | 'in-call' | 'ended'
  const localStream  = ref(null)        // MediaStream (mic / camera)
  const remoteStream = ref(null)        // MediaStream from remote peer
  const screenStream = ref(null)        // MediaStream from getDisplayMedia
  const isMuted      = ref(false)
  const isCameraOff  = ref(false)
  const isSharingScreen = ref(false)

  function reset() {
    callState.value     = 'idle'
    localStream.value   = null
    remoteStream.value  = null
    screenStream.value  = null
    isMuted.value       = false
    isCameraOff.value   = false
    isSharingScreen.value = false
  }

  return {
    callState, localStream, remoteStream, screenStream,
    isMuted, isCameraOff, isSharingScreen,
    reset,
  }
})
