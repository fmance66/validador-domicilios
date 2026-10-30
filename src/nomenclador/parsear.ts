import { entradaVacia, type EntradaDomicilio } from './entrada.ts'
import { buscarProvincia } from './provincias.ts'

const CODIGO_POSTAL = /^(?:c\.?\s?p\.?\s*)?([a-hj-np-z]?\s?\d{4}\s?[a-z]{0,3})$/i
/** "… entre Zapiola y Chivilcoy" o "e/ Zapiola y Chivilcoy"; no "Entre Ríos" (provincia y calle). */
const ENTRE = /^(.*?)(?:^|\s+)(?:entre\s+(?!r[ií]os\b)|e\/\s*)(.+?\s(?:[ye]\s|[/&]).+)$/i
const PISO = /\b(?:piso|p\.)\s*(\w+)|\b(\d{1,2}|pb)\s*[°º]/i
const DEPTO = /\b(?:dto|depto|dpto|departamento|of|oficina|unidad|uf)\.?\s*(\w+)|[°º]\s*"?([a-z0-9]{1,3})\b/i

/**
 * Separa un domicilio escrito en una línea: "Av. Callao 500 3° B, Balvanera, CABA, C1022AAO".
 * Las calles que cruzan la cuadra van en el primer tramo o en uno propio: "… 2049 entre Zapiola y Chivilcoy".
 * Heurística: el primer tramo es calle y altura (con piso y depto); el que es una provincia
 * conocida, la provincia; el que tiene forma de código, el CP; el resto, localidad y partido.
 */
export function parsearDomicilio(texto: string): EntradaDomicilio {
  const entrada = entradaVacia()
  const tramos = texto.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean)
  if (!tramos.length) return entrada

  // "Tupungato, Mendoza": si el primer tramo no tiene número ni "S/N", es un lugar y no una calle.
  const primeroEsLugar = tramos.length > 1 && !/\d|\bs\s*\/\s*n\b|sin\s+n[uú]mero/i.test(tramos[0]!)

  const lugares: string[] = []
  for (const [i, tramo] of tramos.entries()) {
    const entre = ENTRE.exec(tramo)
    if (entre && !entrada.entreCalles) entrada.entreCalles = entre[2]!.trim()
    const sinEntre = entre ? entre[1]!.trim() : tramo
    if (!sinEntre) continue
    if (i === 0 && !primeroEsLugar) {
      const { resto, ...calle } = separarCalle(sinEntre)
      Object.assign(entrada, calle)
      // Sin comas, lo que sigue al número es el lugar: "Blanco Encalada 2851 caba".
      const lugar = separarLugar(resto)
      if (lugar.codigoPostal) entrada.codigoPostal = lugar.codigoPostal
      if (lugar.provinciaId) entrada.provinciaId = lugar.provinciaId
      if (lugar.localidad) lugares.push(lugar.localidad)
      continue
    }
    const provincia = buscarProvincia(tramo.replace(/^(?:provincia de|pcia\.? de)\s+/i, ''))
    if (provincia && !entrada.provinciaId) {
      entrada.provinciaId = provincia.id
      continue
    }
    const cp = CODIGO_POSTAL.exec(tramo)
    if (cp && !entrada.codigoPostal) {
      entrada.codigoPostal = cp[1]!.replace(/\s/g, '').toUpperCase()
      continue
    }
    lugares.push(tramo)
  }

  // "Bernal, Quilmes": localidad y partido. En CABA, "CABA" también suele ir como localidad.
  const [localidad, departamento] = lugares
  entrada.localidad = localidad ?? ''
  entrada.departamento = departamento ?? ''
  if (!entrada.provinciaId && localidad && buscarProvincia(localidad)?.id === '02') {
    entrada.provinciaId = '02'
    entrada.localidad = departamento ?? ''
    entrada.departamento = ''
  }
  return entrada
}

type CalleSeparada = Pick<EntradaDomicilio, 'calle' | 'altura' | 'piso' | 'depto'> & {
  /** Lo que sigue a la altura, sin piso ni depto. */
  resto: string
}

function separarCalle(tramo: string): CalleSeparada {
  const sn = /^(.*?)\s+(?:s\s*\/\s*n[°º]?|sin\s+n[uú]mero)(.*)$/i.exec(tramo)
  if (sn) return { calle: sn[1]!.trim(), altura: 'S/N', ...pisoDepto(sn[2]!) }

  // La altura es el primer número después de al menos una palabra: "Calle 13 1234" → calle "Calle 13".
  const m = /^(.*?[a-záéíóúñ.].*?)\s+(?:n[°º]?\s*|nro\.?\s*|n[uú]mero\s*)?(\d{1,6})\b(.*)$/i.exec(tramo)
  if (!m) return { calle: tramo, altura: '', piso: '', depto: '', resto: '' }
  let [, calle, altura, resto] = m as unknown as [string, string, string, string]
  // "Calle 13 1234": si después del número viene otro número, el primero era parte del nombre.
  const otro = /^\s+(\d{1,6})\b(.*)$/.exec(resto)
  if (otro && /\bcalle$/i.test(calle)) {
    calle = `${calle} ${altura}`
    altura = otro[1]!
    resto = otro[2]!
  }
  return { calle: calle.trim(), altura, ...pisoDepto(resto) }
}

function pisoDepto(resto: string): Pick<CalleSeparada, 'piso' | 'depto' | 'resto'> {
  const piso = PISO.exec(resto)
  const depto = DEPTO.exec(resto)
  // Se sacan del resto los dos tramos, que pueden pisarse ("3° B": "3°" y "° B").
  const quitar = [piso, depto].filter((x) => x !== null).map((x) => [x.index, x.index + x[0].length] as const)
  const sinUnidad = [...resto].filter((_, i) => !quitar.some(([desde, hasta]) => i >= desde && i < hasta)).join('')
  return {
    piso: (piso?.[1] ?? piso?.[2] ?? '').toUpperCase(),
    depto: (depto?.[1] ?? depto?.[2] ?? '').toUpperCase(),
    resto: sinUnidad.replace(/\s+/g, ' ').trim(),
  }
}

/**
 * Lugar escrito sin comas a continuación de la calle: "Quilmes Buenos Aires C1878". El CP es
 * la palabra con forma de código; la provincia, las últimas palabras que formen una (la frase
 * más larga); lo que queda, la localidad.
 */
function separarLugar(texto: string): Pick<EntradaDomicilio, 'codigoPostal' | 'provinciaId' | 'localidad'> {
  let palabras = texto.split(/\s+/).filter(Boolean)
  let codigoPostal = ''
  const iCp = palabras.findIndex((p) => /\d{4}/.test(p) && CODIGO_POSTAL.test(p))
  if (iCp >= 0) {
    codigoPostal = palabras[iCp]!.toUpperCase()
    palabras = palabras.filter((_, i) => i !== iCp)
  }
  let provinciaId = ''
  for (let desde = 0; desde < palabras.length; desde++) {
    const provincia = buscarProvincia(palabras.slice(desde).join(' ').replace(/^(?:provincia de|pcia\.? de)\s+/i, ''))
    // "San Miguel de Tucumán": "Tucumán" es parte del nombre de la localidad, no la provincia.
    if (provincia && !/\bdel?$/i.test(palabras.slice(0, desde).join(' '))) {
      provinciaId = provincia.id
      palabras = palabras.slice(0, desde)
      break
    }
  }
  return { codigoPostal, provinciaId, localidad: palabras.join(' ') }
}
