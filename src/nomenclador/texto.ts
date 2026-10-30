/** Minúsculas, sin tildes, sin signos y con espacios simples. */
export function simplificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

export const mismoNombre = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && simplificar(a) === simplificar(b)

/** Palabras completas → abreviatura que usa el callejero del INDEC (el de Georef). */
const ABREVIATURAS: Record<string, string> = {
  avenida: 'av',
  avda: 'av',
  general: 'gral',
  gobernador: 'gdor',
  presidente: 'pte',
  doctor: 'dr',
  coronel: 'cnel',
  teniente: 'tte',
  pasaje: 'pje',
  boulevard: 'bv',
  bulevar: 'bv',
  bvard: 'bv',
  diagonal: 'diag',
  comodoro: 'comod',
  intendente: 'int',
  ingeniero: 'ing',
  almirante: 'alte',
  capitan: 'cap',
  sargento: 'sgto',
  comandante: 'cdte',
  santa: 'sta',
  santo: 'sto',
}

/** Tipos de vía y conectores: no distinguen una calle de otra. */
const IRRELEVANTES = new Set(['av', 'calle', 'pje', 'bv', 'diag', 'ruta', 'camino', 'de', 'del', 'la', 'las', 'los', 'el', 'y'])

function palabras(nombre: string): string[] {
  return simplificar(nombre)
    .split(' ')
    .map((p) => ABREVIATURAS[p] ?? p)
    .filter((p) => p && !IRRELEVANTES.has(p))
}

const esNumero = (p: string) => /^\d+$/.test(p)

/**
 * ¿La calle que encontró Georef es la que se escribió, o la interpretó (búsqueda aproximada)?
 * - 2: mismas palabras (sin contar tipo de vía, abreviaturas ni la doble numeración de algunos
 *   partidos: "Rivadavia" = "13 RIVADAVIA", "Avenida General Paz" = "AV GRAL PAZ").
 * - 1: todas las palabras escritas están, completas o como inicial ("B. Rivadavia" →
 *   "BERNARDINO RIVADAVIA"), pero el nombre oficial tiene más.
 * - 0: Georef la interpretó (búsqueda aproximada): hay que mostrar la corrección.
 */
export function similitudCalle(declarada: string, encontrada: string): 0 | 1 | 2 {
  const buscadas = palabras(declarada)
  const disponibles = palabras(encontrada)
  if (!buscadas.length) return 0
  const todas = buscadas.every((b) => disponibles.some((d) => d === b || (!esNumero(b) && d.startsWith(b))))
  if (!todas) return 0
  // La numeración que el INDEC antepone ("13 RIVADAVIA") no cuenta si no se escribió.
  const letrasDisponibles = disponibles.filter((d) => !esNumero(d) || buscadas.includes(d))
  return letrasDisponibles.length === buscadas.length && buscadas.every((b) => letrasDisponibles.includes(b)) ? 2 : 1
}

/** Nombre de lugar que contiene al escrito ("San Martín" ≈ "General San Martín", "3" ≈ "Comuna 3"). */
export function lugarCoincide(declarado: string, encontrado: string | null | undefined): boolean {
  if (!encontrado) return false
  const a = ` ${simplificar(declarado)} `
  const b = ` ${simplificar(encontrado)} `
  return a.trim() !== '' && (b.includes(a) || a.includes(b))
}
