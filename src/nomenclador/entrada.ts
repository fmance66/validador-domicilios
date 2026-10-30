/** Domicilio tal como se escribe en el formulario (todo texto, como llega de un sistema). */
export interface EntradaDomicilio {
  calle: string
  /** Número de puerta; vacío o "S/N" si no tiene. */
  altura: string
  piso: string
  depto: string
  /** Calles que cruzan la cuadra, "Zapiola y Chivilcoy" (opcional). */
  entreCalles: string
  codigoPostal: string
  /** Localidad, barrio o paraje. */
  localidad: string
  /** Departamento o partido (opcional). */
  departamento: string
  /** ID de Georef de la provincia. */
  provinciaId: string
}

export const entradaVacia = (): EntradaDomicilio => ({
  calle: '',
  altura: '',
  piso: '',
  depto: '',
  entreCalles: '',
  codigoPostal: '',
  localidad: '',
  departamento: '',
  provinciaId: '',
})

/** Altura como número; null si no hay o es "S/N". */
export function alturaNumerica(altura: string): number | null {
  const limpia = altura.trim()
  if (!/^\d{1,6}$/.test(limpia)) return null
  const numero = Number(limpia)
  return numero > 0 ? numero : null
}

/** Las dos calles de "Zapiola y Chivilcoy" (también "Zapiola / Chivilcoy"); null si no son dos. */
export function separarEntreCalles(texto: string | undefined): [string, string] | null {
  const partes = (texto ?? '')
    .trim()
    .replace(/^(?:entre\s+(?!r[ií]os\b)|e\/\s*)/i, '')
    .split(/\s+[ye]\s+|\s*[/&]\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
  return partes.length === 2 ? [partes[0]!, partes[1]!] : null
}

export const sinNumero = (altura: string) => /^s\s*\/?\s*n[°º]?$/i.test(altura.trim())
