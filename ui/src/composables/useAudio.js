// Module-level so the primed state survives across component re-renders
let audioReady = false

function getEl() {
  return document.getElementById('notificationSound')
}

export function useAudio() {
  function primeAudio() {
    if (audioReady) return
    const el = getEl()
    if (!el) return
    el.volume = 0
    el.play()
      .then(() => {
        el.pause()
        el.currentTime = 0
        el.volume = 1
        audioReady = true
      })
      .catch(() => {
        // Still blocked by autoplay policy — will retry on next user gesture
      })
  }

  function playNotification() {
    const el = getEl()
    if (!el) return
    if (!audioReady) primeAudio()
    el.currentTime = 0
    el.volume = 1
    el.play().catch(() => {
      if (!audioReady) primeAudio()
    })
  }

  return { primeAudio, playNotification }
}
