// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { combinarCorrecciones, leerCorrecciones, type Correccion } from './correcciones.ts'

const correccion = (clave: string, fecha: string, lat = -34.6): Correccion => ({
  clave,
  domicilio: `Domicilio ${clave}`,
  lat,
  lon: -58.4,
  original: { lat: -34.61, lon: -58.41, precision: 'tramo' },
  fecha,
})

describe('leerCorrecciones', () => {
  it('lee lo que exporta la app e ignora los campos de más y lo que no es una corrección', () => {
    const exportado = JSON.stringify([
      { ...correccion('a|100', '2026-09-01T10:00:00.000Z'), desvioMetros: 1400 },
      { clave: 'b|200', lat: 'no es un número', lon: -58 },
      null,
      { clave: 'c|300', lat: -34.5, lon: -58.5 },
    ])
    const leidas = leerCorrecciones(exportado)
    expect(leidas.map((c) => c.clave)).toEqual(['a|100', 'c|300'])
    expect(leidas[0]).not.toHaveProperty('desvioMetros')
    expect(leidas[1]).toMatchObject({ domicilio: 'c|300', original: null })
  })

  it('rechaza un archivo que no es una lista', () => {
    expect(() => leerCorrecciones('{"clave": "a"}')).toThrow(/lista/)
    expect(() => leerCorrecciones('no es json')).toThrow()
  })
})

describe('combinarCorrecciones', () => {
  it('agrega las nuevas y, para el mismo domicilio, se queda con la más reciente', () => {
    const actuales = [correccion('a|100', '2026-09-10T00:00:00.000Z'), correccion('b|200', '2026-09-01T00:00:00.000Z')]
    const importadas = [
      correccion('a|100', '2026-09-05T00:00:00.000Z', -1), // más vieja: no pisa
      correccion('b|200', '2026-09-20T00:00:00.000Z', -2), // más nueva: pisa
      correccion('c|300', '2026-09-15T00:00:00.000Z'),
    ]
    const r = combinarCorrecciones(actuales, importadas)
    expect(r).toMatchObject({ nuevas: 1, actualizadas: 1, iguales: 1 })
    expect(r.combinadas.map((c) => c.clave)).toEqual(['b|200', 'c|300', 'a|100'])
    expect(r.combinadas.find((c) => c.clave === 'a|100')!.lat).toBe(-34.6)
    expect(r.combinadas.find((c) => c.clave === 'b|200')!.lat).toBe(-2)
  })
})
