import { defineStore } from 'pinia'
import { ref } from 'vue'

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fileEmoji(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg','jpeg','png','gif','webp','svg','bmp','heic'].includes(ext)) return '🖼️'
  if (['mp4','mov','avi','mkv','webm'].includes(ext))                     return '🎬'
  if (['mp3','wav','ogg','flac','aac','m4a'].includes(ext))               return '🎵'
  if (ext === 'pdf')                                                       return '📕'
  if (['zip','rar','7z','tar','gz','bz2'].includes(ext))                  return '📦'
  if (['js','ts','py','java','cpp','c','go','rs','html','css','json','sh','rb'].includes(ext)) return '💻'
  if (['doc','docx','odt','pages'].includes(ext))                         return '📝'
  if (['xls','xlsx','csv','numbers'].includes(ext))                       return '📊'
  return '📄'
}

export function fmtBytes(bytes) {
  if (bytes < 1024)    return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(2) + ' MB'
}

let _id = 0
const uid = () => ++_id

export const useMessagesStore = defineStore('messages', () => {
  // Map<peerId, Message[]>
  const conversations = ref(new Map())
  // Map<peerId, number>
  const unread = ref(new Map())
  // Per-peer in-progress file receive state (not reactive — just tracking)
  const _recvStates = new Map()

  // ── Settings ──────────────────────────────────────────────────────────────
  const autoDownload = ref(localStorage.getItem('settingAutoDownload') !== 'false')
  function setAutoDownload(val) {
    autoDownload.value = val
    localStorage.setItem('settingAutoDownload', String(val))
  }

  function getMessages(peerId) {
    return conversations.value.get(peerId) ?? []
  }

  function markRead(peerId) {
    if ((unread.value.get(peerId) ?? 0) === 0) return
    const m = new Map(unread.value)
    m.set(peerId, 0)
    unread.value = m
  }

  function _push(peerId, msg) {
    const prev = conversations.value.get(peerId) ?? []
    const m = new Map(conversations.value)
    m.set(peerId, [...prev, msg])
    conversations.value = m
  }

  function _bumpUnread(peerId) {
    const m = new Map(unread.value)
    m.set(peerId, (m.get(peerId) ?? 0) + 1)
    unread.value = m
  }

  function addLocalText(peerId, text) {
    _push(peerId, { id: uid(), type: 'text', local: true, text, time: nowTime() })
  }

  function addRemoteText(peerId, text) {
    _push(peerId, { id: uid(), type: 'text', local: false, text, time: nowTime() })
    _bumpUnread(peerId)
  }

  function addLocalFile(peerId, name, size) {
    const id = uid()
    _push(peerId, {
      id, type: 'file', local: true,
      name, size, emoji: fileEmoji(name), sizeLabel: fmtBytes(size),
      progress: 0, done: false, doneLabel: '', time: nowTime(),
    })
    return id
  }

  function onFileStart(peerId, meta) {
    const id = uid()
    _recvStates.set(peerId, {
      meta: { name: meta.name, size: meta.size, fileType: meta.fileType },
      chunks: [], bytes: 0, msgId: id,
    })
    _push(peerId, {
      id, type: 'file', local: false,
      name: meta.name, size: meta.size,
      emoji: fileEmoji(meta.name), sizeLabel: fmtBytes(meta.size),
      progress: 0, done: false, doneLabel: '', time: nowTime(),
    })
    _bumpUnread(peerId)
  }

  function onChunk(peerId, buf) {
    const state = _recvStates.get(peerId)
    if (!state) return
    state.chunks.push(buf)
    state.bytes += buf.byteLength
    const pct = Math.min(100, Math.round((state.bytes / state.meta.size) * 100))
    _updateProgress(peerId, state.msgId, pct)
  }

  function onFileEnd(peerId) {
    const state = _recvStates.get(peerId)
    if (!state) return
    const blob = new Blob(state.chunks, { type: state.meta.fileType || 'application/octet-stream' })
    const name = state.meta.name
    if (autoDownload.value) {
      _finalize(peerId, state.msgId, '✓ Saved to Downloads')
      _autoDownload(blob, name)
    } else {
      // Store blob URL on the message so user can save manually
      const blobUrl = URL.createObjectURL(blob)
      _finalizeWithBlob(peerId, state.msgId, blobUrl, name)
    }
    _recvStates.delete(peerId)
  }

  function saveFile(peerId, msgId) {
    const msgs = conversations.value.get(peerId)
    if (!msgs) return
    const m = msgs.find(m => m.id === msgId)
    if (!m?.blobUrl) return
    _autoDownload_url(m.blobUrl, m.name)
    // revoke and clear after save
    setTimeout(() => URL.revokeObjectURL(m.blobUrl), 10_000)
    const nm = conversations.value.get(peerId)
    const idx = nm.findIndex(x => x.id === msgId)
    if (idx !== -1) { nm[idx] = { ...nm[idx], blobUrl: null, doneLabel: '✓ Saved to Downloads' } }
  }

  function updateFileProgress(peerId, id, pct) { _updateProgress(peerId, id, pct) }
  function finalizeFile(peerId, id, label)      { _finalize(peerId, id, label) }

  function _updateProgress(peerId, id, pct) {
    const msgs = conversations.value.get(peerId)
    if (!msgs) return
    const m = msgs.find(m => m.id === id)
    if (m) m.progress = pct
  }

  function _finalize(peerId, id, label) {
    const msgs = conversations.value.get(peerId)
    if (!msgs) return
    const m = msgs.find(m => m.id === id)
    if (m) { m.done = true; m.doneLabel = label; m.progress = 100 }
  }

  function _finalizeWithBlob(peerId, id, blobUrl, name) {
    const msgs = conversations.value.get(peerId)
    if (!msgs) return
    const m = msgs.find(m => m.id === id)
    if (m) { m.done = true; m.doneLabel = ''; m.progress = 100; m.blobUrl = blobUrl; m.name = name }
  }

  function _autoDownload(blob, name) {
    const url = URL.createObjectURL(blob)
    _autoDownload_url(url, name)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  function _autoDownload_url(url, name) {
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function clearConversation(peerId) {
    // Revoke any pending blob URLs to avoid memory leaks
    const msgs = conversations.value.get(peerId) ?? []
    msgs.forEach(m => { if (m.blobUrl) URL.revokeObjectURL(m.blobUrl) })
    const m = new Map(conversations.value)
    m.delete(peerId)
    conversations.value = m
    const u = new Map(unread.value)
    u.delete(peerId)
    unread.value = u
    _recvStates.delete(peerId)
  }

  return {
    conversations, unread,
    autoDownload, setAutoDownload,
    getMessages, markRead,
    addLocalText, addRemoteText,
    addLocalFile, onFileStart, onChunk, onFileEnd,
    updateFileProgress, finalizeFile,
    saveFile, clearConversation,
  }
})
