import { definePreset } from '@openvue/themes'
import Aura from '@openvue/themes/aura'

/** Aura con el azul de la barra y del ícono como color principal. */
const Preset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef7fb',
      100: '#d5ebf4',
      200: '#afd8e9',
      300: '#7cbfd9',
      400: '#3f9cc0',
      500: '#0d658b',
      600: '#0b587a',
      700: '#094a67',
      800: '#083d55',
      900: '#062f42',
      950: '#041f2c',
    },
  },
})

/** Solo tema claro: los colores propios de estilos.css no tienen versión oscura. */
export const TEMA = { preset: Preset, options: { darkModeSelector: 'none' } }
