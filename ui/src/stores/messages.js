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
  const messages = ref([])

  // In-progress file receive state
  let recvMeta   = null
  let recvChunks = []
  let recvBytes  = 0
  let recvMsgId  = null

  function addLocalText(text) {
    messages.value.push({ id: uid(), type: 'text', local: true, text, time: nowTime() })
  }

  function addRemoteText(text) {
    messages.value.push({ id: uid(), type: 'text', local: false, text, time: nowTime() })
  }

  function addLocalFile(name, size) {
    const id = uid()
    messages.value.push({
      id, type: 'file', local: true,
      name, size, emoji: fileEmoji(name), sizeLabel: fmtBytes(size),
      progress: 0, done: false, doneLabel: '', time: nowTime(),
    })
    return id
  }

  function onFileStart(meta) {
    const id = uid()
    recvMeta   = { name: meta.name, size: meta.size, fileType: meta.fileType }
    recvChunks = []
    recvBytes  = 0
    recvMsgId  = id
    messages.value.push({
      id, type: 'file', local: false,
      name: meta.name, size: meta.size,
      emoji: fileEmoji(meta.name), sizeLabel: fmtBytes(meta.size),
      progress: 0, done: false, doneLabel: '', time: nowTime(),
    })
  }

  function onChunk(buf) {
    if (!recvMeta) return
    recvChunks.push(buf)
    recvBytes += buf.byteLength
    const pct = Math.min(100, Math.round((recvBytes / recvMeta.size) * 100))
    _updateProgress(recvMsgId, pct)
  }

  function onFileEnd() {
    if (!recvMeta) return
    const blob = new Blob(recvChunks, { type: recvMeta.fileType || 'application/octet-stream' })
    const name = recvMeta.name
    _finalize(recvMsgId, '✓ Saved to Downloads')
    _autoDownload(blob, name)
    recvMeta = null; recvChunks = []; recvBytes = 0; recvMsgId = null
  }

  function updateFileProgress(id, pct) { _updateProgress(id, pct) }
  function finalizeFile(id, label)      { _finalize(id, label) }

  function _updateProgress(id, pct) {
    const m = messages.value.find(m => m.id === id)
    if (m) m.progress = pct
  }

  function _finalize(id, label) {
    const m = messages.value.find(m => m.id === id)
    if (m) { m.done = true; m.doneLabel = label; m.progress = 100 }
  }

  function _autoDownload(blob, name) {
    const url = URL.createObjectURL(blob)
    const a   = Object.assign(document.createElement('a'), { href: url, download: name })
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return {
    messages,
    addLocalText, addRemoteText,
    addLocalFile, onFileStart, onChunk, onFileEnd,
    updateFileProgress, finalizeFile,
  }
})
