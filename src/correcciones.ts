import { ref, watch } from 'vue'
import { descargarArchivo, fechaDeHoy } from './archivos.ts'
import { distanciaMetros, type ResultadoValidacion } from './nomenclador/index.ts'

/**
 * Ubicaciones corregidas a mano sobre el mapa, cuando el punto que interpola Georef cae lejos
 * del domicilio (la numeración del callejero no siempre sigue a la de la calle). No cambian la
 * validación: es una capa encima, para que la próxima búsqueda del mismo domicilio caiga bien y
 * para juntar los casos y reportarlos.
 */
export interface Correccion {
  /** ID de calle de Georef + altura: identifica el domicilio aunque se escriba distinto. */
  clave: string
  domicilio: string
  lat: number
  lon: number
  /** Lo que devolvió Georef, para medir el desvío. */
  original: ResultadoValidacion['ubicacion']
  fecha: string
}

const CLAVE_ALMACEN = 'nomenclador.correcciones'

function leer(): Correccion[] {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_ALMACEN) ?? '[]') as unknown
    return Array.isArray(guardado) ? (guardado as Correccion[]) : []
  } catch {
    return []
  }
}

/** Correcciones hechas en este navegador, la más reciente primero. */
export const correcciones = ref<Correccion[]>(leer())

watch(
  correcciones,
  (valor) => {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(valor))
    } catch {
      // Sin almacenamiento: las correcciones duran lo que la pestaña.
    }
  },
  { deep: true },
)

/** Clave del domicilio validado; null si no se llegó a una calle (no hay con qué identificarlo). */
export function claveDe(resultado: ResultadoValidacion): string | null {
  const calle = resultado.pasos.find((p) => p.nivel === 'calle')?.id
  if (!calle) return null
  const altura = resultado.pasos.find((p) => p.nivel === 'altura')?.normalizado ?? 'S/N'
  return `${calle}|${altura}`
}

export function correccionDe(clave: string | null): Correccion | null {
  return (clave && correcciones.value.find((c) => c.clave === clave)) || null
}

export function guardarCorreccion(correccion: Omit<Correccion, 'fecha'>) {
  correcciones.value = [
    { ...correccion, fecha: new Date().toISOString() },
    ...correcciones.value.filter((c) => c.clave !== correccion.clave),
  ]
}

export function borrarCorreccion(clave: string) {
  correcciones.value = correcciones.value.filter((c) => c.clave !== clave)
}

export function vaciarCorrecciones() {
  correcciones.value = []
}

export function textoDistancia(metros: number): string {
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1).replace('.', ',')} km`
}

const esNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/**
 * Correcciones de un JSON exportado (por esta app, en este u otro navegador). Descarta lo que no
 * tenga la forma de una corrección; los campos de más (como `desvioMetros`) se ignoran.
 */
export function leerCorrecciones(texto: string): Correccion[] {
  const datos = JSON.parse(texto) as unknown
  if (!Array.isArray(datos)) throw new Error('El archivo no es una lista de correcciones.')
  return datos.flatMap((d: Record<string, unknown>) => {
    if (!d || typeof d.clave !== 'string' || !esNumero(d.lat) || !esNumero(d.lon)) return []
    const o = d.original as Record<string, unknown> | null | undefined
    const original = o && esNumero(o.lat) && esNumero(o.lon) ? (o as unknown as Correccion['original']) : null
    const fecha = typeof d.fecha === 'string' && !Number.isNaN(Date.parse(d.fecha)) ? d.fecha : new Date(0).toISOString()
    return [{ clave: d.clave, domicilio: typeof d.domicilio === 'string' ? d.domicilio : d.clave, lat: d.lat, lon: d.lon, original, fecha }]
  })
}

/** Junta dos listas: si el mismo domicilio está en las dos, queda la corrección más reciente. */
export function combinarCorrecciones(actuales: Correccion[], importadas: Correccion[]) {
  const porClave = new Map(actuales.map((c) => [c.clave, c]))
  let nuevas = 0
  let actualizadas = 0
  for (const c of importadas) {
    const actual = porClave.get(c.clave)
    if (!actual) nuevas++
    else if (c.fecha > actual.fecha) actualizadas++
    else continue
    porClave.set(c.clave, c)
  }
  const combinadas = [...porClave.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return { combinadas, nuevas, actualizadas, iguales: importadas.length - nuevas - actualizadas }
}

/** Suma a las de este navegador las correcciones de un archivo exportado por otra persona. */
export function importarCorrecciones(texto: string) {
  const { combinadas, ...cuentas } = combinarCorrecciones(correcciones.value, leerCorrecciones(texto))
  correcciones.value = combinadas
  return cuentas
}

/** Descarga las correcciones como JSON, para reportar los desvíos del callejero. */
export function exportarCorrecciones() {
  const datos = correcciones.value.map((c) => ({
    ...c,
    desvioMetros: c.original ? Math.round(distanciaMetros(c.original, c)) : null,
  }))
  descargarArchivo(`correcciones-ubicacion-${fechaDeHoy()}.json`, JSON.stringify(datos, null, 2), 'application/json')
}
