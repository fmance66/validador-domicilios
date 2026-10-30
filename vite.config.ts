import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

/**
 * Versión que se muestra en el pie: el commit y la fecha del build, para confirmar qué quedó
 * publicado en el servidor. "+cambios": se compiló con cambios sin commitear.
 */
function version() {
  const git = (comando: string) => execSync(`git ${comando}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  let commit = 'sin git'
  try {
    commit = git('rev-parse --short HEAD') + (git('status --porcelain') ? '+cambios' : '')
  } catch {
    // Fuera de un repositorio (por ejemplo, desde un .zip).
  }
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return { commit, fecha }
}

// Como variables VITE_: `define` con un nombre propio no se reemplaza en desarrollo con Vite 8.
const { commit, fecha } = version()
process.env.VITE_VERSION_COMMIT = commit
process.env.VITE_VERSION_FECHA = fecha

export default defineConfig({
  plugins: [vue()],
  // Rutas relativas: el build funciona en cualquier subcarpeta.
  base: './',
  // El worker de MapLibre es un módulo ES (importa maplibre-gl-shared.mjs).
  worker: { format: 'es' },
  server: { port: 7100, strictPort: true, open: true },
  preview: { port: 7100, strictPort: true },
  // MapLibre solo ya pesa cerca de un mega.
  build: { chunkSizeWarningLimit: 2000 },
})
