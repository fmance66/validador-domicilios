// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { clienteFalso } from '../nomenclador/georefFalso.ts'
import { entradaVacia, validarDomicilio, type EntradaDomicilio } from '../nomenclador/index.ts'
import { boton, montar } from '../pruebas/montar.ts'
import ResultadoValidacion from './ResultadoValidacion.vue'

async function montarResultado(datos: Partial<EntradaDomicilio>) {
  const entrada = { ...entradaVacia(), ...datos }
  const resultado = await validarDomicilio(clienteFalso(), entrada)
  return montar(ResultadoValidacion, { props: { resultado, entrada, fuente: 'un Georef de prueba' } })
}

describe('ResultadoValidacion', () => {
  it('muestra el veredicto, los niveles y la forma normalizada con piso y depto.', async () => {
    const r = await montarResultado({ calle: 'Av. Callao', altura: '500', piso: '3', depto: 'B', provinciaId: '02' })
    expect(r.find('.veredicto-titulo').text()).toBe('Domicilio válido')
    expect(r.find('.veredicto-nivel-valor').text()).toBe('6/6')
    expect(r.find('.normalizada-texto').text()).toMatch(/^AV CALLAO 500 piso 3 depto\. B, Balvanera/)
    expect(r.text()).toMatch(/un Georef de prueba/)
  })

  it('elegir una alternativa pide aplicar sus cambios', async () => {
    const r = await montarResultado({ calle: 'Av. Callao', altura: '500', provinciaId: '02' })
    await boton(r, 'Comuna 1').trigger('click')
    expect(r.emitted('aplicar')![0]![0]).toEqual({ localidad: '', departamento: 'Comuna 1' })
  })

  it('un domicilio inválido explica el motivo', async () => {
    const r = await montarResultado({ calle: 'Rivadavia', altura: '99999', localidad: 'Quilmes', provinciaId: '06' })
    expect(r.find('.veredicto').classes()).toContain('veredicto-invalido')
    expect(r.find('.veredicto-resumen').text()).toMatch(/la numeración va del 1 al 800/)
  })

  it('Imprimir / PDF arma el encabezado del informe y abre el diálogo de impresión', async () => {
    vi.useFakeTimers()
    // happy-dom no trae window.print.
    const imprimir = vi.fn()
    window.print = imprimir
    const r = await montarResultado({ calle: 'Av. Callao', altura: '500', provinciaId: '02' })
    await boton(r, 'Imprimir').trigger('click')
    expect(document.documentElement.classList).toContain('imprimiendo')
    vi.advanceTimersByTime(500)
    expect(imprimir).toHaveBeenCalledOnce()
    expect(r.find('.informe-encabezado').text()).toMatch(/Domicilio informado: Av\. Callao 500, Ciudad Autónoma de Buenos Aires/)
    window.dispatchEvent(new Event('afterprint'))
    expect(document.documentElement.classList).not.toContain('imprimiendo')
    vi.useRealTimers()
  })
})
