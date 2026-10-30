import { describe, expect, it } from 'vitest'
import { clienteFalso } from './georefFalso.ts'
import { consultarPunto, entradaDePunto, esEnlaceCorto, leerCoordenadas } from './punto.ts'

describe('leerCoordenadas', () => {
  it.each([
    ['-34.6037, -58.3816', { lat: -34.6037, lon: -58.3816 }],
    ['-34.6037 -58.3816', { lat: -34.6037, lon: -58.3816 }],
    ['-34,6037; -58,3816', { lat: -34.6037, lon: -58.3816 }],
    ['-34,6037 -58,3816', { lat: -34.6037, lon: -58.3816 }],
  ])('lee "%s"', (texto, punto) => {
    expect(leerCoordenadas(texto)).toEqual(punto)
  })

  it('lee enlaces de Google Maps, prefiriendo el lugar marcado al centro de la vista', () => {
    expect(leerCoordenadas('https://www.google.com/maps/@-34.6037,-58.3816,17z')).toEqual({ lat: -34.6037, lon: -58.3816 })
    expect(leerCoordenadas('https://maps.google.com/?q=-34.60,-58.38')).toEqual({ lat: -34.6, lon: -58.38 })
    expect(
      leerCoordenadas('https://www.google.com/maps/place/Congreso/@-34.6,-58.4,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-34.6098!4d-58.3925'),
    ).toEqual({ lat: -34.6098, lon: -58.3925 })
    expect(leerCoordenadas('https://www.google.com/maps/search/?api=1&query=-34.61%2C-58.39')).toEqual({ lat: -34.61, lon: -58.39 })
  })

  it('no confunde un domicilio con coordenadas', () => {
    expect(leerCoordenadas('Av. Callao 500')).toBeNull()
    expect(leerCoordenadas('500 3')).toBeNull()
    expect(leerCoordenadas('https://www.google.com/maps/place/Congreso')).toBeNull()
  })

  it('reconoce los enlaces cortos, que no traen el punto', () => {
    expect(esEnlaceCorto('https://maps.app.goo.gl/AbCdEf123')).toBe(true)
    expect(esEnlaceCorto('https://www.google.com/maps/@-34.6,-58.4,17z')).toBe(false)
  })
})

describe('consultarPunto', () => {
  it('devuelve provincia, departamento y la localidad más cercana', async () => {
    const c = await consultarPunto(clienteFalso(), { lat: -34.6545, lon: -58.6364 })
    expect(c.provincia?.id).toBe('06')
    expect(c.departamento?.nombre).toBe('Morón')
    expect(c.localidadCercana?.nombre).toBe('Castelar')
    expect(entradaDePunto(c)).toEqual({ provinciaId: '06', departamento: 'Morón', localidad: 'Castelar' })
  })

  it('fuera del país no hay provincia', async () => {
    const c = await consultarPunto(clienteFalso(), { lat: -33.45, lon: -70.66 })
    expect(c.provincia).toBeNull()
    expect(c.localidadCercana).toBeNull()
  })
})
