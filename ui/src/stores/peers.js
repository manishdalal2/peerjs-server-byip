import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePeersStore = defineStore('peers', () => {
  const myPeerId        = ref(null)
  const serverConnected = ref(false)
  const availPeers      = ref(new Map())   // Map<id, peerObj>
  const statusText      = ref('Initialising…')
  const myAlias         = ref('—')

  // Open conversation tabs — Map<peerId, { label, connected }>
  const openConversations = ref(new Map())
  const activeTabId       = ref(null)

  // Profile — kept in sync with localStorage
  const displayName = ref(localStorage.getItem('peerProfileName') || '')
  const pin         = ref(localStorage.getItem('peerProfilePin')  || '')

  // Backward-compat computed values used in CallBar and legacy code
  const connectedId    = computed(() => activeTabId.value)
  const connectedLabel = computed(() => {
    if (!activeTabId.value) return null
    return openConversations.value.get(activeTabId.value)?.label ?? null
  })

  function setStatus(msg) { statusText.value = msg }

  // ── Tab management ──────────────────────────────────────────────────────────
  function openTab(peerId, label) {
    if (openConversations.value.has(peerId)) {
      activeTabId.value = peerId
      return
    }
    const m = new Map(openConversations.value)
    m.set(peerId, { label: label || peerId.slice(0, 12) + '…', connected: false })
    openConversations.value = m
    activeTabId.value = peerId
  }

  function closeTab(peerId) {
    const m = new Map(openConversations.value)
    m.delete(peerId)
    openConversations.value = m
    if (activeTabId.value === peerId) {
      const keys = [...m.keys()]
      activeTabId.value = keys.length ? keys[keys.length - 1] : null
    }
  }

  function setTabConnected(peerId, connected) {
    const tab = openConversations.value.get(peerId)
    if (!tab) return
    const m = new Map(openConversations.value)
    m.set(peerId, { ...tab, connected })
    openConversations.value = m
  }

  function setActiveTab(peerId) {
    if (openConversations.value.has(peerId)) activeTabId.value = peerId
  }

  function setPeerConnected(peerId, name, alias) {
    const tab = openConversations.value.get(peerId)
    if (tab) {
      const label = name || alias || tab.label
      const m = new Map(openConversations.value)
      m.set(peerId, { ...tab, label, connected: true })
      openConversations.value = m
    }
  }

  function setPeerDisconnected(peerId) {
    if (peerId) setTabConnected(peerId, false)
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
        // Update open tab label if this peer updated their name
        if (openConversations.value.has(p.id)) {
          const tab = openConversations.value.get(p.id)
          const newLabel = p.displayName || p.alias || tab.label
          const tabs = new Map(openConversations.value)
          tabs.set(p.id, { ...tab, label: newLabel })
          openConversations.value = tabs
        }
      }
    }
  }

  return {
    myPeerId, serverConnected, availPeers, statusText, myAlias,
    openConversations, activeTabId,
    displayName, pin,
    connectedId, connectedLabel,
    setStatus,
    openTab, closeTab, setTabConnected, setActiveTab,
    setPeerConnected, setPeerDisconnected,
    loadPeers, handleIPGroupMessage,
  }
})
