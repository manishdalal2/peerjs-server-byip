<script setup>
import { ref, watch, nextTick } from 'vue'
import { usePinPrompt } from '../composables/usePinPrompt.js'

const { visible, label, submit, cancel } = usePinPrompt()
const pin     = ref('')
const inputEl = ref(null)

watch(visible, async v => {
  if (v) { pin.value = ''; await nextTick(); inputEl.value?.focus() }
})

function onSubmit() {
  if (!pin.value.trim()) return
  const value = pin.value
  pin.value = ''
  submit(value)
}

function onCancel() {
  pin.value = ''
  cancel()
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
        @click.self="onCancel"
      >
        <div class="bg-white rounded-xl shadow-2xl p-6 w-80 max-w-[90vw]">
          <h3 class="text-sm font-semibold text-slate-800 mb-1">PIN required</h3>
          <p class="text-xs text-slate-500 mb-4 truncate">{{ label }}</p>
          <input
            ref="inputEl"
            v-model="pin"
            type="password"
            placeholder="Enter PIN"
            autocomplete="off"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
            @keydown.enter="onSubmit"
            @keydown.esc="onCancel"
          />
          <div class="flex gap-2 justify-end">
            <button
              @click="onCancel"
              class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >Cancel</button>
            <button
              @click="onSubmit"
              class="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700
                     text-white rounded-lg transition-colors"
            >Connect</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
