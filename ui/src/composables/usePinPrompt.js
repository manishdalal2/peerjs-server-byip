import { ref } from 'vue'

const visible = ref(false)
const label   = ref('')
let _resolve  = null

export function usePinPrompt() {
  function promptForPin(promptLabel) {
    label.value   = promptLabel
    visible.value = true
    return new Promise(resolve => { _resolve = resolve })
  }

  function submit(pin) {
    visible.value = false
    _resolve?.(typeof pin === 'string' && pin.trim() ? pin.trim() : null)
    _resolve = null
  }

  function cancel() {
    visible.value = false
    _resolve?.(null)
    _resolve = null
  }

  return { visible, label, promptForPin, submit, cancel }
}
