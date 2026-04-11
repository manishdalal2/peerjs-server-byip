import Peer from 'peerjs'
import { usePeersStore }    from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { useCallStore }     from '../stores/call.js'
import { useAudio }         from './useAudio.js'

// ── Module-level singletons ───────────────────────────────────────────────────
let peerInstance     = null
let connInstance     = null   // DataConnection  (chat / file / call-signalling)
let callMediaConn    = null   // MediaConnection (audio call)
let screenMediaConn  = null   // MediaConnection (screen share)
let pendingMediaConn = null   // incoming audio call waiting for user to Accept
let callTimeoutId    = null

const CHUNK_SIZE      = 16 * 1024
const BUF_HIGH        = 1 * 1024 * 1024
const BUF_LOW         = 256 * 1024
const RING_TIMEOUT_MS = 45_000

export function usePeer() {
  const peersStore = usePeersStore()
  const msgsStore  = useMessagesStore()
  const callStore  = useCallStore()
  const { primeAudio, playNotification, startRingtone, startCallerTone, stopAllCallAudio } = useAudio()

  // ── Helpers ───────────────────────────────────────────────────────────────
  function sendSignal(payload) {
    if (connInstance?.open) connInstance.send(JSON.stringify(payload))
  }

  async function getMic() {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }

  function attachRemoteAudio(stream) {
    callStore.remoteStream = stream
    const el = document.getElementById('remoteAudio')
    if (el) { el.srcObject = stream; el.play().catch(() => {}) }
  }

  // ── Wire audio MediaConnection ────────────────────────────────────────────
  function wireAudioConn(mc, localStream) {
    callMediaConn = mc

    mc.on('stream', remoteStream => {
      attachRemoteAudio(remoteStream)
      callStore.callState = 'in-call'
      callStore.startTimer()
      peersStore.setStatus(`In call with ${peersStore.connectedLabel}`)
    })

    mc.on('close', () => _cleanupCall('Call ended'))
    mc.on('error', () => _cleanupCall('Call error'))
  }

  function _cleanupCall(msg = 'Call ended') {
    callMediaConn?.close();  callMediaConn    = null
    pendingMediaConn = null
    clearTimeout(callTimeoutId)
    stopAllCallAudio()
    callStore.reset()
    peersStore.setStatus(msg)
  }

  // ── Wire screen-share MediaConnection (receiver side) ─────────────────────
  function wireScreenRecv(mc) {
    screenMediaConn = mc

    mc.on('stream', stream => {
      callStore.remoteScreenStream = stream
      callStore.isViewingScreen    = true
      peersStore.setStatus(`Viewing ${peersStore.connectedLabel}'s screen`)
    })

    mc.on('close', () => {
      callStore.resetScreen()
      peersStore.setStatus('Screen share ended')
    })

    mc.on('error', () => {
      callStore.resetScreen()
    })
  }

  // ── Audio call — outgoing ─────────────────────────────────────────────────
  async function startCall() {
    if (!connInstance?.open) { peersStore.setStatus('Connect to a peer before calling'); return }
    if (callStore.callState !== 'idle') return
    try {
      const stream = await getMic()
      callStore.localStream = stream
      callStore.callState   = 'ringing-out'
      sendSignal({ type: 'call-request', callerName: peersStore.displayName || peersStore.myAlias })
      peersStore.setStatus(`Calling ${peersStore.connectedLabel}…`)
      startCallerTone()
      callTimeoutId = setTimeout(() => cancelCall(), RING_TIMEOUT_MS)
    } catch (err) {
      peersStore.setStatus('Microphone access denied: ' + (err.message || err))
      callStore.reset()
    }
  }

  function _onCallAccepted() {
    clearTimeout(callTimeoutId)
    stopAllCallAudio()
    wireAudioConn(peerInstance.call(connInstance.peer, callStore.localStream), callStore.localStream)
  }

  function cancelCall() {
    if (callStore.callState !== 'ringing-out') return
    sendSignal({ type: 'call-cancel' })
    _cleanupCall('Call cancelled')
  }

  async function acceptCall() {
    if (callStore.callState !== 'ringing-in') return
    stopAllCallAudio()
    try {
      const stream = await getMic()
      callStore.localStream = stream
      sendSignal({ type: 'call-accept' })
      if (pendingMediaConn) {
        pendingMediaConn.answer(stream)
        wireAudioConn(pendingMediaConn, stream)
        pendingMediaConn = null
      }
    } catch (err) {
      peersStore.setStatus('Microphone access denied: ' + (err.message || err))
      rejectCall()
    }
  }

  function rejectCall() {
    if (callStore.callState !== 'ringing-in') return
    sendSignal({ type: 'call-reject' })
    _cleanupCall('Call declined')
  }

  function endCall() {
    sendSignal({ type: 'call-end' })
    _cleanupCall('Call ended')
  }

  function toggleMute() {
    const track = callStore.localStream?.getAudioTracks()[0]
    if (!track) return
    track.enabled  = !track.enabled
    callStore.isMuted = !track.enabled
  }

  // ── Screen share — start (sharer side) ───────────────────────────────────
  async function startScreenShare() {
    if (!connInstance?.open) { peersStore.setStatus('Connect to a peer before sharing'); return }
    if (callStore.isSharingScreen) return

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      callStore.screenStream    = stream
      callStore.isSharingScreen = true

      // Signal receiver so their UI can prepare
      sendSignal({ type: 'screen-share-start', sharerName: peersStore.displayName || peersStore.myAlias })

      // Call peer with screen stream — metadata.type = 'screen' distinguishes from audio
      screenMediaConn = peerInstance.call(connInstance.peer, stream, {
        metadata: { type: 'screen' },
      })

      screenMediaConn.on('close',  () => _cleanupScreenShare())
      screenMediaConn.on('error',  () => _cleanupScreenShare())

      // Handle the browser's native "Stop sharing" button
      stream.getVideoTracks()[0].onended = () => stopScreenShare()

      peersStore.setStatus('Sharing your screen…')
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        peersStore.setStatus('Screen share failed: ' + (err.message || err))
      }
      callStore.resetScreen()
    }
  }

  // ── Screen share — stop (sharer side) ────────────────────────────────────
  function stopScreenShare() {
    if (!callStore.isSharingScreen) return
    sendSignal({ type: 'screen-share-end' })
    _cleanupScreenShare()
  }

  function _cleanupScreenShare(msg = 'Screen share ended') {
    screenMediaConn?.close(); screenMediaConn = null
    callStore.resetScreen()
    peersStore.setStatus(msg)
  }

  // ── DataConnection ────────────────────────────────────────────────────────
  function wireConn(c) {
    connInstance = c

    c.on('open', () => {
      const p = peersStore.availPeers.get(c.peer)
      peersStore.setPeerConnected(c.peer, p?.displayName ?? null, p?.alias ?? null)
      playNotification()
    })

    c.on('data', data => {
      if (data instanceof ArrayBuffer) { msgsStore.onChunk(data); return }
      if (typeof data !== 'string') return
      let msg
      try { msg = JSON.parse(data) } catch { return }

      switch (msg.type) {
        // ── Chat / file ──────────────────────────────────────────────────
        case 'chat':
          msgsStore.addRemoteText(msg.text); playNotification(); break
        case 'file-start':
          msgsStore.onFileStart(msg); playNotification(); break
        case 'file-end':
          msgsStore.onFileEnd(); break

        // ── Audio call signalling ────────────────────────────────────────
        case 'call-request':
          if (callStore.callState !== 'idle') { sendSignal({ type: 'call-reject' }); break }
          callStore.callState  = 'ringing-in'
          callStore.callerName = msg.callerName || peersStore.connectedLabel || 'Someone'
          peersStore.setStatus(`Incoming call from ${callStore.callerName}`)
          startRingtone()
          break
        case 'call-accept':
          if (callStore.callState === 'ringing-out') _onCallAccepted(); break
        case 'call-reject':
          if (callStore.callState === 'ringing-out') _cleanupCall('Call declined'); break
        case 'call-cancel':
          if (callStore.callState === 'ringing-in') { stopAllCallAudio(); _cleanupCall('Caller cancelled') } break
        case 'call-end':
          if (callStore.callState === 'in-call') _cleanupCall('Call ended by peer'); break

        // ── Screen share signalling ──────────────────────────────────────
        case 'screen-share-start':
          // Receiver UI will react to isViewingScreen becoming true via peer.on('call')
          callStore.isViewingScreen = false  // reset; will be set true when stream arrives
          peersStore.setStatus(`${msg.sharerName || peersStore.connectedLabel} is sharing their screen…`)
          break
        case 'screen-share-end':
          if (callStore.isViewingScreen) {
            callStore.resetScreen()
            peersStore.setStatus('Screen share ended')
          }
          break
      }
    })

    c.on('close', () => {
      if (callStore.callState !== 'idle') _cleanupCall('Peer disconnected')
      if (callStore.isSharingScreen || callStore.isViewingScreen) _cleanupScreenShare('Peer disconnected')
      peersStore.setPeerDisconnected()
      peersStore.setStatus('Peer disconnected')
    })

    c.on('error', err => peersStore.setStatus('Connection error: ' + err))
  }

  // ── PeerJS bootstrap ──────────────────────────────────────────────────────
  function listenForIPGroupEvents() {
    if (!peerInstance?.socket?._socket) { setTimeout(listenForIPGroupEvents, 400); return }
    const ws = peerInstance.socket._socket, orig = ws.onmessage
    ws.onmessage = function (evt) {
      try { peersStore.handleIPGroupMessage(JSON.parse(evt.data)) } catch {}
      if (orig) orig.call(this, evt)
    }
  }

  function sendProfileUpdate() {
    const ws = peerInstance?.socket?._socket ?? null
    if (!ws || ws.readyState !== WebSocket.OPEN) { peersStore.setStatus('Profile will sync once connected'); return }
    ws.send(JSON.stringify({ type: 'SET-PEER-PROFILE', payload: { name: peersStore.displayName, pin: peersStore.pin } }))
    localStorage.setItem('peerProfileName', peersStore.displayName)
    localStorage.setItem('peerProfilePin',  peersStore.pin)
    peersStore.myAlias = peersStore.displayName || peersStore.myAlias
    peersStore.setStatus('Profile updated')
  }

  function connectTo(peerId, alias, hasPin) {
    if (peerId === peersStore.myPeerId) { peersStore.setStatus('Cannot connect to yourself!'); return }
    if (connInstance) connInstance.close()
    primeAudio()
    const pin = hasPin ? window.prompt(`Enter PIN for ${alias || peerId}`) : ''
    if (hasPin && pin === null) { peersStore.setStatus('Connection cancelled'); return }
    peersStore.setStatus(`Connecting to ${alias || peerId}…`)
    wireConn(peerInstance.connect(peerId, { reliable: true, serialization: 'raw', metadata: pin ? { pin: pin.trim() } : undefined }))
  }

  function sendText(text) {
    if (!connInstance?.open) return
    connInstance.send(JSON.stringify({ type: 'chat', text }))
    msgsStore.addLocalText(text)
  }

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
      if (dc && dc.bufferedAmount > BUF_HIGH)
        await new Promise(r => dc.addEventListener('bufferedamountlow', r, { once: true }))
      connInstance.send(buf); offset = end
      msgsStore.updateFileProgress(msgId, Math.round((offset / file.size) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
    connInstance.send(JSON.stringify({ type: 'file-end' }))
    msgsStore.finalizeFile(msgId, '✓ Sent')
    peersStore.setStatus(`Sent: ${file.name}`)
  }

  function init() {
    if (peerInstance) return

    const host = window.location.hostname
    const port = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80)

    peerInstance = new Peer({ host, port, path: '/', key: 'peerjs', secure: window.location.protocol === 'https:',
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } })

    peerInstance.on('open', id => {
      peersStore.myPeerId = id; peersStore.serverConnected = true
      peersStore.setStatus('Connected — discovering peers…')
      peersStore.loadPeers(); listenForIPGroupEvents()
      setTimeout(sendProfileUpdate, 300); primeAudio()
    })

    peerInstance.on('connection', c => { primeAudio(); wireConn(c); peersStore.setStatus(`Incoming connection from ${c.peer}`) })

    // ── Incoming media connection — route by metadata.type ─────────────────
    peerInstance.on('call', mc => {
      // ── Screen share (auto-answer, no local stream needed) ──────────────
      if (mc.metadata?.type === 'screen') {
        mc.answer()          // receive-only; send nothing back
        wireScreenRecv(mc)
        screenMediaConn = mc
        return
      }

      // ── Audio call ───────────────────────────────────────────────────────
      pendingMediaConn = mc

      // If user already clicked Accept and mic is ready, answer immediately.
      // Check localStream (not callState==='in-call') because callState is still
      // 'ringing-in' until the stream arrives — a chicken-and-egg if we wait for it.
      if (callStore.localStream && callStore.callState !== 'idle') {
        mc.answer(callStore.localStream)
        wireAudioConn(mc, callStore.localStream)
        pendingMediaConn = null
        return
      }

      if (callStore.callState === 'idle') { mc.close(); pendingMediaConn = null; return }

      // callState === 'ringing-in', mic not acquired yet — acceptCall() will answer
      mc.on('close', () => { if (callStore.callState !== 'idle') _cleanupCall('Call ended') })
      mc.on('error', () => _cleanupCall('Call error'))
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
    _cleanupCall(); _cleanupScreenShare()
    connInstance?.close(); peerInstance?.destroy()
    peerInstance = null; connInstance = null
  }

  return {
    init, destroy,
    connectTo, sendText, sendFile, sendProfileUpdate,
    startCall, cancelCall, acceptCall, rejectCall, endCall, toggleMute,
    startScreenShare, stopScreenShare,
  }
}
