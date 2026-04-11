# Audio Call Flow

## Summary

Local Bytes implements browser-to-browser audio calls entirely over the local network using WebRTC — no third-party call server, no PSTN, no internet required after the initial peer discovery.

**How it works in plain terms:**

When you click the call button, your browser asks for microphone permission and sends a lightweight text signal to the other person over the same data channel already used for chat. The other person's browser plays a ringtone and shows an Accept / Decline card. If they accept, their browser also requests microphone permission and signals back. At that point both browsers negotiate a direct WebRTC audio stream peer-to-peer — the audio never leaves your local network. A live call timer, mute button, and hang-up button appear for both parties for the duration of the call.

Declining, cancelling, or hanging up immediately stops all audio on both sides and tears down the media connection. If the callee never answers, the call auto-cancels after 45 seconds.

**Key properties:**
- Fully peer-to-peer — audio travels directly between the two devices, not through any server
- Works with the internet turned off once both peers are on the same Wi-Fi
- End-to-end encrypted via WebRTC DTLS
- Two separate ringtones: `caller.mp3` for the person placing the call, `ringtone.mp3` for the person receiving it
- Mute and hang-up controls visible to both parties throughout the call

## State Machine

```
idle ──→ ringing-out  (we placed the call, waiting for callee to answer)
     ──→ ringing-in   (someone is calling us, waiting for our response)
         └──→ in-call (call accepted by both sides, audio streaming)
         └──→ idle    (call rejected / cancelled / timed out)
```

## Signalling Protocol

Call control messages are sent over the existing **DataChannel** (the same connection used for chat and file transfer). The actual audio uses a separate **WebRTC MediaConnection** initiated by PeerJS.

```
Caller                                    Callee
──────                                    ──────

[User clicks 📞 call button]

1. getUserMedia({ audio: true })
   → acquire microphone stream

2. DataChannel ──── call-request ────────→ callState = 'ringing-in'
   callState = 'ringing-out'               callerName stored
                                           IncomingCall card appears
                                           ringtone starts looping

                                          [User clicks Accept]

                                       3. getUserMedia({ audio: true })
                                          → acquire microphone stream

                        ←──── call-accept ── DataChannel
                                          callState stays 'ringing-in'
                                          (waiting for WebRTC offer)

4. peer.call(peerId, micStream)
   → sends WebRTC offer                ──────────────────────────────→
                                          peer.on('call') fires
                                       5. call.answer(micStream)
                                          → sends WebRTC answer

6. call.on('stream') fires             6. call.on('stream') fires
   remoteStream attached to               remoteStream attached to
   <audio> element                        <audio> element
   callState = 'in-call'                  callState = 'in-call'
   CallBar appears + timer starts         CallBar appears + timer starts
```

## Rejection / Cancellation

```
Caller                                    Callee
──────                                    ──────

[Caller cancels while ringing]
DataChannel ──── call-cancel ───────────→ stopRingtone()
_cleanupCall()                            _cleanupCall('Caller cancelled')

                                          [Callee declines]
                        ←──── call-reject ── DataChannel
_cleanupCall('Call declined')             _cleanupCall()
stopRingtone()

[Either party hangs up during call]
DataChannel ──── call-end ──────────────→ _cleanupCall('Call ended by peer')
_cleanupCall('Call ended')
```

## Audio Files

| File | Who hears it | When |
|---|---|---|
| `public/caller.mp3` | Caller | Loops while `ringing-out` (waiting for callee to answer) |
| `public/ringtone.mp3` | Callee | Loops while `ringing-in` (incoming call ringing) |
| `public/ring.mp3` | Both | One-shot ding on new message / peer connection |

All three files stop immediately when the call is accepted, declined, or cancelled via `stopAllCallAudio()`.

Replace `caller.mp3` and `ringtone.mp3` with your own audio files — the filenames are the only contract.

## Auto-cancel

Outgoing calls automatically cancel after **45 seconds** if the callee does not respond.

## Timing Edge Case — MediaConnection vs Accept

`peer.on('call')` (the WebRTC offer from the caller) can arrive **before or after** the callee
clicks Accept:

- **Offer arrives after Accept** — `acceptCall()` has already stored `localStream`.
  `peer.on('call')` answers immediately.
- **Offer arrives before Accept** — stored in `pendingMediaConn`.
  `acceptCall()` finds it and calls `pendingMediaConn.answer(stream)`.

## Components

| Component | When visible |
|---|---|
| `IncomingCall.vue` | `callState === 'ringing-in'` |
| `CallBar.vue` | `callState === 'ringing-out'` or `'in-call'` |
| 📞 button in `ChatPanel.vue` | `isConnected && callState === 'idle'` |

## Key Files

| File | Role |
|---|---|
| `src/stores/call.js` | Reactive state: callState, streams, mute, timer |
| `src/composables/usePeer.js` | All call logic: startCall, acceptCall, rejectCall, endCall, toggleMute, DataChannel handlers, peer.on('call') |
| `src/composables/useAudio.js` | Notification ding + looping ringtone |
| `src/components/IncomingCall.vue` | Incoming call card (Accept / Decline) |
| `src/components/CallBar.vue` | Active call pill (mute, hang up, duration timer) |
