import { mount } from '@vue/test-utils'
import OpenVue from 'openvue/config'
import { defineComponent, h, type Component } from 'vue'

/**
 * Montaje para los tests de la interfaz: los componentes de OpenVue son los reales, sin tema (los
 * estilos no hacen falta para probar el comportamiento), y el mapa es un div (MapLibre necesita
 * WebGL).
 */

const MapaFalso = defineComponent({ setup: () => () => h('div', { class: 'mapa-falso' }) })

export const STUBS: Record<string, Component> = { MapaDomicilio: MapaFalso }

export function montar<T extends Component>(componente: T, opciones: Parameters<typeof mount<T>>[1] = {}) {
  return mount(componente, {
    ...opciones,
    global: {
      ...opciones.global,
      plugins: [[OpenVue, { theme: 'none' }], ...(opciones.global?.plugins ?? [])],
      stubs: { ...STUBS, ...opciones.global?.stubs },
    },
  })
}

/** Espera a que terminen las promesas pendientes (consultas al Georef falso) y se redibuje. */
export const esperarPromesas = (ms = 0) => new Promise((r) => setTimeout(r, ms))

/** El botón que contiene el texto. */
export function boton(envoltorio: ReturnType<typeof mount>, texto: string) {
  const encontrado = envoltorio.findAll('button').find((b) => b.text().includes(texto))
  if (!encontrado) throw new Error(`No hay un botón "${texto}"`)
  return encontrado
}
