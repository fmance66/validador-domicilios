// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { entradaDeFila, leerTabla, mapearColumnas } from '../nomenclador/index.ts'
import { boton, esperarPromesas, montar } from '../pruebas/montar.ts'
import ValidacionMasiva from './ValidacionMasiva.vue'

vi.mock('../cliente.ts', async () => {
  const { clienteFalso } = await import('../nomenclador/georefFalso.ts')
  return { cliente: clienteFalso(), usaApiPublica: true }
})

const TABLA = ['domicilio', 'Av. Callao 500, CABA', 'Rivadavia 99999, Quilmes, Buenos Aires', 'Tupungato, Mendoza'].join('\n')

/** Espera a que el lote termine (entre fila y fila hay una pausa de 150 ms). */
async function esperarLote(envoltorio: ReturnType<typeof montar>) {
  for (let i = 0; i < 40 && !envoltorio.text().includes('Descargar resultado'); i++) await esperarPromesas(50)
}

/** Lo que se descarga con el botón (URL.createObjectURL recibe el archivo). */
function capturarDescargas() {
  const descargas: string[] = []
  const crear = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    void (b as Blob).text().then((t) => descargas.push(t))
    return 'blob:falso'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return { descargas, crear }
}

describe('ValidacionMasiva', () => {
  it('la plantilla descargada se lee de vuelta con todas sus columnas reconocidas', async () => {
    const { descargas } = capturarDescargas()
    const lote = montar(ValidacionMasiva)
    await boton(lote, 'Descargar plantilla').trigger('click')
    await esperarPromesas()
    const tabla = leerTabla(descargas[0]!)
    const mapeo = mapearColumnas(tabla.encabezados)
    expect(Object.keys(mapeo).sort()).toEqual(
      ['altura', 'calle', 'codigoPostal', 'departamento', 'depto', 'entreCalles', 'localidad', 'piso', 'provincia'].sort(),
    )
    expect(entradaDeFila(tabla.filas[1]!, mapeo)).toMatchObject({ calle: 'Crisologo Larralde', entreCalles: 'Zapiola y Chivilcoy', departamento: 'Morón', provinciaId: '06' })
  })

  it('reconoce las columnas de lo pegado y avisa las filas sin provincia', async () => {
    const lote = montar(ValidacionMasiva)
    await lote.find('textarea').setValue('calle;número;localidad\nRivadavia;100;Quilmes\n')
    expect(lote.text()).toMatch(/1 fila/)
    expect(lote.findAll('.lote-columna').map((c) => c.text())).toEqual(['Calle', 'Número', 'Localidad'])
    expect(lote.text()).toMatch(/En 1 fila no se reconoce la provincia/)
  })

  it('valida todas las filas, resume por veredicto y abre una fila en la vista de un domicilio', async () => {
    const lote = montar(ValidacionMasiva)
    await lote.find('textarea').setValue(TABLA)
    await boton(lote, 'Validar todos').trigger('click')
    await esperarLote(lote)

    expect(lote.text()).toMatch(/3 de 3/)
    const tarjetas = lote.findAll('.lote-tarjeta').map((t) => t.find('.lote-tarjeta-valor').text())
    expect(tarjetas).toEqual(['1', '1', '1']) // válido, parcial, inválido
    expect(lote.findAll('.lote-tabla tbody tr')).toHaveLength(3)

    // Filtrar por inválidos deja solo esa fila.
    await lote.findAll('.lote-tarjeta')[2]!.trigger('click')
    expect(lote.findAll('.lote-tabla tbody tr')).toHaveLength(1)
    expect(lote.find('.lote-tabla tbody').text()).toMatch(/Rivadavia 99999/)

    await lote.find('.lote-tabla tbody button').trigger('click')
    expect(lote.emitted('abrir')![0]![0]).toMatchObject({ calle: 'Rivadavia', altura: '99999', provinciaId: '06' })
  })

  it('descarga la tabla con las columnas del resultado', async () => {
    const { descargas, crear } = capturarDescargas()
    const lote = montar(ValidacionMasiva)
    await lote.find('textarea').setValue(TABLA)
    await boton(lote, 'Validar todos').trigger('click')
    await esperarLote(lote)
    await boton(lote, 'Descargar resultado').trigger('click')
    await esperarPromesas()

    expect(crear).toHaveBeenCalledOnce()
    const [encabezado, primera] = descargas[0]!.replace(/^﻿/, '').split('\r\n')
    expect(encabezado).toMatch(/^domicilio;veredicto;nivel_alcanzado;niveles_validados;/)
    expect(primera).toMatch(/^Av\. Callao 500, CABA;válido;Ubicación;6\/6;/)
  })
})
