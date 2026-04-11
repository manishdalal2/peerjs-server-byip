<script setup>
import { ref, computed } from 'vue'
import { usePeersStore } from '../stores/peers.js'
import { usePeer } from '../composables/usePeer.js'

const emit = defineEmits(['peer-selected'])

const peersStore = usePeersStore()
const { connectTo, sendProfileUpdate } = usePeer()

const refreshing = ref(false)
const manualId   = ref('')

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
          <input
            v-model="peersStore.pin"
            maxlength="50"
            placeholder="PIN (optional)"
            class="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg outline-none
                   focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition"
          />
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
        :class="peersStore.connectedId === p.id
          ? 'bg-indigo-50 border-indigo-400 shadow-sm'
          : 'border-transparent hover:bg-indigo-50 hover:border-indigo-200'"
      >
        <div class="font-semibold text-sm truncate">{{ p.displayName || p.alias || 'Unknown' }}</div>
        <div class="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{{ p.id }}</div>
        <div class="text-[10px] font-bold mt-1" :class="p.hasPin ? 'text-amber-500' : 'text-emerald-500'">
          ● {{ p.hasPin ? 'PIN required' : 'Available' }}
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

  </aside>
</template>
