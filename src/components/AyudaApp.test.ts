// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { NIVELES } from '../nomenclador/index.ts'
import { boton, montar } from '../pruebas/montar.ts'
import AyudaApp from './AyudaApp.vue'

vi.mock('../cliente.ts', () => ({ cliente: null, usaApiPublica: true }))

describe('AyudaApp', () => {
  it('explica los seis niveles, los siete estados y el aviso de privacidad', () => {
    const ayuda = montar(AyudaApp)
    expect(ayuda.findAll('.ayuda-niveles li')).toHaveLength(NIVELES.length)
    expect(ayuda.findAll('.ayuda-leyenda .chip-estado')).toHaveLength(7)
    expect(ayuda.text()).toMatch(/nunca datos personales reales/)
  })

  it('un ejemplo pide probarlo, y el enlace a la solapa pide ir a Muchos domicilios', async () => {
    const ayuda = montar(AyudaApp)
    await boton(ayuda, 'Tupungato, Mendoza').trigger('click')
    expect(ayuda.emitted('probar')).toEqual([['Tupungato, Mendoza']])
    // El de la sección, no el del índice (que baja hasta la sección).
    await ayuda.find('#ayuda-lote a').trigger('click')
    expect(ayuda.emitted('irA')).toEqual([['lote']])
  })
})
