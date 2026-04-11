<script setup>
import { ref, onMounted } from 'vue'

const WELCOME_KEY = 'shareByAirWelcomeSeen'
const visible     = ref(false)

function show() { visible.value = true }
function hide() {
  visible.value = false
  localStorage.setItem(WELCOME_KEY, '1')
}

onMounted(() => {
  if (!localStorage.getItem(WELCOME_KEY)) setTimeout(show, 300)
})

defineExpose({ show })

const features = [
  {
    icon: '🏠',
    title: 'Never leaves your network',
    body:  'Data travels directly between devices on the same Wi-Fi. It never touches Google, Amazon, or any cloud server.',
  },
  {
    icon: '✈️',
    title: 'Works without internet',
    body:  'Once connected, turn off your router\'s internet — transfers keep going. You only need the local network.',
  },
  {
    icon: '⚡',
    title: 'Blazing fast transfers',
    body:  'No round-trip to a remote server. Data moves at your local network speed — often 100–1000 Mbps.',
  },
  {
    icon: '🔒',
    title: 'End-to-end encrypted',
    body:  'Built on WebRTC — every byte is encrypted in transit. Nobody in between can read your data.',
  },
  {
    icon: '👁️',
    title: 'Zero tracking, zero accounts',
    body:  'No sign-up, no ads, no telemetry. Open source and self-hosted — you own the server.',
  },
  {
    icon: '📡',
    title: 'Same network only',
    body:  'Peers on other networks or VLANs can\'t see you. Only devices on your Wi-Fi show up.',
  },
]

const ecoBadges = ['💧 No water wasted', '⚡ No idle electricity', '🗑️ No server storage', '♻️ Zero carbon footprint']
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 bg-slate-900/75 backdrop-blur-md z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
        @click.self="hide"
      >
        <Transition
          enter-active-class="transition-all duration-300"
          enter-from-class="opacity-0 translate-y-4 scale-[0.98]"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-[0.98]"
        >
          <div
            v-if="visible"
            class="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-2xl overflow-hidden my-0 sm:my-4 flex flex-col"
            style="max-height: calc(var(--vh, 1vh) * 100); max-height: 100svh;"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >

            <!-- ── Hero ── -->
            <div class="bg-gradient-to-br from-indigo-500 to-purple-600 px-6 py-7 sm:py-9 text-center text-white flex-shrink-0">
              <div class="flex justify-center mb-3">
                <svg width="52" height="52" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="25" cy="25" r="15" fill="rgba(255,255,255,0.9)"/>
                  <circle cx="75" cy="25" r="15" fill="rgba(255,255,255,0.9)"/>
                  <circle cx="50" cy="75" r="15" fill="rgba(255,255,255,0.9)"/>
                  <path d="M 25 25 L 50 75 M 75 25 L 50 75 M 25 25 L 75 25" stroke="rgba(255,255,255,0.5)" stroke-width="4" fill="none"/>
                </svg>
              </div>
              <h1 id="modal-title" class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">✈️ Share by Air</h1>
              <p class="text-xs sm:text-sm opacity-90 tracking-wide">Your data never leaves your hands.</p>
            </div>

            <!-- ── Scrollable body ── -->
            <div class="overflow-y-auto flex-1">
              <div class="px-5 sm:px-8 pt-5 sm:pt-7 pb-6 sm:pb-8">

                <p class="text-slate-500 text-sm leading-relaxed text-center mb-5 sm:mb-6">
                  Share files and messages with anyone on your Wi-Fi — without touching the internet.
                  Your data stays between you and the person you're talking to. Always.
                </p>

                <!-- Feature grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-4 sm:mb-5">
                  <div
                    v-for="f in features"
                    :key="f.title"
                    class="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-3.5
                           hover:border-indigo-300 hover:shadow-sm transition-all"
                  >
                    <span class="text-xl sm:text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">{{ f.icon }}</span>
                    <div>
                      <strong class="text-xs font-bold text-slate-700 block">{{ f.title }}</strong>
                      <span class="text-xs text-slate-500 leading-relaxed mt-0.5 block">{{ f.body }}</span>
                    </div>
                  </div>

                  <!-- Eco card — full width -->
                  <div class="sm:col-span-2 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50
                              border-2 border-green-300 rounded-xl p-4 sm:p-5
                              hover:border-green-400 hover:shadow-sm transition-all">
                    <div class="flex flex-col items-center text-center gap-3">
                      <span class="text-4xl animate-eco-pulse" aria-hidden="true">🌍</span>
                      <div>
                        <strong class="text-sm sm:text-base font-extrabold text-green-900 block mb-1.5">
                          You're literally saving the planet
                        </strong>
                        <p class="text-xs text-green-800 leading-relaxed">
                          Every file sent here skips the data center entirely. Data centers burn through
                          <strong class="text-green-900">hundreds of billions of litres of water</strong> and
                          <strong class="text-green-900">hundreds of terawatt-hours of electricity</strong>
                          every year — just to store files that sit on servers forever.
                          Peer-to-peer means your data lives nowhere except the two devices talking to each other.
                          No idle servers. No permanent copies. The planet thanks you.
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                        <span
                          v-for="b in ecoBadges"
                          :key="b"
                          class="bg-white/80 border border-green-300 text-green-800 text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full"
                        >{{ b }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Footer -->
                <div class="border-t border-slate-100 pt-5 flex flex-col items-center gap-3">
                  <p class="text-xs text-slate-400">Got a question or found a bug?</p>
                  <a
                    href="https://github.com/manishdalal2/peerjs-server-byip/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700
                           text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-lg
                           transition hover:-translate-y-0.5"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    Open an issue on GitHub
                  </a>

                  <button
                    @click="hide"
                    class="bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold
                           px-10 py-3 rounded-full text-sm shadow-lg shadow-indigo-200/60
                           hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0
                           transition w-full max-w-xs"
                  >Get Started →</button>
                </div>

              </div>
            </div>

          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
