<script setup>
import { ref, computed } from 'vue'
import { usePeersStore }    from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { usePeer } from '../composables/usePeer.js'

const emit = defineEmits(['peer-selected'])

const peersStore = usePeersStore()
const msgsStore  = useMessagesStore()
const { connectTo, sendProfileUpdate } = usePeer()

const refreshing = ref(false)
const manualId   = ref('')
const showPin    = ref(false)

const peers = computed(() => Array.from(peersStore.availPeers.values()))

async function refresh() {
  refreshing.value = true
  await peersStore.loadPeers()
  refreshing.value = false
}

function handlePeerClick(p) {
  connectTo(p.id, p.displayName || p.alias, p.hasPin)
  emit('peer-selected')
}

function connectManual() {
  const id = manualId.value.trim()
  if (id) {
    connectTo(id, null, false)
    manualId.value = ''
    emit('peer-selected')
  }
}
</script>

<template>
  <aside class="w-64 lg:w-72 bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0">

    <!-- ── My Info ── -->
    <div class="p-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">My Info</div>
      <div class="font-semibold text-sm truncate">{{ peersStore.myAlias }}</div>
      <div class="text-[10px] text-slate-400 font-mono break-all mt-0.5 leading-relaxed">
        {{ peersStore.myPeerId || '—' }}
      </div>
      <div class="mt-2.5 space-y-1.5">
        <input
          v-model="peersStore.displayName"
          maxlength="50"
          placeholder="Set your name (optional)"
          class="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none
                 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition"
        />
        <div class="flex gap-1.5">
          <div class="flex flex-1 min-w-0 border border-slate-200 rounded-lg overflow-hidden
                      focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 transition">
            <input
              v-model="peersStore.pin"
              :type="showPin ? 'text' : 'password'"
              maxlength="50"
              placeholder="PIN (optional)"
              class="flex-1 min-w-0 text-xs px-2.5 py-1.5 outline-none bg-transparent"
            />
            <button
              type="button"
              @click="showPin = !showPin"
              class="px-2 text-[10px] text-slate-400 hover:text-indigo-500 transition flex-shrink-0 border-l border-slate-200 bg-slate-50"
            >{{ showPin ? 'Hide' : 'Show' }}</button>
          </div>
          <button
            @click="sendProfileUpdate"
            class="text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700
                   text-white font-bold rounded-lg transition flex-shrink-0"
          >Save</button>
        </div>
      </div>
    </div>

    <!-- ── Peers header ── -->
    <div class="px-3 py-2.5 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Peers</span>
      <button
        @click="refresh"
        class="text-xs px-2.5 py-1 border border-slate-200 rounded-md text-slate-500
               hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50 transition"
      >{{ refreshing ? '↻ …' : '↻ Refresh' }}</button>
    </div>

    <!-- ── Peer list ── -->
    <div class="flex-1 overflow-y-auto p-2">
      <p v-if="!peers.length" class="text-center text-slate-400 text-xs leading-relaxed p-5">
        No other peers on your network
      </p>

      <button
        v-for="p in peers"
        :key="p.id"
        @click="handlePeerClick(p)"
        class="w-full text-left px-3 py-2.5 rounded-xl mb-1 border transition-all"
        :class="peersStore.openConversations.has(p.id)
          ? (peersStore.openConversations.get(p.id)?.connected
              ? 'bg-emerald-50 border-emerald-200 shadow-sm'
              : 'bg-amber-50 border-amber-200')
          : 'border-transparent hover:bg-indigo-50 hover:border-indigo-200'"
      >
        <div class="font-semibold text-sm truncate">{{ p.displayName || p.alias || 'Unknown' }}</div>
        <div class="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{{ p.id }}</div>
        <div class="text-[10px] font-bold mt-1"
          :class="peersStore.openConversations.has(p.id)
            ? (peersStore.openConversations.get(p.id)?.connected ? 'text-emerald-600' : 'text-amber-500')
            : (p.hasPin ? 'text-amber-500' : 'text-emerald-500')"
        >
          <template v-if="peersStore.openConversations.has(p.id)">
            ● {{ peersStore.openConversations.get(p.id)?.connected ? 'Chat open' : 'Reconnect' }}
          </template>
          <template v-else>
            ● {{ p.hasPin ? 'PIN required' : 'Available' }}
          </template>
        </div>
      </button>
    </div>

    <!-- ── Manual connect ── -->
    <div class="p-3 border-t border-slate-200 flex-shrink-0">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Connect by ID</div>
      <div class="flex gap-1.5">
        <input
          v-model="manualId"
          placeholder="Paste peer ID…"
          @keydown.enter="connectManual"
          class="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none
                 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition"
        />
        <button
          @click="connectManual"
          class="text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700
                 text-white font-bold rounded-lg transition flex-shrink-0"
        >Go</button>
      </div>
    </div>

    <!-- ── Settings ── -->
    <div class="p-3 border-t border-slate-200 flex-shrink-0">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Settings</div>

      <!-- Auto-save files toggle -->
      <label class="flex items-center justify-between gap-3 cursor-pointer group">
        <div class="min-w-0">
          <div class="text-xs font-medium text-slate-700 group-hover:text-slate-900 transition">Auto-save received files</div>
          <div class="text-[10px] text-slate-400 mt-0.5">
            {{ msgsStore.autoDownload ? 'Files saved automatically' : 'Tap "Save" on each file' }}
          </div>
        </div>
        <!-- Toggle switch -->
        <button
          type="button"
          role="switch"
          :aria-checked="msgsStore.autoDownload"
          @click="msgsStore.setAutoDownload(!msgsStore.autoDownload)"
          class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none
                 focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
          :class="msgsStore.autoDownload ? 'bg-indigo-500' : 'bg-slate-300'"
        >
          <span
            class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
            :class="msgsStore.autoDownload ? 'translate-x-4' : 'translate-x-0'"
          ></span>
        </button>
      </label>
    </div>

  </aside>
</template>
