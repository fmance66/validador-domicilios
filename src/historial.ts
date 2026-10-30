import { ref, watch } from 'vue'
import type { EntradaDomicilio, Nivel, Veredicto } from './nomenclador/index.ts'

export interface Busqueda {
  entrada: EntradaDomicilio
  /** Cómo se muestra en la lista: la forma normalizada o, si no hubo, lo escrito. */
  texto: string
  veredicto: Veredicto
  nivelAlcanzado: Nivel | null
  titulo: string
  fecha: string
}

const CLAVE = 'nomenclador.historial'
const MAXIMO = 15

function leer(): Busqueda[] {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as unknown
    return Array.isArray(guardado) ? (guardado as Busqueda[]) : []
  } catch {
    return []
  }
}

/** Últimas búsquedas, solo en este navegador. */
export const historial = ref<Busqueda[]>(leer())

watch(
  historial,
  (valor) => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(valor))
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): el historial dura lo que la pestaña.
    }
  },
  { deep: true },
)

export function registrar(busqueda: Omit<Busqueda, 'fecha'>) {
  const clave = JSON.stringify(busqueda.entrada)
  historial.value = [
    { ...busqueda, fecha: new Date().toISOString() },
    ...historial.value.filter((b) => JSON.stringify(b.entrada) !== clave),
  ].slice(0, MAXIMO)
}

export function vaciarHistorial() {
  historial.value = []
}
