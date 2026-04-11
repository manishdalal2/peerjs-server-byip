import Peer from 'peerjs'
import { usePeersStore }   from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { useCallStore }    from '../stores/call.js'
import { useAudio }        from './useAudio.js'

// ── Module-level singletons ───────────────────────────────────────────────────
let peerInstance    = null
let connInstance    = null   // DataConnection (chat / file / call-signalling)
let callMediaConn   = null   // MediaConnection (live audio)
let pendingMediaConn = null  // MediaConnection received before user clicked Accept
let callTimeoutId   = null   // auto-cancel if callee never answers

const CHUNK_SIZE = 16 * 1024
const BUF_HIGH   = 1 * 1024 * 1024
const BUF_LOW    = 256 * 1024
const RING_TIMEOUT_MS = 45_000   // auto-cancel outgoing call after 45 s

export function usePeer() {
  const peersStore = usePeersStore()
  const msgsStore  = useMessagesStore()
  const callStore  = useCallStore()
  const { primeAudio, playNotification, startRingtone, stopRingtone, startCallerTone, stopAllCallAudio } = useAudio()

  // ── Helpers ───────────────────────────────────────────────────────────────
  function sendSignal(payload) {
    if (connInstance?.open) connInstance.send(JSON.stringify(payload))
  }

  async function getMic() {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }

  // ── Attach remote stream to the hidden <audio> element ────────────────────
  function attachRemoteStream(stream) {
    callStore.remoteStream = stream
    const el = document.getElementById('remoteAudio')
    if (el) { el.srcObject = stream; el.play().catch(() => {}) }
  }

  // ── Wire a MediaConnection (both outgoing and incoming) ───────────────────
  function wireMediaConn(mc, localStream) {
    callMediaConn = mc

    mc.on('stream', remoteStream => {
      attachRemoteStream(remoteStream)
      callStore.callState = 'in-call'
      callStore.startTimer()
      peersStore.setStatus(`In call with ${peersStore.connectedLabel}`)
    })

    mc.on('close', () => {
      _cleanupCall('Call ended')
    })

    mc.on('error', err => {
      _cleanupCall('Call error: ' + (err.message || err))
    })
  }

  function _cleanupCall(statusMsg = 'Call ended') {
    callMediaConn?.close()
    callMediaConn    = null
    pendingMediaConn = null
    clearTimeout(callTimeoutId)
    stopAllCallAudio()   // stops both ringtone.mp3 and caller.mp3
    callStore.reset()
    peersStore.setStatus(statusMsg)
  }

  // ── Outgoing call — step 1: signal the callee, get mic ────────────────────
  async function startCall() {
    if (!connInstance?.open) {
      peersStore.setStatus('Connect to a peer before calling')
      return
    }
    if (callStore.callState !== 'idle') return

    try {
      const stream = await getMic()
      callStore.localStream = stream
      callStore.callState   = 'ringing-out'

      sendSignal({
        type:       'call-request',
        callerName: peersStore.displayName || peersStore.myAlias || peersStore.myPeerId?.slice(0, 8),
      })

      peersStore.setStatus(`Calling ${peersStore.connectedLabel}…`)
      startCallerTone()   // caller hears caller.mp3 while waiting

      // Auto-cancel if unanswered
      callTimeoutId = setTimeout(() => cancelCall(), RING_TIMEOUT_MS)
    } catch (err) {
      peersStore.setStatus('Microphone access denied: ' + (err.message || err))
      callStore.reset()
    }
  }

  // ── Outgoing call — step 3: callee accepted, initiate WebRTC media ────────
  function _onCallAccepted() {
    clearTimeout(callTimeoutId)
    stopAllCallAudio()   // stop caller.mp3 — call is connecting
    // peer.call() triggers peer.on('call') on the callee
    const mc = peerInstance.call(connInstance.peer, callStore.localStream)
    wireMediaConn(mc, callStore.localStream)
  }

  // ── Cancel outgoing call while it's ringing ───────────────────────────────
  function cancelCall() {
    if (callStore.callState !== 'ringing-out') return
    sendSignal({ type: 'call-cancel' })
    _cleanupCall('Call cancelled')
  }

  // ── Callee accepts the incoming call ─────────────────────────────────────
  async function acceptCall() {
    if (callStore.callState !== 'ringing-in') return
    stopAllCallAudio()

    try {
      const stream = await getMic()
      callStore.localStream = stream

      // Tell caller to initiate the WebRTC media connection
      sendSignal({ type: 'call-accept' })

      // peer.on('call') may have already fired (pendingMediaConn) or will fire shortly
      if (pendingMediaConn) {
        pendingMediaConn.answer(stream)
        wireMediaConn(pendingMediaConn, stream)
        pendingMediaConn = null
      }
      // If pendingMediaConn is still null, peer.on('call') will arrive after the
      // caller processes 'call-accept' — handled in the init() peer.on('call') handler
    } catch (err) {
      peersStore.setStatus('Microphone access denied: ' + (err.message || err))
      rejectCall()
    }
  }

  // ── Callee rejects the incoming call ─────────────────────────────────────
  function rejectCall() {
    if (callStore.callState !== 'ringing-in') return
    sendSignal({ type: 'call-reject' })
    _cleanupCall('Call declined')
  }

  // ── Either party ends an active call ─────────────────────────────────────
  function endCall() {
    sendSignal({ type: 'call-end' })
    _cleanupCall('Call ended')
  }

  // ── Toggle microphone mute ────────────────────────────────────────────────
  function toggleMute() {
    const track = callStore.localStream?.getAudioTracks()[0]
    if (!track) return
    track.enabled     = !track.enabled
    callStore.isMuted = !track.enabled
  }

  // ── Wire a DataConnection ─────────────────────────────────────────────────
  function wireConn(c) {
    connInstance = c

    c.on('open', () => {
      const p = peersStore.availPeers.get(c.peer)
      peersStore.setPeerConnected(c.peer, p?.displayName ?? null, p?.alias ?? null)
      playNotification()
    })

    c.on('data', data => {
      // Binary = file chunk
      if (data instanceof ArrayBuffer) { msgsStore.onChunk(data); return }

      if (typeof data !== 'string') return
      let msg
      try { msg = JSON.parse(data) } catch { return }

      switch (msg.type) {
        // ── Chat / file ────────────────────────────────────────────────────
        case 'chat':
          msgsStore.addRemoteText(msg.text)
          playNotification()
          break
        case 'file-start':
          msgsStore.onFileStart(msg)
          playNotification()
          break
        case 'file-end':
          msgsStore.onFileEnd()
          break

        // ── Call signalling ────────────────────────────────────────────────
        case 'call-request':
          if (callStore.callState !== 'idle') {
            // Already in a call — auto-reject
            sendSignal({ type: 'call-reject' })
            break
          }
          callStore.callState  = 'ringing-in'
          callStore.callerName = msg.callerName || peersStore.connectedLabel || 'Someone'
          peersStore.setStatus(`Incoming call from ${callStore.callerName}`)
          startRingtone()
          break

        case 'call-accept':
          if (callStore.callState === 'ringing-out') _onCallAccepted()
          break

        case 'call-reject':
          if (callStore.callState === 'ringing-out') _cleanupCall('Call declined')
          break

        case 'call-cancel':
          if (callStore.callState === 'ringing-in') {
            stopRingtone()
            _cleanupCall('Caller cancelled')
          }
          break

        case 'call-end':
          if (callStore.callState === 'in-call') _cleanupCall('Call ended by peer')
          break
      }
    })

    c.on('close', () => {
      if (callStore.callState !== 'idle') _cleanupCall('Peer disconnected')
      peersStore.setPeerDisconnected()
      peersStore.setStatus('Peer disconnected')
    })

    c.on('error', err => peersStore.setStatus('Connection error: ' + err))
  }

  // ── IP-group WebSocket interception ───────────────────────────────────────
  function listenForIPGroupEvents() {
    if (!peerInstance?.socket?._socket) { setTimeout(listenForIPGroupEvents, 400); return }
    const ws = peerInstance.socket._socket, orig = ws.onmessage
    ws.onmessage = function (evt) {
      try { peersStore.handleIPGroupMessage(JSON.parse(evt.data)) } catch {}
      if (orig) orig.call(this, evt)
    }
  }

  // ── Profile update ────────────────────────────────────────────────────────
  function sendProfileUpdate() {
    const ws = peerInstance?.socket?._socket ?? null
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      peersStore.setStatus('Profile will sync once connected'); return
    }
    ws.send(JSON.stringify({
      type: 'SET-PEER-PROFILE',
      payload: { name: peersStore.displayName, pin: peersStore.pin },
    }))
    localStorage.setItem('peerProfileName', peersStore.displayName)
    localStorage.setItem('peerProfilePin',  peersStore.pin)
    peersStore.myAlias = peersStore.displayName || peersStore.myAlias
    peersStore.setStatus('Profile updated')
  }

  // ── Connect to a peer by ID ───────────────────────────────────────────────
  function connectTo(peerId, alias, hasPin) {
    if (peerId === peersStore.myPeerId) { peersStore.setStatus('Cannot connect to yourself!'); return }
    if (connInstance) connInstance.close()
    primeAudio()
    const pin = hasPin ? window.prompt(`Enter PIN for ${alias || peerId}`) : ''
    if (hasPin && pin === null) { peersStore.setStatus('Connection cancelled'); return }
    peersStore.setStatus(`Connecting to ${alias || peerId}…`)
    wireConn(peerInstance.connect(peerId, {
      reliable: true, serialization: 'raw',
      metadata: pin ? { pin: pin.trim() } : undefined,
    }))
  }

  // ── Send text ─────────────────────────────────────────────────────────────
  function sendText(text) {
    if (!connInstance?.open) return
    connInstance.send(JSON.stringify({ type: 'chat', text }))
    msgsStore.addLocalText(text)
  }

  // ── Send file with backpressure ───────────────────────────────────────────
  async function sendFile(file) {
    if (!connInstance?.open) return
    const msgId = msgsStore.addLocalFile(file.name, file.size)
    connInstance.send(JSON.stringify({ type: 'file-start', name: file.name, size: file.size, fileType: file.type }))
    const dc = connInstance._dc ?? null
    if (dc) dc.bufferedAmountLowThreshold = BUF_LOW
    let offset = 0
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size)
      const buf = await file.slice(offset, end).arrayBuffer()
      if (dc && dc.bufferedAmount > BUF_HIGH) {
        await new Promise(r => dc.addEventListener('bufferedamountlow', r, { once: true }))
      }
      connInstance.send(buf)
      offset = end
      msgsStore.updateFileProgress(msgId, Math.round((offset / file.size) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
    connInstance.send(JSON.stringify({ type: 'file-end' }))
    msgsStore.finalizeFile(msgId, '✓ Sent')
    peersStore.setStatus(`Sent: ${file.name}`)
  }

  // ── PeerJS bootstrap ──────────────────────────────────────────────────────
  function init() {
    if (peerInstance) return  // guard HMR double-init

    const host   = window.location.hostname
    const port   = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80)
    const secure = window.location.protocol === 'https:'

    peerInstance = new Peer({ host, port, path: '/', key: 'peerjs', secure,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } })

    peerInstance.on('open', id => {
      peersStore.myPeerId = id; peersStore.serverConnected = true
      peersStore.setStatus('Connected — discovering peers…')
      peersStore.loadPeers(); listenForIPGroupEvents()
      setTimeout(sendProfileUpdate, 300); primeAudio()
    })

    peerInstance.on('connection', c => { primeAudio(); wireConn(c); peersStore.setStatus(`Incoming connection from ${c.peer}`) })

    // ── Incoming WebRTC media connection (caller called peer.call()) ──────────
    peerInstance.on('call', mc => {
      pendingMediaConn = mc  // store it; will be answered in acceptCall() if not already

      // If user already clicked Accept and got their mic, answer immediately
      if (callStore.callState === 'in-call' && callStore.localStream) {
        mc.answer(callStore.localStream)
        wireMediaConn(mc, callStore.localStream)
        pendingMediaConn = null
        return
      }

      // Defensive: if we somehow get a media conn without ringing-in state, close it
      if (callStore.callState === 'idle') { mc.close(); pendingMediaConn = null; return }

      // callState === 'ringing-in' and user hasn't clicked Accept yet
      // pendingMediaConn stays set — acceptCall() will answer it
      mc.on('close', () => { if (callStore.callState !== 'idle') _cleanupCall('Call ended') })
      mc.on('error', () => { _cleanupCall('Call error') })
    })

    peerInstance.on('disconnected', () => {
      peersStore.serverConnected = false
      peersStore.setStatus('Disconnected — reconnecting…')
      peerInstance.reconnect()
    })

    peerInstance.on('close', () => { peersStore.serverConnected = false; peersStore.setPeerDisconnected() })
    peerInstance.on('error', err => { peersStore.serverConnected = false; peersStore.setStatus('Error: ' + (err.type || err)) })
  }

  function destroy() {
    _cleanupCall()
    connInstance?.close(); peerInstance?.destroy()
    peerInstance = null; connInstance = null
  }

  return {
    init, destroy,
    connectTo, sendText, sendFile, sendProfileUpdate,
    startCall, cancelCall, acceptCall, rejectCall, endCall, toggleMute,
  }
}
