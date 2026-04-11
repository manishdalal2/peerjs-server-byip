<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { usePeersStore }  from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { useCallStore }   from '../stores/call.js'
import { usePeer }        from '../composables/usePeer.js'
import { fmtBytes }       from '../stores/messages.js'

const peersStore = usePeersStore()
const msgsStore  = useMessagesStore()
const callStore  = useCallStore()
const { sendText, sendFile, startCall, startScreenShare, stopScreenShare } = usePeer()

const msgInput   = ref('')
const fileInput  = ref(null)
const stagedFile = ref(null)
const chatEl     = ref(null)
const sending    = ref(false)

const isConnected   = computed(() => !!peersStore.connectedId)
const canCall       = computed(() => isConnected.value && callStore.callState === 'idle')
const canScreen     = computed(() => isConnected.value && !callStore.isSharingScreen && !callStore.isViewingScreen)
const isSharingNow  = computed(() => callStore.isSharingScreen)

// Auto-scroll on new messages
watch(() => msgsStore.messages.length, async () => {
  await nextTick()
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
})

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
  if (text) { sendText(text); msgInput.value = '' }
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

    <!-- ── Connection bar ── -->
    <div class="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2.5 flex-shrink-0">
      <div
        class="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300"
        :class="isConnected ? 'bg-emerald-500' : 'bg-slate-300'"
      ></div>
      <span class="text-slate-500 text-xs">Connected to:</span>
      <span class="font-semibold text-sm truncate flex-1">
        {{ peersStore.connectedLabel || 'No one — select a peer' }}
      </span>

      <!-- Call button — only when connected and idle -->
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

      <!-- Empty-state overlay -->
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <div
          v-if="!isConnected"
          class="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10"
        >
          <div class="text-4xl">👈</div>
          <p class="text-slate-500 text-sm">Select a peer from the list to start</p>
        </div>
      </Transition>

      <!-- ── Messages ── -->
      <div ref="chatEl" class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        <p v-if="!msgsStore.messages.length" class="text-center text-slate-400 text-sm my-auto">
          No messages yet. Say hello!
        </p>

        <template v-for="msg in msgsStore.messages" :key="msg.id">

          <!-- Text bubble -->
          <div
            v-if="msg.type === 'text'"
            class="max-w-[72%] sm:max-w-[65%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words"
            :class="msg.local
              ? 'bg-indigo-500 text-white self-end rounded-br-sm'
              : 'bg-white border border-slate-200 shadow-sm self-start rounded-bl-sm'"
          >
            <div>{{ msg.text }}</div>
            <div class="text-[10px] mt-1.5 opacity-60 text-right">{{ msg.time }}</div>
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
            <div v-else class="text-xs opacity-80">{{ msg.doneLabel }}</div>
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
            class="w-9 h-9 rounded-full border flex items-center justify-center transition flex-shrink-0 text-base"
            :class="stagedFile
              ? 'border-indigo-400 text-indigo-500 bg-indigo-50'
              : 'border-slate-200 text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50'"
            title="Attach file"
          >📎</button>

          <!-- text-base on mobile prevents iOS auto-zoom on focus -->
          <input
            v-model="msgInput"
            placeholder="Type a message…"
            @keydown.enter.exact.prevent="send"
            class="flex-1 px-4 py-2 border border-slate-200 rounded-full outline-none
                   focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition
                   text-base sm:text-sm"
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
