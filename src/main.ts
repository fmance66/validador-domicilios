import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '@material-symbols/font-400/outlined.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import OpenVue from 'openvue/config'
import { createApp } from 'vue'
import App from './App.vue'
import './estilos.css'
import { TEMA } from './tema.ts'

createApp(App).use(OpenVue, { theme: TEMA }).mount('#app')
