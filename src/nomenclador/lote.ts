import { entradaVacia, type EntradaDomicilio } from './entrada.ts'
import type { ClienteGeoref } from './georef.ts'
import { parsearDomicilio } from './parsear.ts'
import { buscarProvincia } from './provincias.ts'
import { simplificar } from './texto.ts'
import { NIVELES, validarDomicilio, type Nivel, type ResultadoValidacion, type Veredicto } from './validar.ts'

/**
 * Validación de muchos domicilios de una vez: una tabla (CSV, o lo que se pega desde Excel, que
 * llega separado por tabulaciones) con un domicilio por fila. Devuelve la misma tabla con las
 * columnas del resultado agregadas al final.
 */

// --- Leer la tabla ------------------------------------------------------------------------------

export interface Tabla {
  encabezados: string[]
  filas: string[][]
}

/** Separador más probable: el que más aparece en la primera línea (fuera de comillas). */
function detectarSeparador(linea: string): string {
  const sinComillas = linea.replace(/"[^"]*"/g, '')
  const candidatos = ['\t', ';', ',']
  return candidatos.reduce((mejor, s) => (sinComillas.split(s).length > sinComillas.split(mejor).length ? s : mejor), '\t')
}

/** CSV con comillas dobles ("" es una comilla adentro); el separador se detecta solo. */
export function leerTabla(texto: string): Tabla {
  const limpio = texto.replace(/^﻿/, '')
  const primera = limpio.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const separador = detectarSeparador(primera)
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]!
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"' && campo === '') comillas = true
    else if (c === separador) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else campo += c
  }
  if (campo || fila.length) {
    fila.push(campo)
    filas.push(fila)
  }
  const conDatos = filas.map((f) => f.map((v) => v.trim())).filter((f) => f.some(Boolean))
  if (!conDatos.length) return { encabezados: [], filas: [] }

  // Sin encabezados reconocibles, la primera fila ya es un domicilio y la tabla es de una columna.
  const [primeraFila, ...resto] = conDatos
  if (!primeraFila!.some((e) => campoDeEncabezado(e))) {
    const ancho = Math.max(...conDatos.map((f) => f.length))
    return { encabezados: Array.from({ length: ancho }, (_, i) => (i === 0 ? 'domicilio' : `columna ${i + 1}`)), filas: conDatos }
  }
  return { encabezados: primeraFila!, filas: resto }
}

// --- Columnas -----------------------------------------------------------------------------------

/** `linea`: el domicilio entero en una columna ("Av. Callao 500, CABA"). */
export type CampoColumna = keyof EntradaDomicilio | 'linea' | 'provincia'

const NOMBRES_COLUMNA: [CampoColumna, string[]][] = [
  ['linea', ['domicilio', 'direccion', 'domicilio completo', 'direccion completa']],
  ['calle', ['calle', 'via']],
  ['altura', ['altura', 'numero', 'nro', 'num', 'puerta']],
  ['piso', ['piso']],
  ['depto', ['depto', 'dpto', 'dto', 'unidad', 'oficina']],
  ['entreCalles', ['entre calles', 'entrecalles', 'entre']],
  ['codigoPostal', ['cp', 'codigo postal', 'cod postal', 'cpa']],
  ['localidad', ['localidad', 'barrio', 'ciudad']],
  ['departamento', ['departamento', 'partido', 'comuna']],
  ['provincia', ['provincia', 'pcia', 'jurisdiccion']],
]

export function campoDeEncabezado(encabezado: string): CampoColumna | null {
  const nombre = simplificar(encabezado).replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim()
  return NOMBRES_COLUMNA.find(([, nombres]) => nombres.includes(nombre))?.[0] ?? null
}

/** Qué columna es cada campo; con `linea`, el resto de las columnas completa lo que falte. */
export function mapearColumnas(encabezados: string[]): Partial<Record<CampoColumna, number>> {
  const mapeo: Partial<Record<CampoColumna, number>> = {}
  encabezados.forEach((e, i) => {
    const campo = campoDeEncabezado(e)
    if (campo && mapeo[campo] === undefined) mapeo[campo] = i
  })
  return mapeo
}

export function entradaDeFila(fila: string[], mapeo: Partial<Record<CampoColumna, number>>): EntradaDomicilio {
  const valor = (campo: CampoColumna) => (mapeo[campo] === undefined ? '' : (fila[mapeo[campo]] ?? '').trim())
  const entrada = valor('linea') ? parsearDomicilio(valor('linea')) : entradaVacia()
  for (const campo of Object.keys(entradaVacia()) as (keyof EntradaDomicilio)[]) {
    if (campo !== 'provinciaId' && valor(campo)) entrada[campo] = valor(campo)
  }
  const provincia = valor('provincia') || valor('provinciaId')
  if (provincia) entrada.provinciaId = buscarProvincia(provincia)?.id ?? (/^\d{2}$/.test(provincia) ? provincia : '')
  return entrada
}

// --- Validar ------------------------------------------------------------------------------------

export interface ResultadoFila {
  entrada: EntradaDomicilio
  resultado: ResultadoValidacion | null
  /** Error de conexión o de Georef (la fila se puede reintentar). */
  error: string | null
}

export interface OpcionesLote {
  /** Domicilios validándose a la vez (default 2: la API pública tiene límites de uso). */
  concurrencia?: number
  /** Espera entre un domicilio y el siguiente, en cada hilo (default 150 ms). */
  pausaMs?: number
  alAvanzar?: (hechos: number, total: number, fila: ResultadoFila, indice: number) => void
  senal?: AbortSignal
}

