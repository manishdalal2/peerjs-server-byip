// ── Web Audio API tone engine ─────────────────────────────────────────────────
// No MP3 files needed — all sounds are synthesised in the browser.
let _ctx = null
let ringtoneTimer  = null
let callerTimer    = null

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// Play a sine-wave burst: freq Hz, starting at AudioContext time t0, lasting `dur` seconds
function tone(freq, t0, dur, vol = 0.25) {
  const c   = ctx()
  const osc = c.createOscillator()
  const g   = c.createGain()
  osc.type           = 'sine'
  osc.frequency.value = freq
  // Fade in/out to avoid clicks
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008)
  g.gain.setValueAtTime(vol, t0 + dur - 0.015)
  g.gain.linearRampToValueAtTime(0, t0 + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export function useAudio() {
  // ── Unlock AudioContext (must be called on first user gesture) ────────────
  function primeAudio() {
    ctx()   // creates + resumes the AudioContext
  }

  // ── One-shot notification ding ────────────────────────────────────────────
  // Descending two-note chime: C6 → G5
  function playNotification() {
    const c   = ctx()
    const now = c.currentTime
    tone(1047, now,        0.12, 0.28)   // C6
    tone(784,  now + 0.09, 0.22, 0.28)   // G5
  }

  // ── Callee ringtone — "RING RING" cadence ────────────────────────────────
  // Two short dual-tone bursts (440 Hz + 480 Hz), then a long pause, repeating.
  // 440+480 Hz is the standard PSTN ring frequency pair.
  function _ringCycle() {
    const c   = ctx()
    const now = c.currentTime
    // Burst 1
    tone(440, now,       0.4, 0.30)
    tone(480, now,       0.4, 0.30)
    // Burst 2 (0.6 s after burst 1)
    tone(440, now + 0.6, 0.4, 0.30)
    tone(480, now + 0.6, 0.4, 0.30)
    // Next cycle after 3.5 s (ring ring … pause … ring ring …)
    ringtoneTimer = setTimeout(_ringCycle, 3500)
  }

  function startRingtone() {
    stopRingtone()
    _ringCycle()
  }
  function stopRingtone() {
    clearTimeout(ringtoneTimer); ringtoneTimer = null
  }

  // ── Caller ringback tone ──────────────────────────────────────────────────
  // Single softer 2-second dual-tone burst, then 4 s silence — calmer than
  // the ringtone so caller knows they're waiting, not being called.
  function _callerCycle() {
    const c   = ctx()
    const now = c.currentTime
    tone(440, now, 2.0, 0.14)
    tone(480, now, 2.0, 0.14)
    // Next cycle after 6 s
    callerTimer = setTimeout(_callerCycle, 6000)
  }

  function startCallerTone() {
    stopCallerTone()
    _callerCycle()
  }
  function stopCallerTone() {
    clearTimeout(callerTimer); callerTimer = null
  }

  // ── Stop all call audio at once ───────────────────────────────────────────
  function stopAllCallAudio() { stopRingtone(); stopCallerTone() }

  return {
    primeAudio, playNotification,
    startRingtone, stopRingtone,
    startCallerTone, stopCallerTone,
    stopAllCallAudio,
  }
}
