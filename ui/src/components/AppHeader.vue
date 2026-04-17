<script setup>
import { computed } from 'vue'
import { usePeersStore } from '../stores/peers.js'

defineProps({ sidebarOpen: Boolean, forceOverlay: Boolean, totalUnread: { type: Number, default: 0 } })
defineEmits(['open-about', 'toggle-sidebar'])

const peers = usePeersStore()
const shortId = computed(() =>
  peers.myPeerId ? peers.myPeerId.slice(0, 8) + '…' : 'connecting…'
)
</script>

<template>
  <header class="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 sm:px-5 h-14 flex items-center justify-between shadow-lg flex-shrink-0 gap-2">

    <div class="flex items-center gap-2">
      <!-- Hamburger — mobile and portrait screens, opens peer list sidebar -->
      <button
        @click="$emit('toggle-sidebar')"
        class="relative w-9 h-9 rounded-lg flex flex-col items-center justify-center gap-1.5
               hover:bg-white/15 active:bg-white/25 transition-colors flex-shrink-0"
        :class="[sidebarOpen ? 'bg-white/20' : '', forceOverlay ? '' : 'lg:hidden']"
        aria-label="Toggle peer list"
      >
        <!-- Unread notification badge on hamburger (shown when sidebar is closed) -->
        <span
          v-if="!sidebarOpen && totalUnread > 0"
          class="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white
                 text-[8px] font-bold flex items-center justify-center px-0.5
                 ring-2 ring-indigo-500 animate-pulse pointer-events-none"
        >{{ totalUnread > 9 ? '9+' : totalUnread }}</span>
        <span
          class="block w-5 h-0.5 bg-white rounded-full transition-all duration-200"
          :class="sidebarOpen ? 'rotate-45 translate-y-2' : ''"
        ></span>
        <span
          class="block w-5 h-0.5 bg-white rounded-full transition-all duration-200"
          :class="sidebarOpen ? 'opacity-0' : ''"
        ></span>
        <span
          class="block w-5 h-0.5 bg-white rounded-full transition-all duration-200"
          :class="sidebarOpen ? '-rotate-45 -translate-y-2' : ''"
        ></span>
      </button>

      <div class="flex flex-col leading-tight">
        <h1 class="text-sm sm:text-base font-extrabold tracking-tight whitespace-nowrap">✈️ Share by Air</h1>
        <span class="hidden sm:block text-[10px] opacity-70 whitespace-nowrap">Your data never leaves your hands.</span>
      </div>
    </div>

    <div class="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 justify-end">
      <!-- Peer ID badge — hidden on very small screens -->
      <span class="hidden sm:block text-xs bg-white/15 px-3 py-1 rounded-full font-mono whitespace-nowrap">
        ID: {{ shortId }}
      </span>

      <!-- Server status -->
      <span
        class="text-xs px-2.5 py-1 rounded-full font-bold transition-colors whitespace-nowrap"
        :class="peers.serverConnected ? 'bg-emerald-400/40' : 'bg-red-400/40'"
      >
        <span class="hidden sm:inline">{{ peers.serverConnected ? '● Connected' : '○ Disconnected' }}</span>
        <span class="sm:hidden">{{ peers.serverConnected ? '●' : '○' }}</span>
      </span>

      <!-- About button -->
      <button
        @click="$emit('open-about')"
        class="w-7 h-7 rounded-full border-2 border-white/60 bg-white/15 text-white text-sm font-bold
               hover:bg-white/30 hover:border-white/90 transition-colors flex items-center justify-center flex-shrink-0"
        title="About Share by Air"
        aria-label="About Share by Air"
      >?</button>

      <!-- Buy me a coffee -->
      <a
        href="https://www.buymeacoffee.com/mdalal"
        target="_blank"
        rel="noopener noreferrer"
        class="hidden sm:block flex-shrink-0"
      >
        <img
          src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=mdalal&button_colour=BD5FFF&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00"
          alt="Buy me a coffee"
          class="h-8 rounded-md"
        />
      </a>
    </div>

  </header>
</template>