/** Valida en orden, de a pocos a la vez. Con la señal abortada, las filas pendientes quedan en null. */
export async function validarLote(
  cliente: ClienteGeoref,
  entradas: EntradaDomicilio[],
  opciones: OpcionesLote = {},
): Promise<(ResultadoFila | null)[]> {
  const { concurrencia = 2, pausaMs = 150, alAvanzar, senal } = opciones
  const resultados: (ResultadoFila | null)[] = entradas.map(() => null)
  let siguiente = 0
  let hechos = 0
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

  async function hilo() {
    while (siguiente < entradas.length && !senal?.aborted) {
      const i = siguiente++
      const entrada = entradas[i]!
      let fila: ResultadoFila
      if (!entrada.provinciaId) {
        fila = { entrada, resultado: null, error: 'Falta la provincia (o no se reconoció).' }
      } else {
        try {
          // Sin la cuadra: son dos consultas más por fila y en el lote no hay mapa.
          fila = { entrada, resultado: await validarDomicilio(cliente, entrada, { cuadra: false }), error: null }
        } catch (e) {
          fila = { entrada, resultado: null, error: e instanceof Error ? e.message : String(e) }
        }
      }
      resultados[i] = fila
      alAvanzar?.(++hechos, entradas.length, fila, i)
      if (pausaMs && siguiente < entradas.length) await esperar(pausaMs)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, entradas.length) }, hilo))
  return resultados
}

// --- Resumen ------------------------------------------------------------------------------------

export interface ResumenLote {
  total: number
  porVeredicto: Record<Veredicto, number>
  errores: number
  /**
   * Cuántos llegaron exactamente hasta cada nivel (null: ni la provincia), separados por veredicto:
   * un domicilio puede validar la calle hasta la ubicación y ser inválido por otro dato (el CP).
   */
  porNivel: { nivel: Nivel | null; cantidad: number; porVeredicto: Record<Veredicto, number> }[]
}

export function resumirLote(filas: (ResultadoFila | null)[]): ResumenLote {
  const hechas = filas.filter((f) => f !== null)
  const porVeredicto: Record<Veredicto, number> = { valido: 0, parcial: 0, invalido: 0 }
  const vacio = (): Record<Veredicto, number> => ({ valido: 0, parcial: 0, invalido: 0 })
  const porNivel = new Map<Nivel | null, Record<Veredicto, number>>([[null, vacio()], ...NIVELES.map((n) => [n.id, vacio()] as const)])
  let errores = 0
  for (const f of hechas) {
    if (!f.resultado) {
      errores++
      continue
    }
    porVeredicto[f.resultado.veredicto]++
    porNivel.get(f.resultado.nivelAlcanzado)![f.resultado.veredicto]++
  }
  return {
    total: hechas.length,
    porVeredicto,
    errores,
    porNivel: [...porNivel].map(([nivel, v]) => ({ nivel, cantidad: v.valido + v.parcial + v.invalido, porVeredicto: v })),
  }
}

// --- Escribir la tabla de salida ----------------------------------------------------------------

export const COLUMNAS_RESULTADO = [
  'veredicto',
  'nivel_alcanzado',
  'niveles_validados',
  'titulo',
  'motivo',
  'forma_normalizada',
  'provincia_id',
  'departamento_id',
  'localidad_id',
  'calle_id',
  'lat',
  'lon',
  'precision_ubicacion',
] as const

const VEREDICTO_TEXTO: Record<Veredicto, string> = { valido: 'válido', parcial: 'parcial', invalido: 'inválido' }

export function columnasDeResultado(fila: ResultadoFila | null): string[] {
  if (!fila) return ['sin validar', ...Array<string>(COLUMNAS_RESULTADO.length - 1).fill('')]
  const r = fila.resultado
  if (!r) return ['error', '', '', 'No se pudo validar', fila.error ?? '', ...Array<string>(COLUMNAS_RESULTADO.length - 5).fill('')]
  const id = (nivel: Nivel) => r.pasos.find((p) => p.nivel === nivel)?.id ?? ''
  const indice = NIVELES.findIndex((n) => n.id === r.nivelAlcanzado) + 1
  return [
    VEREDICTO_TEXTO[r.veredicto],
    NIVELES.find((n) => n.id === r.nivelAlcanzado)?.titulo ?? 'ninguno',
    `${indice}/${NIVELES.length}`,
    r.titulo,
    r.resumen,
    r.nomenclatura ?? '',
    id('provincia'),
    id('departamento'),
    id('localidad'),
    id('calle'),
    r.ubicacion ? r.ubicacion.lat.toFixed(6) : '',
    r.ubicacion ? r.ubicacion.lon.toFixed(6) : '',
    r.ubicacion?.precision ?? '',
  ]
}

/**
 * CSV para abrir con doble clic en Excel en castellano: separado por punto y coma, con BOM (si
 * no, Excel lee mal los acentos) y comillas donde hagan falta.
 */
export function escribirCsv(filas: string[][]): string {
  const celda = (v: string) => (/[;"\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n'
}

export function tablaDeSalida(tabla: Tabla, resultados: (ResultadoFila | null)[]): string[][] {
  const ancho = tabla.encabezados.length
  return [
    [...tabla.encabezados, ...COLUMNAS_RESULTADO],
    ...tabla.filas.map((f, i) => [...f, ...Array<string>(Math.max(0, ancho - f.length)).fill(''), ...columnasDeResultado(resultados[i] ?? null)]),
  ]
}
