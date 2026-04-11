<script setup>
import { computed } from 'vue'
import { usePeersStore } from '../stores/peers.js'

defineEmits(['open-about'])

const peers = usePeersStore()
const shortId = computed(() =>
  peers.myPeerId ? peers.myPeerId.slice(0, 8) + '…' : 'connecting…'
)
</script>

<template>
  <header class="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 sm:px-5 h-14 flex items-center justify-between shadow-lg flex-shrink-0 gap-2">

    <h1 class="text-sm sm:text-base font-bold tracking-tight whitespace-nowrap">
      🌐 Local Bytes
    </h1>

    <div class="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
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
        title="About Local Bytes"
        aria-label="About Local Bytes"
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
