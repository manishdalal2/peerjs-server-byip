import Peer from 'peerjs'
import { usePeersStore } from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { useAudio } from './useAudio.js'

// Module-level — survive across component re-renders and hot-reloads
let peerInstance = null
let connInstance = null

const CHUNK_SIZE = 16 * 1024        // 16 KB — safe SCTP limit
const BUF_HIGH   = 1 * 1024 * 1024  // pause sending above 1 MB
const BUF_LOW    = 256 * 1024       // resume once buffer drains to 256 KB

export function usePeer() {
  const peersStore   = usePeersStore()
  const msgsStore    = useMessagesStore()
  const { primeAudio, playNotification } = useAudio()

  // ── Wire a DataConnection (both outgoing and incoming) ───────────────────────
  function wireConn(c) {
    connInstance = c

    c.on('open', () => {
      const p = peersStore.availPeers.get(c.peer)
      peersStore.setPeerConnected(c.peer, p?.displayName ?? null, p?.alias ?? null)
      playNotification()
    })

    c.on('data', data => {
      if (data instanceof ArrayBuffer) {
        msgsStore.onChunk(data)
        return
      }
      if (typeof data === 'string') {
        let msg
        try { msg = JSON.parse(data) } catch { return }
        switch (msg.type) {
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
        }
      }
    })

    c.on('close', () => {
      peersStore.setPeerDisconnected()
      peersStore.setStatus('Peer disconnected')
    })

    c.on('error', err => peersStore.setStatus('Connection error: ' + err))
  }

  // ── Intercept PeerJS WebSocket to catch real-time IP-group events ─────────────
  function listenForIPGroupEvents() {
    if (!peerInstance?.socket?._socket) {
      setTimeout(listenForIPGroupEvents, 400)
      return
    }
    const ws   = peerInstance.socket._socket
    const orig = ws.onmessage
    ws.onmessage = function (evt) {
      try {
        const msg = JSON.parse(evt.data)
        peersStore.handleIPGroupMessage(msg)
      } catch { /* ignore non-JSON frames */ }
      if (orig) orig.call(this, evt)
    }
  }

  // ── Send profile to server over the PeerJS WebSocket ─────────────────────────
  function sendProfileUpdate() {
    const ws = peerInstance?.socket?._socket ?? null
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      peersStore.setStatus('Profile will sync once connected')
      return
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

  // ── Connect to a peer by ID ───────────────────────────────────────────────────
  function connectTo(peerId, alias, hasPin) {
    if (peerId === peersStore.myPeerId) {
      peersStore.setStatus('Cannot connect to yourself!')
      return
    }
    if (connInstance) connInstance.close()
    primeAudio()

    const pin = hasPin ? window.prompt(`Enter PIN for ${alias || peerId}`) : ''
    if (hasPin && pin === null) {
      peersStore.setStatus('Connection cancelled')
      return
    }

    peersStore.setStatus(`Connecting to ${alias || peerId}…`)
    const c = peerInstance.connect(peerId, {
      reliable: true,
      serialization: 'raw',
      metadata: pin ? { pin: pin.trim() } : undefined,
    })
    wireConn(c)
  }

  // ── Send a text message ───────────────────────────────────────────────────────
  function sendText(text) {
    if (!connInstance?.open) return
    connInstance.send(JSON.stringify({ type: 'chat', text }))
    msgsStore.addLocalText(text)
  }

  // ── Send a file in chunks with backpressure ───────────────────────────────────
  async function sendFile(file) {
    if (!connInstance?.open) return

    const msgId = msgsStore.addLocalFile(file.name, file.size)
    connInstance.send(JSON.stringify({
      type: 'file-start', name: file.name, size: file.size, fileType: file.type,
    }))

    const dc = connInstance._dc ?? null
    if (dc) dc.bufferedAmountLowThreshold = BUF_LOW

    let offset = 0
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size)
      const buf = await file.slice(offset, end).arrayBuffer()

      if (dc && dc.bufferedAmount > BUF_HIGH) {
        await new Promise(resolve =>
          dc.addEventListener('bufferedamountlow', resolve, { once: true })
        )
      }

      connInstance.send(buf)
      offset = end
      msgsStore.updateFileProgress(msgId, Math.round((offset / file.size) * 100))
      await new Promise(r => setTimeout(r, 0)) // yield to UI
    }

    connInstance.send(JSON.stringify({ type: 'file-end' }))
    msgsStore.finalizeFile(msgId, '✓ Sent')
    peersStore.setStatus(`Sent: ${file.name}`)
  }

  // ── Bootstrap PeerJS ─────────────────────────────────────────────────────────
  function init() {
    if (peerInstance) return   // guard against double-init in dev HMR

    const host   = window.location.hostname
    const port   = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80)
    const secure = window.location.protocol === 'https:'

    peerInstance = new Peer({
      host, port,
      path:   '/',
      key:    'peerjs',
      secure,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    })

    peerInstance.on('open', id => {
      peersStore.myPeerId        = id
      peersStore.serverConnected = true
      peersStore.setStatus('Connected — discovering peers…')
      peersStore.loadPeers()
      listenForIPGroupEvents()
      setTimeout(sendProfileUpdate, 300)
      primeAudio()
    })

    peerInstance.on('connection', c => {
      primeAudio()
      wireConn(c)
      peersStore.setStatus(`Incoming connection from ${c.peer}`)
    })

    peerInstance.on('disconnected', () => {
      peersStore.serverConnected = false
      peersStore.setStatus('Disconnected — reconnecting…')
      peerInstance.reconnect()
    })

    peerInstance.on('close', () => {
      peersStore.serverConnected = false
      peersStore.setPeerDisconnected()
    })

    peerInstance.on('error', err => {
      peersStore.serverConnected = false
      peersStore.setStatus('Error: ' + (err.type || err))
    })
  }

  function destroy() {
    connInstance?.close()
    peerInstance?.destroy()
    peerInstance = null
    connInstance = null
  }

  return { init, destroy, connectTo, sendText, sendFile, sendProfileUpdate }
}
