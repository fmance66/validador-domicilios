/**
 * Cliente mínimo de la API Georef (GET, con caché en memoria). La URL base es configurable:
 * la API pública sirve para el prototipo; con domicilios reales, solo una instancia autoalojada.
 */

export const GEOREF_PUBLICA = 'https://apis.datos.gob.ar/georef/api/v2.1'

export type RecursoGeoref =
  | 'provincias'
  | 'departamentos'
  | 'localidades-censales'
  | 'localidades'
  | 'asentamientos'
  | 'calles'
  | 'direcciones'
  | 'ubicacion'

export type Parametros = Record<string, string | number | undefined>

export class ErrorGeoref extends Error {
  readonly estado: number | null

  constructor(mensaje: string, estado: number | null) {
    super(mensaje)
    this.name = 'ErrorGeoref'
    this.estado = estado
  }
}

export interface OpcionesClienteGeoref {
  /** Vacío o ausente: API pública. */
  baseUrl?: string | undefined
  fetch?: typeof fetch
}

export class ClienteGeoref {
  readonly baseUrl: string
  readonly #fetch: typeof fetch
  readonly #cache = new Map<string, Promise<unknown>>()
  /** Pedidos HTTP realizados (sin contar los que resolvió la caché). */
  pedidos = 0

  constructor(opciones: OpcionesClienteGeoref = {}) {
    this.baseUrl = (opciones.baseUrl || GEOREF_PUBLICA).replace(/\/+$/, '')
    this.#fetch = opciones.fetch ?? globalThis.fetch.bind(globalThis)
  }

  consultar<T>(recurso: RecursoGeoref, parametros: Parametros): Promise<T> {
    const consulta = new URLSearchParams()
    for (const [clave, valor] of Object.entries(parametros).sort(([a], [b]) => a.localeCompare(b))) {
      if (valor !== undefined && valor !== '') consulta.set(clave, String(valor))
    }
    const url = `${this.baseUrl}/${recurso}?${consulta}`
    let pendiente = this.#cache.get(url) as Promise<T> | undefined
    if (!pendiente) {
      pendiente = this.#pedir<T>(url, recurso)
      this.#cache.set(url, pendiente)
      // Un error no queda en caché: el próximo intento vuelve a pedir.
      pendiente.catch(() => this.#cache.delete(url))
    }
    return pendiente
  }

  async #pedir<T>(url: string, recurso: RecursoGeoref): Promise<T> {
    this.pedidos++
    let respuesta: Response
    try {
      respuesta = await this.#fetch(url)
    } catch (error) {
      throw new ErrorGeoref(`No se pudo conectar con Georef (${this.baseUrl}): ${String(error)}`, null)
    }
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '')
      throw new ErrorGeoref(`Georef respondió ${respuesta.status} en /${recurso}: ${cuerpo.slice(0, 300)}`, respuesta.status)
    }
    return (await respuesta.json()) as T
  }
}

// --- Formas de las respuestas (solo los campos que se usan) -----------------------------------

export interface Entidad {
  id: string | null
  nombre: string | null
}

export interface DireccionGeoref {
  altura: { valor: number | null }
  calle: Entidad & { categoria?: string | null }
  departamento: Entidad
  localidad_censal: Entidad
  /** Localidad BAHRA (en CABA, el barrio). */
  localidad: Entidad
  provincia: Entidad
  nomenclatura: string
  ubicacion: { lat: number | null; lon: number | null }
  /** Solo en direcciones "calle y cruce" o "calle entre A y B". */
  calle_cruce_1?: Entidad
  calle_cruce_2?: Entidad
}

export interface Tramo {
  inicio: { derecha: number; izquierda: number }
  fin: { derecha: number; izquierda: number }
}

export interface CalleGeoref {
  id: string
  nombre: string
  categoria: string | null
  altura: Tramo
  departamento: Entidad
  localidad_censal: Entidad
  localidad: Entidad
  provincia: Entidad
  nomenclatura: string
}

export interface LugarGeoref {
  id: string
  nombre: string
  categoria?: string | null
  provincia: Entidad
  departamento: Entidad
  /** Presente en localidades BAHRA y asentamientos; ausente en las localidades censales. */
  localidad_censal?: Entidad
  centroide: { lat: number; lon: number }
}

export interface DepartamentoGeoref {
  id: string
  nombre: string
  provincia: Entidad
}
