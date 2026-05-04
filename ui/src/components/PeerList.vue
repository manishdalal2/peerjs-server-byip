<script setup>
import { ref, computed } from 'vue'
import { usePeersStore }    from '../stores/peers.js'
import { useMessagesStore } from '../stores/messages.js'
import { useFriendsStore }  from '../stores/friends.js'
import { usePeer } from '../composables/usePeer.js'

const emit = defineEmits(['peer-selected'])

const peersStore   = usePeersStore()
const msgsStore    = useMessagesStore()
const friendsStore = useFriendsStore()
const { connectTo, sendProfileUpdate } = usePeer()

// ── Tab state ─────────────────────────────────────────────────────────────────
const activeTab = ref('nearby') // 'nearby' | 'friends'

// ── Nearby peers ──────────────────────────────────────────────────────────────
const refreshing = ref(false)
const showPin    = ref(false)

const peers = computed(() => Array.from(peersStore.availPeers.values()))

const friendPeerIds = computed(() => new Set(friendsStore.friends.map(f => f.peerId)))

function saveNearbyAsFriend(p) {
  if (!p.displayName) return
  friendsStore.add(p.displayName, p.id, '')
}

async function refresh() {
  refreshing.value = true
  await peersStore.loadPeers()
  refreshing.value = false
}

function handlePeerClick(p) {
  connectTo(p.id, p.displayName || p.alias, p.hasPin)
  emit('peer-selected')
}

// ── Manual connect (Connect by ID) ────────────────────────────────────────────
const manualId      = ref('')
const manualPin     = ref('')
const showManualPin = ref(false)

function connectManual() {
  const id  = manualId.value.trim()
  const pin = manualPin.value.trim()
  if (!id) return
  const peer   = peersStore.availPeers.get(id)
  const hasPin = peer ? peer.hasPin : !!pin
  connectTo(id, peer?.displayName || peer?.alias || null, hasPin, pin || null)
  manualId.value  = ''
  manualPin.value = ''
  emit('peer-selected')
}

// ── Friends ───────────────────────────────────────────────────────────────────
const showAddForm    = ref(false)
const newName        = ref('')
const newAlias       = ref('')
const newPeerId      = ref('')
const newPin         = ref('')
const showNewPin     = ref(false)

const editingId      = ref(null)   // friend.id being edited
const editName       = ref('')
const editAlias      = ref('')
const editPeerId     = ref('')
const editPin        = ref('')
const showEditPin    = ref(false)

function addFriend() {
  if (!newPeerId.value.trim()) return
  friendsStore.add(newName.value, newPeerId.value, newPin.value, newAlias.value)
  newName.value     = ''
  newAlias.value    = ''
  newPeerId.value   = ''
  newPin.value      = ''
  showAddForm.value = false
}

function startEdit(f) {
  editingId.value   = f.id
  editName.value    = f.name
  editAlias.value   = f.alias || ''
  editPeerId.value  = f.peerId
  editPin.value     = f.pin
  showEditPin.value = false
}

