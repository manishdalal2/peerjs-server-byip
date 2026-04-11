// Module-level so primed state is shared across all usages
let audioReady = false

function getNotif()    { return document.getElementById('notificationSound') }
function getRingtone() { return document.getElementById('ringtoneSound') }   // callee hears this
function getCaller()   { return document.getElementById('callerSound') }     // caller hears this

function _play(el)  { if (!el) return; el.currentTime = 0; el.play().catch(() => {}) }
function _stop(el)  { if (!el) return; el.pause(); el.currentTime = 0 }

export function useAudio() {
  // ── Unlock autoplay policy ────────────────────────────────────────────────
  function primeAudio() {
    if (audioReady) return
    const el = getNotif()
    if (!el) return
    el.volume = 0
    el.play()
      .then(() => { el.pause(); el.currentTime = 0; el.volume = 1; audioReady = true })
      .catch(() => {})
  }

  // ── One-shot message ding ─────────────────────────────────────────────────
  function playNotification() {
    const el = getNotif()
    if (!el) return
    if (!audioReady) primeAudio()
    el.currentTime = 0
    el.volume = 1
    el.play().catch(() => { if (!audioReady) primeAudio() })
  }

  // ── Callee ringtone — loops while ringing-in ──────────────────────────────
  function startRingtone() { _play(getRingtone()) }
  function stopRingtone()  { _stop(getRingtone()) }

  // ── Caller ringback tone — loops while ringing-out ────────────────────────
  function startCallerTone() { _play(getCaller()) }
  function stopCallerTone()  { _stop(getCaller()) }

  // ── Stop all call audio at once ───────────────────────────────────────────
  function stopAllCallAudio() { stopRingtone(); stopCallerTone() }

  return {
    primeAudio, playNotification,
    startRingtone, stopRingtone,
    startCallerTone, stopCallerTone,
    stopAllCallAudio,
  }
}
