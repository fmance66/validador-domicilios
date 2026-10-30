import type { EntradaDomicilio } from './entrada.ts'
import type { ClienteGeoref, Entidad, LugarGeoref } from './georef.ts'
import { distanciaMetros } from './validar.ts'

/**
 * Consulta de un punto (clic en el mapa, coordenadas o un enlace de Google Maps): en qué
 * provincia, departamento y localidad cae. Georef no hace geocodificación inversa de calles:
 * `/ubicacion` llega al departamento y al gobierno local, y la localidad es la más cercana por
 * su centro, así que es orientativa.
 */

export interface Punto {
  lat: number
  lon: number
}

export interface ConsultaPunto {
  punto: Punto
  /** null: el punto está fuera de la Argentina (o en el mar). */
  provincia: Entidad | null
  departamento: Entidad | null
  gobiernoLocal: Entidad | null
  /** Localidad (en CABA, el barrio) con el centro más cercano al punto, dentro del departamento. */
  localidadCercana: { id: string; nombre: string; metros: number } | null
}

// --- Leer coordenadas ---------------------------------------------------------------------------

const NUMERO = String.raw`[-+]?\d{1,3}(?:[.,]\d+)?`
/** "-34.6037, -58.3816", "-34.6037 -58.3816" o "-34,6037; -58,3816" (coma decimal con punto y coma). */
const PAR = new RegExp(String.raw`^\s*(${NUMERO})\s*[,;\s]\s*(${NUMERO})\s*$`)
const PAR_PUNTO = new RegExp(String.raw`^\s*([-+]?\d{1,3}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)\s*$`)

/** Formas en que Google Maps pone el punto en la URL, de la más precisa a la menos. */
const EN_ENLACE = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // el lugar marcado
  /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // ?q=-34.6,-58.4
  /@(-?\d+\.\d+),(-?\d+\.\d+)/, // el centro de la vista
]

/** Enlaces cortos (maps.app.goo.gl): no traen el punto y el navegador no los puede abrir para verlo. */
export const esEnlaceCorto = (texto: string) => /^\s*https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(texto)

const valido = (p: Punto) => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180

/** Coordenadas escritas o en un enlace de Google Maps; null si el texto no es eso. */
export function leerCoordenadas(texto: string): Punto | null {
  let limpio = texto.trim()
  try {
    limpio = decodeURIComponent(limpio)
  } catch {
    // Un % suelto: se usa tal cual.
  }
  if (/^https?:\/\//i.test(limpio)) {
    for (const patron of EN_ENLACE) {
      const m = patron.exec(limpio)
      if (m) {
        const p = { lat: Number(m[1]), lon: Number(m[2]) }
        if (valido(p)) return p
      }
    }
    return null
  }
  // Con coma decimal, los dos números van separados por punto y coma o espacio ("-34,6 -58,4").
  const m = PAR_PUNTO.exec(limpio) ?? PAR.exec(limpio)
  if (!m) return null
  const p = { lat: Number(m[1]!.replace(',', '.')), lon: Number(m[2]!.replace(',', '.')) }
  // Dos números sueltos que no son coordenadas ("500 3"): la latitud de la Argentina es negativa.
  return valido(p) && p.lat < 0 && p.lon < 0 ? p : null
}

// --- Consultar ----------------------------------------------------------------------------------

interface RespuestaUbicacion {
  ubicacion: { provincia: Entidad; departamento: Entidad; gobierno_local?: Entidad }
}

const entidad = (e: Entidad | undefined) => (e?.id ? e : null)

export async function consultarPunto(cliente: ClienteGeoref, punto: Punto): Promise<ConsultaPunto> {
  const { ubicacion } = await cliente.consultar<RespuestaUbicacion>('ubicacion', { lat: punto.lat, lon: punto.lon })
  const provincia = entidad(ubicacion.provincia)
  const departamento = entidad(ubicacion.departamento)
  let localidadCercana: ConsultaPunto['localidadCercana'] = null
  if (departamento) {
    const { localidades } = await cliente.consultar<{ localidades: Pick<LugarGeoref, 'id' | 'nombre' | 'centroide'>[] }>('localidades', {
      departamento: departamento.id!,
      campos: 'id,nombre,centroide',
      max: 1000,
    })
    for (const l of localidades) {
      const metros = distanciaMetros(punto, l.centroide)
      if (!localidadCercana || metros < localidadCercana.metros) localidadCercana = { id: l.id, nombre: l.nombre, metros }
    }
  }
  return { punto, provincia, departamento, gobiernoLocal: entidad(ubicacion.gobierno_local), localidadCercana }
}

/** Lo que la consulta aporta al formulario: provincia, departamento y localidad. */
export function entradaDePunto(consulta: ConsultaPunto): Partial<EntradaDomicilio> {
  return {
    provinciaId: consulta.provincia?.id ?? '',
    departamento: consulta.departamento?.nombre ?? '',
    localidad: consulta.localidadCercana?.nombre ?? '',
  }
}
