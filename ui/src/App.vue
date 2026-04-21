<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppHeader        from './components/AppHeader.vue'
import PeerList         from './components/PeerList.vue'
import ChatPanel        from './components/ChatPanel.vue'
import WelcomeModal     from './components/WelcomeModal.vue'
import CallBar          from './components/CallBar.vue'
import IncomingCall     from './components/IncomingCall.vue'
import ScreenShare      from './components/ScreenShare.vue'
import ShareTargetModal from './components/ShareTargetModal.vue'
import { useShareTarget } from './composables/useShareTarget.js'
import { usePeersStore }    from './stores/peers.js'
import { useMessagesStore } from './stores/messages.js'
import { usePeer }          from './composables/usePeer.js'
import { useAudio }         from './composables/useAudio.js'

const peersStore = usePeersStore()
const msgsStore  = useMessagesStore()
const { sharedFiles, clearSharedFiles } = useShareTarget()
const { init, destroy } = usePeer()
const { primeAudio }    = useAudio()

const totalUnread = computed(() =>
  Array.from(msgsStore.unread.values()).reduce((sum, n) => sum + n, 0)
)

const welcomeModal = ref(null)
const sidebarOpen  = ref(false)
const isPortrait   = ref(window.matchMedia('(orientation: portrait)').matches)

let orientationMq      = null
let orientationHandler = null

function openAbout()    { welcomeModal.value?.show() }
function closeSidebar() { sidebarOpen.value = false }

onMounted(() => {
  init()

  // Keep retrying audio unlock on every user gesture until it succeeds
  const prime = () => primeAudio()
  document.addEventListener('click',      prime, { passive: true })
  document.addEventListener('keydown',    prime, { passive: true })
  document.addEventListener('touchstart', prime, { passive: true })

  // Fix 100vh on iOS Safari (address bar shrinks the viewport)
  function setVh() {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`)
  }
  setVh()
  window.addEventListener('resize', setVh)

  // On large portrait screens (e.g. 15-inch Android tablets), keep sidebar as overlay
  orientationMq = window.matchMedia('(orientation: portrait)')
  orientationHandler = (e) => {
    isPortrait.value = e.matches
    if (e.matches) sidebarOpen.value = false
  }
  orientationMq.addEventListener('change', orientationHandler)
})

onUnmounted(() => {
  destroy()
  if (orientationMq && orientationHandler) {
    orientationMq.removeEventListener('change', orientationHandler)
  }
})
</script>

<template>
  <div
    class="flex flex-col bg-slate-100 overflow-hidden"
    style="height: 100vh; height: calc(var(--vh, 1vh) * 100);"
  >
    <AppHeader :sidebar-open="sidebarOpen" :force-overlay="isPortrait" :total-unread="totalUnread" @open-about="openAbout" @toggle-sidebar="sidebarOpen = !sidebarOpen" />

    <div class="flex flex-1 overflow-hidden relative">

      <!-- Mobile/portrait backdrop -->
      <Transition
        enter-active-class="transition-opacity duration-300"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <div
          v-if="sidebarOpen"
          class="fixed inset-0 bg-black/40 z-30"
          :class="isPortrait ? '' : 'lg:hidden'"
          @click="closeSidebar"
        ></div>
      </Transition>

      <!-- Sidebar — fixed overlay on mobile and portrait screens, inline on landscape desktop -->
      <div
        class="fixed top-0 left-0 bottom-0 z-40 transition-transform duration-300"
        :class="[
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          isPortrait ? '' : 'lg:relative lg:translate-x-0 lg:flex lg:z-auto'
        ]"
      >
        <PeerList @peer-selected="closeSidebar" />
      </div>

      <ChatPanel />
    </div>

    <!-- Status bar -->
    <div class="bg-slate-800 text-slate-400 px-4 py-0.5 text-[11px] truncate flex-shrink-0 h-6">
      {{ peersStore.statusText }}
    </div>

  </div>

  <!-- Portalled overlays (outside the main layout so they don't affect flex) -->
  <WelcomeModal ref="welcomeModal" />
  <IncomingCall />
  <CallBar />
  <ScreenShare />
  <ShareTargetModal v-if="sharedFiles.length > 0" :files="sharedFiles" @close="clearSharedFiles" />

</template>
