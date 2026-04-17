<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { usePeersStore }    from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { useCallStore }     from '../stores/call.js'
import { usePeer }          from '../composables/usePeer.js'
import { fmtBytes }         from '../stores/messages.js'

const peersStore = usePeersStore()
const msgsStore  = useMessagesStore()
const callStore  = useCallStore()
const { sendText, sendFile, startCall, startScreenShare, stopScreenShare, closeConversation } = usePeer()

const msgInput   = ref('')
const inputEl    = ref(null)
const fileInput  = ref(null)
const stagedFile = ref(null)
const chatEl     = ref(null)
const sending    = ref(false)
const copiedId   = ref(null)

// ── Text rendering: escape HTML → linkify URLs → preserve newlines ────────────
const URL_RE = /https?:\/\/[^\s<>"')\]]+|www\.[a-zA-Z0-9-]+\.[^\s<>"')\]]+/g

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderText(text) {
  const escaped = escapeHtml(text)
  const linked  = escaped.replace(URL_RE, url => {
    const href = url.startsWith('http') ? url : 'https://' + url
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="underline decoration-1 break-all hover:opacity-80 transition-opacity">${url}</a>`
  })
  return linked.replace(/\n/g, '<br>')
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
let _copyTimer = null
async function copyMessage(msg) {
  try {
    await navigator.clipboard.writeText(msg.text)
  } catch {
    const el = Object.assign(document.createElement('textarea'), { value: msg.text })
    el.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(el); el.select(); document.execCommand('copy')
    document.body.removeChild(el)
  }
  copiedId.value = msg.id
  clearTimeout(_copyTimer)
  _copyTimer = setTimeout(() => { copiedId.value = null }, 2000)
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────
function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const tabs = computed(() =>
  Array.from(peersStore.openConversations.entries()).map(([peerId, tab]) => ({
    peerId,
    label: tab.label,
    connected: tab.connected,
    active: peerId === peersStore.activeTabId,
    unread: msgsStore.unread.get(peerId) ?? 0,
  }))
)

const activeTab = computed(() => {
  if (!peersStore.activeTabId) return null
  const tab = peersStore.openConversations.get(peersStore.activeTabId)
  return tab ? { peerId: peersStore.activeTabId, ...tab } : null
})

const activeMessages = computed(() => msgsStore.getMessages(peersStore.activeTabId))

const isConnected  = computed(() => activeTab.value?.connected ?? false)
const canCall      = computed(() => isConnected.value && callStore.callState === 'idle')
const canScreen    = computed(() => isConnected.value && !callStore.isSharingScreen && !callStore.isViewingScreen)
const isSharingNow = computed(() => callStore.isSharingScreen)

function switchTab(peerId) {
  peersStore.setActiveTab(peerId)
  msgsStore.markRead(peerId)
  nextTick(() => { if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight })
}

function closeTab(peerId) { closeConversation(peerId) }

// Scroll to bottom + mark read when messages arrive or tab switches
watch(() => activeMessages.value.length, async () => {
  await nextTick()
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
  if (peersStore.activeTabId) msgsStore.markRead(peersStore.activeTabId)
})
watch(() => peersStore.activeTabId, async () => {
  await nextTick()
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
})

// ── File handling ─────────────────────────────────────────────────────────────
function stageFile(e) {
  const f = e.target.files?.[0]
  if (f) stagedFile.value = f
}

function clearStaged() {
  stagedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function fileEmoji(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg','jpeg','png','gif','webp','svg','bmp','heic'].includes(ext)) return '🖼️'
  if (['mp4','mov','avi','mkv','webm'].includes(ext))                     return '🎬'
  if (['mp3','wav','ogg','flac','aac','m4a'].includes(ext))               return '🎵'
  if (ext === 'pdf')                                                       return '📕'
  return '📄'
}

async function send() {
  if (!isConnected.value) return
  const text = msgInput.value.trim()
  if (text) {
    sendText(text)
    msgInput.value = ''
    await nextTick()
    if (inputEl.value) inputEl.value.style.height = 'auto'
  }
  if (stagedFile.value) {
    const file = stagedFile.value
    clearStaged()
    sending.value = true
    await sendFile(file)
    sending.value = false
  }
}
</script>

<template>
  <main class="flex-1 flex flex-col overflow-hidden min-w-0">

    <!-- ── Conversation Tabs ── -->
    <div
      v-if="tabs.length"
      class="flex overflow-x-auto flex-shrink-0 bg-slate-50 border-b border-slate-200"
      style="scrollbar-width: none; -webkit-overflow-scrolling: touch;"
    >
      <button
        v-for="tab in tabs"
        :key="tab.peerId"
        @click="switchTab(tab.peerId)"
        class="relative flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap
               flex-shrink-0 border-b-2 transition-all group"
        :class="tab.active
          ? 'border-indigo-500 text-indigo-700 bg-white font-semibold'
          : tab.unread > 0
            ? 'border-amber-400 bg-amber-50 text-amber-800 font-medium hover:bg-amber-100'
            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/80'"
      >
        <!-- Connection status dot -->
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors"
          :class="tab.connected ? 'bg-emerald-500' : 'bg-slate-300'"
        ></span>

        <!-- Peer name -->
        <span class="max-w-[90px] truncate">{{ tab.label }}</span>

        <!-- Unread badge — pulsing to grab attention -->
        <span
          v-if="tab.unread > 0"
          class="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-bold
                 flex items-center justify-center px-1 flex-shrink-0 shadow shadow-red-200 animate-pulse"
        >{{ tab.unread > 99 ? '99+' : tab.unread }}</span>

        <!-- Close button -->
        <span
          @click.stop="closeTab(tab.peerId)"
          class="ml-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0
                 text-slate-300 group-hover:text-slate-400 hover:!text-red-400 hover:bg-red-50 transition"
          title="Close conversation"
        >✕</span>
      </button>
    </div>

    <!-- ── Connection bar ── -->
    <div
      v-if="activeTab"
      class="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2.5 flex-shrink-0"
    >
      <div
        class="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300"
        :class="isConnected ? 'bg-emerald-500' : 'bg-slate-300'"
      ></div>
      <span class="text-slate-500 text-xs flex-shrink-0">
        {{ isConnected ? 'Connected to:' : 'Disconnected:' }}
      </span>
      <span class="font-semibold text-sm truncate flex-1">{{ activeTab.label }}</span>

      <!-- Call button -->
      <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0 scale-75"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-150"
        leave-to-class="opacity-0 scale-75"
      >
        <button
          v-if="canCall"
          @click="startCall"
          title="Start audio call"
          aria-label="Start audio call"
          class="w-8 h-8 flex-shrink-0 rounded-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                 text-white flex items-center justify-center transition-colors shadow-sm"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
          </svg>
        </button>
      </Transition>

      <!-- Screen share button -->
      <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0 scale-75"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-150"
        leave-to-class="opacity-0 scale-75"
      >
        <button
          v-if="canScreen || isSharingNow"
          @click="isSharingNow ? stopScreenShare() : startScreenShare()"
          :title="isSharingNow ? 'Stop screen share' : 'Share your screen'"
          :aria-label="isSharingNow ? 'Stop screen share' : 'Share your screen'"
          class="w-8 h-8 flex-shrink-0 rounded-full text-white flex items-center justify-center transition-colors shadow-sm"
          :class="isSharingNow
            ? 'bg-red-500 hover:bg-red-600 active:bg-red-700'
            : 'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700'"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6v2H8v2h8v-2h-2v-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/>
          </svg>
        </button>
      </Transition>
    </div>

    <!-- ── Panel body ── -->
    <div class="flex-1 relative flex flex-col overflow-hidden">

      <!-- Empty state — no conversations open -->
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <div
          v-if="!tabs.length"
          class="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10 px-8"
        >
          <svg class="w-20 h-20 text-indigo-200" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="39" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>
            <circle cx="40" cy="40" r="8" fill="currentColor" class="text-indigo-300"/>
            <circle cx="16" cy="26" r="6" fill="currentColor" class="text-indigo-200"/>
            <circle cx="64" cy="26" r="6" fill="currentColor" class="text-indigo-200"/>
            <circle cx="16" cy="54" r="6" fill="currentColor" class="text-indigo-200"/>
            <circle cx="64" cy="54" r="6" fill="currentColor" class="text-indigo-200"/>
            <line x1="34" y1="36" x2="22" y2="30" stroke="currentColor" stroke-width="1.5" class="text-indigo-300" stroke-linecap="round"/>
            <line x1="46" y1="36" x2="58" y2="30" stroke="currentColor" stroke-width="1.5" class="text-indigo-300" stroke-linecap="round"/>
            <line x1="34" y1="44" x2="22" y2="50" stroke="currentColor" stroke-width="1.5" class="text-indigo-300" stroke-linecap="round"/>
            <line x1="46" y1="44" x2="58" y2="50" stroke="currentColor" stroke-width="1.5" class="text-indigo-300" stroke-linecap="round"/>
          </svg>
          <div class="text-center">
            <p class="text-slate-700 font-semibold text-base mb-1">No conversations open</p>
            <p class="text-slate-400 text-sm leading-relaxed">
              Pick someone from the peer list<span class="lg:hidden"> — tap <strong>Peers</strong> below</span><span class="hidden lg:inline"> on the left</span> to start chatting
            </p>
          </div>
        </div>
      </Transition>

      <!-- ── Messages ── -->
      <div ref="chatEl" class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        <p v-if="activeTab && !activeMessages.length" class="text-center text-slate-400 text-sm my-auto">
          No messages yet. Say hello!
        </p>

        <template v-for="msg in activeMessages" :key="msg.id">

          <!-- Text bubble -->
          <div
            v-if="msg.type === 'text'"
            class="flex items-end gap-1.5 group"
            :class="msg.local ? 'flex-row-reverse self-end' : 'self-start'"
          >
            <!-- Bubble -->
            <div
              class="max-w-[72%] sm:max-w-[65%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words"
              :class="msg.local
                ? 'bg-indigo-500 text-white rounded-br-sm'
                : 'bg-white border border-slate-200 shadow-sm rounded-bl-sm'"
            >
              <div v-html="renderText(msg.text)"></div>
              <div class="text-[10px] mt-1.5 opacity-60 text-right">{{ msg.time }}</div>
            </div>

            <!-- Copy button — always faintly visible on mobile, appears on hover on desktop -->
            <button
              @click.stop="copyMessage(msg)"
              class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all
                     bg-white border border-slate-200 shadow-sm
                     opacity-40 sm:opacity-0 group-hover:opacity-100 hover:border-indigo-300"
              :class="copiedId === msg.id ? 'text-emerald-500 border-emerald-300' : 'text-slate-400 hover:text-indigo-500'"
              :title="copiedId === msg.id ? 'Copied!' : 'Copy message'"
            >
              <!-- Copy icon -->
              <svg v-if="copiedId !== msg.id" class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
              <!-- Check icon when copied -->
              <svg v-else class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </button>
          </div>

          <!-- File bubble -->
          <div
            v-else-if="msg.type === 'file'"
            class="max-w-[80%] sm:max-w-[70%] px-3.5 py-3 rounded-2xl text-sm"
            :class="msg.local
              ? 'bg-indigo-500 text-white self-end rounded-br-sm'
              : 'bg-white border border-slate-200 shadow-sm self-start rounded-bl-sm'"
          >
            <div class="flex items-center gap-3 mb-2.5">
              <span class="text-2xl flex-shrink-0">{{ msg.emoji }}</span>
              <div class="min-w-0">
                <div class="font-semibold text-sm break-all">{{ msg.name }}</div>
                <div class="text-xs mt-0.5 opacity-75">{{ msg.sizeLabel }}</div>
              </div>
            </div>
            <template v-if="!msg.done">
              <div class="h-1.5 rounded-full overflow-hidden mb-1"
                :class="msg.local ? 'bg-white/30' : 'bg-slate-200'">
                <div class="h-full rounded-full transition-all duration-150"
                  :class="msg.local ? 'bg-white' : 'bg-indigo-500'"
                  :style="{ width: msg.progress + '%' }"></div>
              </div>
              <div class="text-xs opacity-70">{{ msg.progress }}%</div>
            </template>
            <template v-else>
              <!-- Manual save button when auto-download is off -->
              <button
                v-if="msg.blobUrl"
                @click="msgsStore.saveFile(activeTab.peerId, msg.id)"
                class="mt-1 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition
                       bg-white/20 hover:bg-white/30 active:bg-white/40 w-full justify-center"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/>
                </svg>
                Save to Downloads
              </button>
              <div v-else class="text-xs opacity-80">{{ msg.doneLabel }}</div>
            </template>
            <div class="text-[10px] mt-1.5 opacity-60 text-right">{{ msg.time }}</div>
          </div>

        </template>
      </div>

      <!-- ── Input bar ── -->
      <div class="p-3 bg-white border-t border-slate-200 flex-shrink-0">

        <!-- Staged file preview -->
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition-all duration-150"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="stagedFile"
            class="flex items-center gap-2.5 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 mb-2"
          >
            <span class="text-xl flex-shrink-0">{{ fileEmoji(stagedFile.name) }}</span>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold truncate">{{ stagedFile.name }}</div>
              <div class="text-[10px] text-slate-500">{{ fmtBytes(stagedFile.size) }}</div>
            </div>
            <button @click="clearStaged" class="text-slate-400 hover:text-red-500 transition text-base leading-none p-0.5">✕</button>
          </div>
        </Transition>

        <div class="flex gap-2 items-center">
          <input type="file" ref="fileInput" class="hidden" @change="stageFile" />

          <button
            @click="fileInput.click()"
            :disabled="!isConnected"
            class="w-9 h-9 rounded-full border flex items-center justify-center transition flex-shrink-0 text-base
                   disabled:opacity-40 disabled:cursor-not-allowed"
            :class="stagedFile
              ? 'border-indigo-400 text-indigo-500 bg-indigo-50'
              : 'border-slate-200 text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50'"
            title="Attach file"
          >📎</button>

          <!-- text-base prevents iOS auto-zoom; Shift+Enter adds newline, Enter sends -->
          <textarea
            ref="inputEl"
            v-model="msgInput"
            rows="1"
            :placeholder="isConnected ? 'Type a message… (Shift+Enter for new line)' : 'Select a peer to start chatting'"
            :disabled="!isConnected"
            @keydown.enter.exact.prevent="send"
            @input="autoResize"
            class="flex-1 px-4 py-2 border border-slate-200 rounded-2xl outline-none
                   focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition
                   text-base sm:text-sm resize-none overflow-hidden leading-relaxed
                   disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
            style="min-height: 38px;"
          />

          <button
            @click="send"
            :disabled="sending || !isConnected"
            class="px-4 sm:px-5 py-2 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700
                   disabled:bg-slate-300 disabled:cursor-not-allowed
                   text-white font-bold text-sm rounded-full transition whitespace-nowrap flex-shrink-0"
          >Send</button>
        </div>
      </div>
    </div>

  </main>
</template>
