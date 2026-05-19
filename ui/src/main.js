import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

if (
  new URLSearchParams(window.location.search).get('stunactive') === 'true' ||
  localStorage.getItem('stunactive') === 'true'
) {
  sessionStorage.setItem('stunactive', 'true')
  localStorage.removeItem('stunactive')
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
