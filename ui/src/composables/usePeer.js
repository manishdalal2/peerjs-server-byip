import Peer from 'peerjs'
import { usePeersStore }    from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { useCallStore }     from '../stores/call.js'
import { useAudio }         from './useAudio.js'

// ── Module-level singletons ───────────────────────────────────────────────────
let peerInstance     = null
let callMediaConn    = null
let screenMediaConn  = null
let pendingMediaConn = null
let callTimeoutId    = null
let callPeerId       = null   // peer currently in a call with
let screenPeerId     = null   // peer currently screen-sharing with

const connections = new Map()  // Map<peerId, DataConnection>
const peerPins    = new Map()  // Map<peerId, string> — PIN used to reach that peer

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
  function _connFor(peerId) { return connections.get(peerId) }
  function _activeConn()    { return _connFor(peersStore.activeTabId) }

  function sendSignalTo(peerId, payload) {
    const conn = _connFor(peerId)
    if (conn?.open) conn.send(JSON.stringify(payload))
  }

  // Returns the PIN needed to reach peerId, prompting if not yet stored.
  // Every WebRTC OFFER (call + screen share) must include the destination's PIN.
  function _getPinFor(peerId) {
    if (peerPins.has(peerId)) return peerPins.get(peerId)
    const peer = peersStore.availPeers.get(peerId)
    if (peer?.hasPin) {
      const label = peersStore.openConversations.get(peerId)?.label || peerId
      const pin = window.prompt(`Enter PIN to call ${label}`)
      if (pin === null) return null   // user cancelled
      peerPins.set(peerId, pin.trim())
      return pin.trim()
    }
    return null
  }

  async function getMic() {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }

  function attachRemoteAudio(stream) {
    callStore.remoteStream = stream
    const el = document.getElementById('remoteAudio')
    if (!el) return
    el.srcObject = stream
    el.play().catch(() => {})
  }

  // ── Wire audio MediaConnection ────────────────────────────────────────────
  function wireAudioConn(mc, localStream) {
    callMediaConn = mc
    mc.on('stream', remoteStream => {
      attachRemoteAudio(remoteStream)
      callStore.callState = 'in-call'
      callStore.startTimer()
      const label = peersStore.openConversations.get(callPeerId)?.label || callPeerId || 'peer'
      peersStore.setStatus(`In call with ${label}`)
    })
    mc.on('close', () => _cleanupCall('Call ended'))
    mc.on('error', () => _cleanupCall('Call error'))
  }

  function _cleanupCall(msg = 'Call ended') {
    callMediaConn?.close(); callMediaConn = null
    pendingMediaConn = null
    clearTimeout(callTimeoutId)
    stopAllCallAudio()
    callStore.reset()
    callPeerId = null
    peersStore.setStatus(msg)
  }

  // ── Wire screen-share MediaConnection (receiver side) ─────────────────────
  function wireScreenRecv(mc) {
    screenMediaConn = mc
    mc.on('stream', stream => {
      callStore.remoteScreenStream = stream
      callStore.isViewingScreen    = true
      const label = peersStore.openConversations.get(screenPeerId)?.label || 'peer'
      peersStore.setStatus(`Viewing ${label}'s screen`)
    })
    mc.on('close', () => { callStore.resetScreen(); peersStore.setStatus('Screen share ended') })
    mc.on('error', () => { callStore.resetScreen() })
  }

  // ── Audio call — outgoing ─────────────────────────────────────────────────
  async function startCall() {
    const peerId = peersStore.activeTabId
    const conn   = _connFor(peerId)
    if (!conn?.open) { peersStore.setStatus('Connect to a peer before calling'); return }
    if (callStore.callState !== 'idle') return

    // Ensure we have the PIN before acquiring mic (prompt is synchronous, mic is async)
    const pin = _getPinFor(peerId)
    if (pin === null && peersStore.availPeers.get(peerId)?.hasPin) {
      peersStore.setStatus('PIN required to call this peer'); return
    }

    callPeerId = peerId
    try {
      const stream = await getMic()
      callStore.localStream = stream
      callStore.callState   = 'ringing-out'
      const label = peersStore.openConversations.get(peerId)?.label || peerId
      callStore.callerName  = label
      sendSignalTo(peerId, { type: 'call-request', callerName: peersStore.displayName || peersStore.myAlias })
      peersStore.setStatus(`Calling ${label}…`)
      startCallerTone()
      callTimeoutId = setTimeout(() => cancelCall(), RING_TIMEOUT_MS)
    } catch (err) {
      peersStore.setStatus('Microphone access denied: ' + (err.message || err))
      callStore.reset()
      callPeerId = null
    }
  }

  function _onCallAccepted() {
    clearTimeout(callTimeoutId)
    stopAllCallAudio()
    const pin = peerPins.get(callPeerId)
    wireAudioConn(
      peerInstance.call(callPeerId, callStore.localStream, pin ? { metadata: { pin } } : undefined),
      callStore.localStream,
    )
  }

  function cancelCall() {
    if (callStore.callState !== 'ringing-out') return
    if (callPeerId) sendSignalTo(callPeerId, { type: 'call-cancel' })
    _cleanupCall('Call cancelled')
  }

  async function acceptCall() {
    if (callStore.callState !== 'ringing-in') return
    stopAllCallAudio()
    try {
      const stream = await getMic()
      callStore.localStream = stream
      if (callPeerId) sendSignalTo(callPeerId, { type: 'call-accept' })
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
    if (callPeerId) sendSignalTo(callPeerId, { type: 'call-reject' })
    _cleanupCall('Call declined')
  }

  function endCall() {
    if (callPeerId) sendSignalTo(callPeerId, { type: 'call-end' })
    _cleanupCall('Call ended')
  }

  function toggleMute() {
    const track = callStore.localStream?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    callStore.isMuted = !track.enabled
  }

  // ── Screen share — start (sharer side) ───────────────────────────────────
  async function startScreenShare() {
    const peerId = peersStore.activeTabId
    const conn   = _connFor(peerId)
    if (!conn?.open) { peersStore.setStatus('Connect to a peer before sharing'); return }
    if (callStore.isSharingScreen) return
    // Ensure we have the PIN before starting screen capture
    const pin = _getPinFor(peerId)
    if (pin === null && peersStore.availPeers.get(peerId)?.hasPin) {
      peersStore.setStatus('PIN required to share screen with this peer'); return
    }

    screenPeerId = peerId
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      callStore.screenStream    = stream
      callStore.isSharingScreen = true
      sendSignalTo(peerId, { type: 'screen-share-start', sharerName: peersStore.displayName || peersStore.myAlias })
      const screenMeta = pin ? { type: 'screen', pin } : { type: 'screen' }
      screenMediaConn = peerInstance.call(peerId, stream, { metadata: screenMeta })
      screenMediaConn.on('close',  () => _cleanupScreenShare())
      screenMediaConn.on('error',  () => _cleanupScreenShare())
      stream.getVideoTracks()[0].onended = () => stopScreenShare()
      peersStore.setStatus('Sharing your screen…')
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        peersStore.setStatus('Screen share failed: ' + (err.message || err))
      }
      callStore.resetScreen()
      screenPeerId = null
    }
  }

  // ── Screen share — stop (sharer side) ────────────────────────────────────
  function stopScreenShare() {
    if (!callStore.isSharingScreen) return
    if (screenPeerId) sendSignalTo(screenPeerId, { type: 'screen-share-end' })
    _cleanupScreenShare()
  }

  function _cleanupScreenShare(msg = 'Screen share ended') {
    screenMediaConn?.close(); screenMediaConn = null
    callStore.resetScreen()
    screenPeerId = null
    peersStore.setStatus(msg)
  }

  // ── DataConnection ────────────────────────────────────────────────────────
  function wireConn(c) {
    connections.set(c.peer, c)

    c.on('open', () => {
      const p     = peersStore.availPeers.get(c.peer)
      peersStore.setPeerConnected(c.peer, p?.displayName ?? null, p?.alias ?? null)
      playNotification()
    })

    c.on('data', data => {
      const peerId = c.peer
      if (data instanceof ArrayBuffer) { msgsStore.onChunk(peerId, data); return }
      if (typeof data !== 'string') return
      let msg
      try { msg = JSON.parse(data) } catch { return }

      switch (msg.type) {
        // ── Chat / file ────────────────────────────────────────────────────
        case 'chat':
          msgsStore.addRemoteText(peerId, msg.text)
          playNotification()
          break
        case 'file-start':
          msgsStore.onFileStart(peerId, msg)
          playNotification()
          break
        case 'file-end':
          msgsStore.onFileEnd(peerId)
          break

        // ── Audio call signalling ──────────────────────────────────────────
        case 'call-request':
          if (callStore.callState !== 'idle') { sendSignalTo(peerId, { type: 'call-reject' }); break }
          callPeerId           = peerId
          callStore.callState  = 'ringing-in'
          callStore.callerName = msg.callerName || peersStore.openConversations.get(peerId)?.label || 'Someone'
          peersStore.setStatus(`Incoming call from ${callStore.callerName}`)
          startRingtone()
          break
        case 'call-accept':
          if (callStore.callState === 'ringing-out' && peerId === callPeerId) _onCallAccepted()
          break
        case 'call-reject':
          if (callStore.callState === 'ringing-out' && peerId === callPeerId) _cleanupCall('Call declined')
          break
        case 'call-cancel':
          if (callStore.callState === 'ringing-in' && peerId === callPeerId) {
            stopAllCallAudio(); _cleanupCall('Caller cancelled')
          }
          break
        case 'call-end':
          if (callStore.callState === 'in-call' && peerId === callPeerId) _cleanupCall('Call ended by peer')
          break

        // ── Screen share signalling ────────────────────────────────────────
        case 'screen-share-start':
          screenPeerId = peerId
          callStore.isViewingScreen = false
          peersStore.setStatus(`${msg.sharerName || peersStore.openConversations.get(peerId)?.label} is sharing their screen…`)
          break
        case 'screen-share-end':
          if (callStore.isViewingScreen) {
            callStore.resetScreen()
            screenPeerId = null
            peersStore.setStatus('Screen share ended')
          }
          break
      }
    })

    c.on('close', () => {
      connections.delete(c.peer)
      if (callPeerId === c.peer && callStore.callState !== 'idle') _cleanupCall('Peer disconnected')
      if (screenPeerId === c.peer && (callStore.isSharingScreen || callStore.isViewingScreen)) _cleanupScreenShare('Peer disconnected')
      peersStore.setPeerDisconnected(c.peer)
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

    const existing = peersStore.openConversations.get(peerId)

    // Tab open and already connected — just focus it
    if (existing?.connected) {
      peersStore.setActiveTab(peerId)
      return
    }

    // Tab exists but disconnected — clean up stale connection before reconnecting
    if (existing) {
      const old = connections.get(peerId)
      if (old) { try { old.close() } catch {} connections.delete(peerId) }
    }

    primeAudio()

    // Reuse stored PIN so we don't prompt again on reconnect
    let trimmedPin = peerPins.get(peerId) || ''
    if (!trimmedPin && hasPin) {
      const pin = window.prompt(`Enter PIN for ${alias || peerId}`)
      if (pin === null) { peersStore.setStatus('Connection cancelled'); return }
      trimmedPin = pin.trim()
      if (trimmedPin) peerPins.set(peerId, trimmedPin)
    }

    if (!existing) peersStore.openTab(peerId, alias || peerId.slice(0, 12) + '…')
    peersStore.setActiveTab(peerId)
    peersStore.setStatus(`Connecting to ${alias || peerId}…`)
    wireConn(peerInstance.connect(peerId, {
      reliable: true,
      serialization: 'raw',
      metadata: trimmedPin ? { pin: trimmedPin } : undefined,
    }))
  }

  function closeConversation(peerId) {
    const conn = _connFor(peerId)
    if (conn) { conn.close(); connections.delete(peerId) }
    peerPins.delete(peerId)
    peersStore.closeTab(peerId)
    msgsStore.clearConversation(peerId)
  }

  function sendText(text) {
    const peerId = peersStore.activeTabId
    const conn   = _activeConn()
    if (!conn?.open) return
    conn.send(JSON.stringify({ type: 'chat', text }))
    msgsStore.addLocalText(peerId, text)
  }

  async function sendFile(file, peerId = peersStore.activeTabId) {
    const conn = _connFor(peerId)
    if (!conn?.open) return
    const msgId = msgsStore.addLocalFile(peerId, file.name, file.size)
    conn.send(JSON.stringify({ type: 'file-start', name: file.name, size: file.size, fileType: file.type }))
    const dc = conn._dc ?? null
    if (dc) dc.bufferedAmountLowThreshold = BUF_LOW
    let offset = 0
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size)
      const buf = await file.slice(offset, end).arrayBuffer()
      if (dc && dc.bufferedAmount > BUF_HIGH)
        await new Promise(r => dc.addEventListener('bufferedamountlow', r, { once: true }))
      conn.send(buf); offset = end
      msgsStore.updateFileProgress(peerId, msgId, Math.round((offset / file.size) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
    conn.send(JSON.stringify({ type: 'file-end' }))
    msgsStore.finalizeFile(peerId, msgId, '✓ Sent')
    peersStore.setStatus(`Sent: ${file.name}`)
  }

  function init() {
    if (peerInstance) return

    const host = window.location.hostname
    const port = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80)

    // Persist peer ID across refreshes so others can always reach you by the same ID
    const PEER_ID_KEY = 'shareByAirPeerId'
    let savedId = localStorage.getItem(PEER_ID_KEY)
    if (!savedId) {
      savedId = crypto.randomUUID()
      localStorage.setItem(PEER_ID_KEY, savedId)
    }

    const stunUrl    = localStorage.getItem('stun')
    const iceServers = stunUrl ? [{ urls: stunUrl }] : []

    peerInstance = new Peer(savedId, {
      host, port, path: '/', key: 'peerjs',
      secure: window.location.protocol === 'https:',
      config: { iceServers },
    })

    peerInstance.on('open', id => {
      peersStore.myPeerId = id; peersStore.serverConnected = true
      peersStore.setStatus('Connected — discovering peers…')
      peersStore.loadPeers(); listenForIPGroupEvents()
      setTimeout(sendProfileUpdate, 300); primeAudio()
    })

    peerInstance.on('connection', c => {
      primeAudio()
      const p     = peersStore.availPeers.get(c.peer)
      const label = p?.displayName || p?.alias || c.peer.slice(0, 12) + '…'
      peersStore.openTab(c.peer, label)
      wireConn(c)
      peersStore.setStatus(`Incoming connection from ${label}`)
    })

    peerInstance.on('call', mc => {
      // Screen share — auto-answer, no local stream needed
      if (mc.metadata?.type === 'screen') {
        mc.answer()
        wireScreenRecv(mc)
        screenMediaConn = mc
        return
      }

      // Audio call
      pendingMediaConn = mc
      if (callStore.localStream && callStore.callState !== 'idle') {
        mc.answer(callStore.localStream)
        wireAudioConn(mc, callStore.localStream)
        pendingMediaConn = null
        return
      }
      if (callStore.callState === 'idle') { mc.close(); pendingMediaConn = null; return }

      mc.on('close', () => { if (callStore.callState !== 'idle') _cleanupCall('Call ended') })
      mc.on('error', () => _cleanupCall('Call error'))
    })

    peerInstance.on('disconnected', () => {
      peersStore.serverConnected = false
      peersStore.setStatus('Disconnected — reconnecting…')
      peerInstance?.reconnect()
    })
    peerInstance.on('close', () => { peersStore.serverConnected = false })
    peerInstance.on('error', err => {
      peersStore.serverConnected = false
      if (err.type === 'unavailable-id') {
        // Saved ID is still live on server (brief post-refresh window) — clear it and retry
        localStorage.removeItem(PEER_ID_KEY)
        peerInstance.destroy(); peerInstance = null
        setTimeout(init, 1000)
        peersStore.setStatus('ID conflict — reconnecting with new ID…')
        return
      }
      peersStore.setStatus('Error: ' + (err.type || err))
    })
  }

  function destroy() {
    _cleanupCall(); _cleanupScreenShare()
    connections.forEach(c => c.close())
    connections.clear()
    peerPins.clear()
    peerInstance?.destroy()
    peerInstance = null
  }

  return {
    init, destroy,
    connectTo, closeConversation,
    sendText, sendFile, sendProfileUpdate,
    startCall, cancelCall, acceptCall, rejectCall, endCall, toggleMute,
    startScreenShare, stopScreenShare,
  }
}