function saveEdit() {
  if (!editPeerId.value.trim()) return
  friendsStore.update(editingId.value, {
    name:   editName.value.trim(),
    alias:  editAlias.value.trim(),
    peerId: editPeerId.value.trim(),
    pin:    editPin.value.trim(),
  })
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function connectFriend(f) {
  const peer   = peersStore.availPeers.get(f.peerId)
  const hasPin = peer ? peer.hasPin : !!f.pin
  connectTo(f.peerId, f.name || null, hasPin, f.pin || null)
  emit('peer-selected')
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

    <!-- ── Tab switcher ── -->
    <div class="flex border-b border-slate-200 flex-shrink-0">
      <button
        @click="activeTab = 'nearby'"
        class="flex-1 py-2 text-[11px] font-bold uppercase tracking-widest transition border-b-2"
        :class="activeTab === 'nearby'
          ? 'border-indigo-500 text-indigo-600'
          : 'border-transparent text-slate-400 hover:text-slate-600'"
      >Nearby</button>
      <button
        @click="activeTab = 'friends'"
        class="flex-1 py-2 text-[11px] font-bold uppercase tracking-widest transition border-b-2 relative"
        :class="activeTab === 'friends'
          ? 'border-indigo-500 text-indigo-600'
          : 'border-transparent text-slate-400 hover:text-slate-600'"
      >
        Friends
        <span
          v-if="friendsStore.friends.length"
          class="ml-1 text-[9px] bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 font-bold"
        >{{ friendsStore.friends.length }}</span>
      </button>
    </div>

    <!-- ══ NEARBY tab ══════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'nearby'">

      <!-- refresh button row -->
      <div class="px-3 py-2 flex justify-end flex-shrink-0">
        <button
          @click="refresh"
          class="text-xs px-2.5 py-1 border border-slate-200 rounded-md text-slate-500
                 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50 transition"
        >{{ refreshing ? '↻ …' : '↻ Refresh' }}</button>
      </div>

      <div class="flex-1 overflow-y-auto p-2">
        <p v-if="!peers.length" class="text-center text-slate-400 text-xs leading-relaxed p-5">
          No other peers on your network
        </p>

        <div
          v-for="p in peers"
          :key="p.id"
          class="flex items-start gap-1 w-full mb-1 rounded-xl border transition-all"
          :class="peersStore.openConversations.has(p.id)
            ? (peersStore.openConversations.get(p.id)?.connected
                ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                : 'bg-amber-50 border-amber-200')
            : 'border-transparent hover:bg-indigo-50 hover:border-indigo-200'"
        >
          <!-- clickable peer info -->
          <button
            @click="handlePeerClick(p)"
            class="flex-1 min-w-0 text-left px-3 py-2.5"
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
          <!-- save to friends -->
          <button
            @click="saveNearbyAsFriend(p)"
            :disabled="friendPeerIds.has(p.id) || !p.displayName"
            :title="friendPeerIds.has(p.id) ? 'Already in friends' : (!p.displayName ? 'Peer must set a name before being saved' : 'Save to friends')"
            class="flex-shrink-0 mt-2 mr-2 text-[11px] px-2 py-1 rounded-md border transition font-bold"
            :class="friendPeerIds.has(p.id)
              ? 'border-emerald-200 text-emerald-500 bg-emerald-50 cursor-default'
              : !p.displayName
                ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                : 'border-slate-200 text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50'"
          >{{ friendPeerIds.has(p.id) ? '★' : '☆' }}</button>
        </div>
      </div>

    </template>

    <!-- ══ FRIENDS tab ═════════════════════════════════════════════════════════ -->
    <template v-else>

      <div class="flex-1 overflow-y-auto p-2">

        <p v-if="!friendsStore.friends.length && !showAddForm"
           class="text-center text-slate-400 text-xs leading-relaxed p-5">
          No friends saved yet.<br>Add one below to connect instantly.
        </p>

        <!-- Friend entries -->
        <template v-for="f in friendsStore.friends" :key="f.id">

          <!-- Edit mode -->
          <div v-if="editingId === f.id"
               class="mb-2 p-2.5 rounded-xl border border-indigo-200 bg-indigo-50 space-y-1.5">
            <input
              v-model="editName"
              placeholder="Name"
              maxlength="50"
              class="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none
                     focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white"
            />
            <input
              v-model="editAlias"
              placeholder="Alias (your nickname for them)"
              maxlength="50"
              class="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none
                     focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white"
            />
            <input
              v-model="editPeerId"
              placeholder="Peer ID (GUID)"
              class="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none
                     focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white font-mono"
            />
            <div class="flex min-w-0 border border-slate-200 rounded-lg overflow-hidden bg-white
                        focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 transition">
              <input
                v-model="editPin"
                :type="showEditPin ? 'text' : 'password'"
                placeholder="PIN (optional)"
                class="flex-1 min-w-0 text-xs px-2 py-1.5 outline-none bg-transparent"
              />
              <button type="button" @click="showEditPin = !showEditPin"
                class="px-2 text-[10px] text-slate-400 hover:text-indigo-500 transition flex-shrink-0 border-l border-slate-200">
                {{ showEditPin ? 'Hide' : 'Show' }}
              </button>
            </div>
            <div class="flex gap-1.5 pt-0.5">
              <button @click="saveEdit"
                class="flex-1 text-xs py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg transition">
                Save
              </button>
              <button @click="cancelEdit"
                class="flex-1 text-xs py-1.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg transition">
                Cancel
              </button>
            </div>
          </div>

          <!-- Display mode -->
          <div v-else
               class="mb-1 px-3 py-2.5 rounded-xl border transition-all"
               :class="peersStore.openConversations.has(f.peerId)
                 ? (peersStore.openConversations.get(f.peerId)?.connected
                     ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                     : 'bg-amber-50 border-amber-200')
                 : 'border-transparent hover:bg-indigo-50 hover:border-indigo-200'"
          >
            <div class="flex items-start justify-between gap-1">
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-sm truncate">{{ f.name || 'Unnamed' }}</div>
                <div v-if="f.alias" class="text-[10px] text-indigo-400 font-medium mt-0.5 truncate">saved as: {{ f.alias }}</div>
                <div class="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{{ f.peerId }}</div>
                <div v-if="f.pin" class="text-[10px] text-amber-500 font-bold mt-0.5">PIN saved</div>
                <div v-if="peersStore.openConversations.has(f.peerId)"
                     class="text-[10px] font-bold mt-1"
                     :class="peersStore.openConversations.get(f.peerId)?.connected ? 'text-emerald-600' : 'text-amber-500'">
                  ● {{ peersStore.openConversations.get(f.peerId)?.connected ? 'Chat open' : 'Reconnect' }}
                </div>
              </div>
              <!-- Action buttons -->
              <div class="flex gap-1 flex-shrink-0 pt-0.5">
                <button
                  @click="connectFriend(f)"
                  title="Connect"
                  class="text-[10px] px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-md transition"
                >Chat</button>
                <button
                  @click="startEdit(f)"
                  title="Edit"
                  class="text-[10px] px-2 py-1 border border-slate-200 text-slate-500 hover:text-indigo-500 hover:border-indigo-300 rounded-md transition"
                >Edit</button>
                <button
                  @click="friendsStore.remove(f.id)"
                  title="Remove"
                  class="text-[10px] px-2 py-1 border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-300 rounded-md transition"
                >✕</button>
              </div>
            </div>
          </div>

        </template>

        <!-- Add friend form -->
        <div v-if="showAddForm" class="mt-1 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 space-y-1.5">
          <div class="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">New Friend</div>
          <input
            v-model="newName"
            placeholder="Their name"
            maxlength="50"
            class="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none
                   focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white"
          />
          <input
            v-model="newAlias"
            placeholder="Alias — your nickname for them (optional)"
            maxlength="50"
            class="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none
                   focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white"
          />
          <input
            v-model="newPeerId"
            placeholder="Their Peer ID (GUID)"
            class="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none
                   focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white font-mono"
          />
          <div class="flex min-w-0 border border-slate-200 rounded-lg overflow-hidden bg-white
                      focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 transition">
            <input
              v-model="newPin"
              :type="showNewPin ? 'text' : 'password'"
              placeholder="Their PIN (optional)"
              class="flex-1 min-w-0 text-xs px-2 py-1.5 outline-none bg-transparent"
            />
            <button type="button" @click="showNewPin = !showNewPin"
              class="px-2 text-[10px] text-slate-400 hover:text-indigo-500 transition flex-shrink-0 border-l border-slate-200">
              {{ showNewPin ? 'Hide' : 'Show' }}
            </button>
          </div>
          <div class="flex gap-1.5 pt-0.5">
            <button
              @click="addFriend"
              :disabled="!newPeerId.trim()"
              class="flex-1 text-xs py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40
                     text-white font-bold rounded-lg transition"
            >Add Friend</button>
            <button
              @click="showAddForm = false"
              class="flex-1 text-xs py-1.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg transition"
            >Cancel</button>
          </div>
        </div>

        <!-- Add friend toggle -->
        <button
          v-if="!showAddForm"
          @click="showAddForm = true"
          class="w-full mt-1 py-2 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50
                 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl transition font-medium"
        >+ Add Friend</button>

      </div>

    </template>

    <!-- ── Connect by ID (always visible) ── -->
    <div class="p-3 border-t border-slate-200 flex-shrink-0">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Connect by ID</div>
      <div class="flex gap-1.5 mb-1.5">
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
      <div class="flex min-w-0 border border-slate-200 rounded-lg overflow-hidden
                  focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 transition">
        <input
          v-model="manualPin"
          :type="showManualPin ? 'text' : 'password'"
          placeholder="PIN (if required)"
          @keydown.enter="connectManual"
          class="flex-1 min-w-0 text-xs px-2.5 py-1.5 outline-none bg-transparent"
        />
        <button
          type="button"
          @click="showManualPin = !showManualPin"
          class="px-2 text-[10px] text-slate-400 hover:text-indigo-500 transition flex-shrink-0 border-l border-slate-200 bg-slate-50"
        >{{ showManualPin ? 'Hide' : 'Show' }}</button>
      </div>
    </div>

    <!-- ── Settings ── -->
    <div class="p-3 border-t border-slate-200 flex-shrink-0">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Settings</div>
      <label class="flex items-center justify-between gap-3 cursor-pointer group">
        <div class="min-w-0">
          <div class="text-xs font-medium text-slate-700 group-hover:text-slate-900 transition">Auto-save received files</div>
          <div class="text-[10px] text-slate-400 mt-0.5">
            {{ msgsStore.autoDownload ? 'Files saved automatically' : 'Tap "Save" on each file' }}
          </div>
        </div>
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
