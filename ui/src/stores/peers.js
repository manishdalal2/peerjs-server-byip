import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePeersStore = defineStore('peers', () => {
  const myPeerId          = ref(null)
  const serverConnected   = ref(false)
  const availPeers        = ref(new Map())   // Map<id, peerObj>
  const connectedId       = ref(null)
  const connectedLabel    = ref(null)        // display name of active peer
  const statusText        = ref('Initialising…')
  const myAlias           = ref('—')

  // Profile — kept in sync with localStorage
  const displayName = ref(localStorage.getItem('peerProfileName') || '')
  const pin         = ref(localStorage.getItem('peerProfilePin')  || '')

  function setStatus(msg) {
    statusText.value = msg
  }

  function setPeerConnected(peerId, name, alias) {
    connectedId.value    = peerId
    connectedLabel.value = name || alias || peerId.slice(0, 12) + '…'
  }

  function setPeerDisconnected() {
    connectedId.value    = null
    connectedLabel.value = null
  }

  async function loadPeers() {
    try {
      const res = await fetch('/peerjs/by-ip')
      if (!res.ok) throw new Error(res.status)
      const list = await res.json()
      const map = new Map()
      list.forEach(p => {
        if (p.id === myPeerId.value) {
          myAlias.value = p.displayName || p.alias || '—'
        } else {
          map.set(p.id, p)
        }
      })
      availPeers.value = map
      setStatus(`Found ${map.size} peer(s) on your network`)
    } catch {
      setStatus('Could not load peer list')
    }
  }

  // Called by usePeer once the underlying WebSocket is ready
  function handleIPGroupMessage(msg) {
    if (msg.type === 'PEER-JOINED-IP-GROUP') {
      const p = msg.payload
      if (p.id === myPeerId.value) return
      const m = new Map(availPeers.value)
      m.set(p.id, p)
      availPeers.value = m
      setStatus(`${p.displayName || p.alias || 'Someone'} joined`)
    } else if (msg.type === 'PEER-LEFT-IP-GROUP') {
      const p = msg.payload
      if (p.id === myPeerId.value) return
      const m = new Map(availPeers.value)
      m.delete(p.id)
      availPeers.value = m
      setStatus(`${p.displayName || p.alias || 'Someone'} left`)
    } else if (msg.type === 'PEER-METADATA-UPDATED') {
      const p = msg.payload
      if (p.id === myPeerId.value) {
        myAlias.value = p.displayName || p.alias || '—'
      } else {
        const m = new Map(availPeers.value)
        m.set(p.id, p)
        availPeers.value = m
      }
    }
  }

  return {
    myPeerId, serverConnected, availPeers, connectedId, connectedLabel,
    statusText, myAlias, displayName, pin,
    setStatus, setPeerConnected, setPeerDisconnected, loadPeers, handleIPGroupMessage,
  }
})
