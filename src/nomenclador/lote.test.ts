import { describe, expect, it } from 'vitest'
import { clienteFalso } from './georefFalso.ts'
import {
  entradaDeFila,
  escribirCsv,
  leerTabla,
  mapearColumnas,
  resumirLote,
  tablaDeSalida,
  validarLote,
  COLUMNAS_RESULTADO,
} from './lote.ts'

describe('leerTabla', () => {
  it('detecta el separador y respeta las comillas', () => {
    const t = leerTabla('id;domicilio\n1;"Av. Callao 500, CABA"\n2;"Dice ""hola"""\n')
    expect(t.encabezados).toEqual(['id', 'domicilio'])
    expect(t.filas).toEqual([
      ['1', 'Av. Callao 500, CABA'],
      ['2', 'Dice "hola"'],
    ])
  })

  it('lee lo que se pega desde Excel (tabulaciones) y saltea filas vacías', () => {
    const t = leerTabla('Calle\tNúmero\tProvincia\r\nAv. Callao\t500\tCABA\r\n\t\t\r\n')
    expect(t.encabezados).toEqual(['Calle', 'Número', 'Provincia'])
    expect(t.filas).toEqual([['Av. Callao', '500', 'CABA']])
  })

  it('sin encabezados, toma todo como domicilios en una línea', () => {
    const t = leerTabla('Av. Callao 500, CABA\nTupungato, Mendoza\n')
    expect(t.encabezados[0]).toBe('domicilio')
    expect(t.filas).toHaveLength(2)
  })
})

describe('entradaDeFila', () => {
  it('arma la entrada con columnas separadas y reconoce la provincia escrita a mano', () => {
    const t = leerTabla('calle,nro,localidad,partido,provincia\nRivadavia,99999,Quilmes,,Bs. As.\n')
    const e = entradaDeFila(t.filas[0]!, mapearColumnas(t.encabezados))
    expect(e).toMatchObject({ calle: 'Rivadavia', altura: '99999', localidad: 'Quilmes', provinciaId: '06' })
  })

  it('separa el domicilio en una línea y las otras columnas completan lo que falta', () => {
    const t = leerTabla('Dirección;Provincia\nAv. Callao 500 3° B;CABA\n')
    const e = entradaDeFila(t.filas[0]!, mapearColumnas(t.encabezados))
    expect(e).toMatchObject({ calle: 'Av. Callao', altura: '500', piso: '3', depto: 'B', provinciaId: '02' })
  })
})

describe('validarLote', () => {
  it('valida cada fila, informa el avance y resume por veredicto y nivel', async () => {
    const t = leerTabla('domicilio\nAv. Callao 500, CABA\nRivadavia 99999, Quilmes, Buenos Aires\nTupungato, Mendoza\nSin provincia 123\n')
    const mapeo = mapearColumnas(t.encabezados)
    const avances: number[] = []
    const filas = await validarLote(clienteFalso(), t.filas.map((f) => entradaDeFila(f, mapeo)), {
      pausaMs: 0,
      alAvanzar: (hechos) => avances.push(hechos),
    })
    expect(avances).toEqual([1, 2, 3, 4])
    expect(filas.map((f) => f?.resultado?.veredicto ?? 'error')).toEqual(['valido', 'invalido', 'parcial', 'error'])

    const resumen = resumirLote(filas)
    expect(resumen).toMatchObject({ total: 4, errores: 1, porVeredicto: { valido: 1, parcial: 1, invalido: 1 } })
    expect(resumen.porNivel.find((n) => n.nivel === 'ubicacion')).toMatchObject({ cantidad: 1, porVeredicto: { valido: 1, parcial: 0, invalido: 0 } })
    expect(resumen.porNivel.find((n) => n.nivel === 'localidad')!.cantidad).toBe(1)

    const salida = tablaDeSalida(t, filas)
    expect(salida[0]).toEqual(['domicilio', ...COLUMNAS_RESULTADO])
    expect(salida[1]!.slice(1, 4)).toEqual(['válido', 'Ubicación', '6/6'])
    expect(salida[4]!.slice(1, 2)).toEqual(['error'])
  })

  it('al cancelar deja sin validar las filas pendientes', async () => {
    const control = new AbortController()
    const entradas = Array.from({ length: 5 }, () => entradaDeFila(['Tupungato, Mendoza'], { linea: 0 }))
    const filas = await validarLote(clienteFalso(), entradas, {
      concurrencia: 1,
      pausaMs: 0,
      alAvanzar: (hechos) => hechos === 2 && control.abort(),
      senal: control.signal,
    })
    expect(filas.filter(Boolean)).toHaveLength(2)
    expect(tablaDeSalida({ encabezados: ['domicilio'], filas: [['x'], ['x'], ['x']] }, filas)[3]![1]).toBe('sin validar')
  })
})

describe('escribirCsv', () => {
  it('usa punto y coma, BOM para Excel y comillas donde hacen falta', () => {
    expect(escribirCsv([['a', 'b;c', 'd"e']])).toBe('﻿a;"b;c";"d""e"\r\n')
  })
})
