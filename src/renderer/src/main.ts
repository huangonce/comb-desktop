import { createApp } from 'vue'
import { Quasar, Dialog, Notify } from 'quasar'

// Quasar css
import '@quasar/extras/material-icons/material-icons.css'
import '@quasar/extras/material-icons-outlined/material-icons-outlined.css'
import 'quasar/src/css/index.sass'

import App from './App.vue'

const app = createApp(App)

app.use(Quasar, {
  plugins: {
    Dialog,
    Notify
  }, // import Quasar plugins and add here
  config: {
    brand: {}
  }
})

app.mount('#app')
