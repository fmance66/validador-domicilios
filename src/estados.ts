import type { EstadoPaso, Veredicto } from './nomenclador/index.ts'

export const ESTADOS: Record<EstadoPaso, { etiqueta: string; icono: string; clase: string }> = {
  ok: { etiqueta: 'Validado', icono: 'check', clase: 'estado-ok' },
  interpretado: { etiqueta: 'Corregido', icono: 'edit', clase: 'estado-interpretado' },
  advertencia: { etiqueta: 'Con salvedad', icono: 'priority_high', clase: 'estado-advertencia' },
  ambiguo: { etiqueta: 'Ambiguo', icono: 'question_mark', clase: 'estado-ambiguo' },
  no_verificable: { etiqueta: 'No verificable', icono: 'remove', clase: 'estado-no-verificable' },
  sin_dato: { etiqueta: 'Sin dato', icono: 'more_horiz', clase: 'estado-sin-dato' },
  error: { etiqueta: 'No coincide', icono: 'close', clase: 'estado-error' },
}

export const VEREDICTOS: Record<Veredicto, { icono: string; clase: string }> = {
  valido: { icono: 'verified', clase: 'veredicto-valido' },
  parcial: { icono: 'rule', clase: 'veredicto-parcial' },
  invalido: { icono: 'dangerous', clase: 'veredicto-invalido' },
}
