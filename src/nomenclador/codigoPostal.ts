import { PROVINCIAS, type Provincia } from './provincias.ts'

export type ControlCodigoPostal =
  | { estado: 'sin_dato' }
  | { estado: 'formato_invalido'; detalle: string }
  | { estado: 'coincide'; detalle: string }
  | { estado: 'no_coincide'; detalle: string }
  | { estado: 'no_verificable'; detalle: string }

/**
 * El padrón del CPA (Correo Argentino) no es abierto, así que no se puede saber si un código
 * corresponde a una cuadra. Lo que sí es público es la estructura: en el CPA (p. ej. C1017AAB)
 * la primera letra identifica la provincia. El código viejo de 4 dígitos no dice nada verificable.
 */
export function controlarCodigoPostal(codigo: string, provincia: Provincia): ControlCodigoPostal {
  const limpio = codigo.toUpperCase().replace(/[\s.-]/g, '').replace(/^CP/, '')
  if (!limpio) return { estado: 'sin_dato' }

  const cpa = /^([A-HJ-NP-Z])(\d{4})([A-Z]{3})?$/.exec(limpio)
  if (cpa) {
    const letra = cpa[1]!
    const dueña = PROVINCIAS.find((p) => p.letraCpa === letra)
    if (letra === provincia.letraCpa) {
      return { estado: 'coincide', detalle: `La letra ${letra} del CPA corresponde a ${provincia.nombre}.` }
    }
    return {
      estado: 'no_coincide',
      detalle: `La letra ${letra} del CPA corresponde a ${dueña?.nombre ?? 'otra provincia'}, no a ${provincia.nombre}.`,
    }
  }
  if (/^\d{4}$/.test(limpio)) {
    return {
      estado: 'no_verificable',
      detalle: 'Código postal de 4 dígitos: sin el padrón del Correo no se puede verificar. Con el CPA completo se controla al menos la provincia.',
    }
  }
  return { estado: 'formato_invalido', detalle: `"${codigo}" no tiene formato de código postal (1234) ni de CPA (C1234ABC).` }
}
