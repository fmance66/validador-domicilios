import { simplificar } from './texto.ts'

export interface Provincia {
  /** ID de Georef (código INDEC). */
  id: string
  nombre: string
  /** Letra de la provincia en el Código Postal Argentino (CPA) y en ISO 3166-2:AR. */
  letraCpa: string
  /** Otras formas en que se suele escribir. */
  alias: string[]
}

export const PROVINCIAS: readonly Provincia[] = [
  { id: '02', nombre: 'Ciudad Autónoma de Buenos Aires', letraCpa: 'C', alias: ['CABA', 'Capital Federal', 'Capital', 'Ciudad de Buenos Aires', 'C.A.B.A.'] },
  { id: '06', nombre: 'Buenos Aires', letraCpa: 'B', alias: ['Provincia de Buenos Aires', 'Pcia. de Buenos Aires', 'Bs. As.', 'Bs As', 'PBA'] },
  { id: '10', nombre: 'Catamarca', letraCpa: 'K', alias: [] },
  { id: '14', nombre: 'Córdoba', letraCpa: 'X', alias: ['Cba'] },
  { id: '18', nombre: 'Corrientes', letraCpa: 'W', alias: ['Ctes'] },
  { id: '22', nombre: 'Chaco', letraCpa: 'H', alias: [] },
  { id: '26', nombre: 'Chubut', letraCpa: 'U', alias: [] },
  { id: '30', nombre: 'Entre Ríos', letraCpa: 'E', alias: [] },
  { id: '34', nombre: 'Formosa', letraCpa: 'P', alias: [] },
  { id: '38', nombre: 'Jujuy', letraCpa: 'Y', alias: [] },
  { id: '42', nombre: 'La Pampa', letraCpa: 'L', alias: [] },
  { id: '46', nombre: 'La Rioja', letraCpa: 'F', alias: [] },
  { id: '50', nombre: 'Mendoza', letraCpa: 'M', alias: ['Mza'] },
  { id: '54', nombre: 'Misiones', letraCpa: 'N', alias: [] },
  { id: '58', nombre: 'Neuquén', letraCpa: 'Q', alias: ['Nqn'] },
  { id: '62', nombre: 'Río Negro', letraCpa: 'R', alias: [] },
  { id: '66', nombre: 'Salta', letraCpa: 'A', alias: [] },
  { id: '70', nombre: 'San Juan', letraCpa: 'J', alias: [] },
  { id: '74', nombre: 'San Luis', letraCpa: 'D', alias: [] },
  { id: '78', nombre: 'Santa Cruz', letraCpa: 'Z', alias: [] },
  { id: '82', nombre: 'Santa Fe', letraCpa: 'S', alias: ['Sta. Fe', 'Sta Fe'] },
  { id: '86', nombre: 'Santiago del Estero', letraCpa: 'G', alias: ['Sgo. del Estero', 'Santiago'] },
  { id: '90', nombre: 'Tucumán', letraCpa: 'T', alias: ['Tucuman'] },
  { id: '94', nombre: 'Tierra del Fuego, Antártida e Islas del Atlántico Sur', letraCpa: 'V', alias: ['Tierra del Fuego', 'TDF'] },
]

export const ID_CABA = '02'

export function provinciaPorId(id: string): Provincia | undefined {
  return PROVINCIAS.find((p) => p.id === id)
}

/** Reconoce una provincia escrita a mano ("CABA", "Bs. As.", "cordoba"). */
export function buscarProvincia(texto: string): Provincia | undefined {
  const buscado = simplificar(texto).replace(/\./g, '')
  if (!buscado) return undefined
  return PROVINCIAS.find((p) =>
    [p.nombre, ...p.alias].some((n) => simplificar(n).replace(/\./g, '') === buscado),
  )
}
