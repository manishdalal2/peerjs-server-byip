<script setup>
import { ref, onMounted } from 'vue'

const visible = ref(false)

onMounted(() => {
  // Show after 3 seconds on every page load
  setTimeout(() => { visible.value = true }, 3000)
})

function dismiss() {
  visible.value = false
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-500 ease-out"
    enter-from-class="opacity-0 translate-y-6 scale-95"
    leave-active-class="transition-all duration-300 ease-in"
    leave-to-class="opacity-0 translate-y-6 scale-95"
  >
    <div
      v-if="visible"
      class="fixed bottom-10 right-5 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
    >
      <!-- Gradient header -->
      <div class="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-5 py-4 relative">
        <button
          @click="dismiss"
          aria-label="Dismiss"
          class="absolute top-3 right-3 text-white/60 hover:text-white text-xl leading-none transition"
        >&times;</button>
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-sm border border-white/30">
            <span class="text-white text-xl font-black">Z</span>
          </div>
          <div>
            <div class="text-white font-bold text-base leading-tight">Zoryn.ai</div>
            <div class="text-white/75 text-xs mt-0.5">Think It. Say It. It's done.</div>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="p-5">
        <p class="text-sm font-semibold text-slate-800 mb-1">Voice → polished text, instantly</p>
        <p class="text-xs text-slate-500 leading-relaxed mb-4">
          Zoryn turns your spoken thoughts into formatted, ready-to-use text — right where your cursor is.
          No cleanup. No copy-paste. Works in Slack, email, code editors, and more.
        </p>

        <!-- Feature pills -->
        <div class="flex flex-wrap gap-1.5 mb-4">
          <span class="text-[11px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">&#127897; Context-aware</span>
          <span class="text-[11px] px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 font-medium">&#128274; Local-first</span>
          <span class="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">&#9889; 10ms latency</span>
        </div>

        <!-- CTA -->
        <div class="flex gap-2">
          <a
            href="https://zoryn.ai"
            target="_blank"
            rel="noopener noreferrer"
            @click="dismiss"
            class="flex-1 text-center text-sm font-bold py-2.5 rounded-xl
                   bg-gradient-to-r from-violet-600 to-indigo-600
                   hover:from-violet-700 hover:to-indigo-700
                   text-white transition shadow-md shadow-indigo-200"
          >Try Zoryn.ai Free →</a>
          <button
            @click="dismiss"
            class="text-xs px-4 py-2.5 rounded-xl border border-slate-200 text-slate-400
                   hover:text-slate-600 hover:bg-slate-50 transition"
          >Later</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
