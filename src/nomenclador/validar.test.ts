import { describe, expect, it } from 'vitest'
import { entradaVacia, type EntradaDomicilio } from './entrada.ts'
import { clienteFalso } from './georefFalso.ts'
import { validarDomicilio, type Nivel, type ResultadoValidacion } from './validar.ts'

const validar = (datos: Partial<EntradaDomicilio>) => validarDomicilio(clienteFalso(), { ...entradaVacia(), ...datos })
const estado = (r: ResultadoValidacion, nivel: Nivel) => r.pasos.find((p) => p.nivel === nivel)!.estado

// --- Casos -----------------------------------------------------------------------------------

describe('validarDomicilio', () => {
  it('valida hasta la cuadra y avisa cuando la calle es límite entre comunas', async () => {
    const r = await validar({ calle: 'Av. Callao', altura: '500', provinciaId: '02' })
    expect(r.veredicto).toBe('valido')
    expect(r.nivelAlcanzado).toBe('ubicacion')
    expect(r.ubicacion?.precision).toBe('tramo')
    expect(estado(r, 'localidad')).toBe('ok')
    expect(r.pasos.find((p) => p.nivel === 'localidad')!.normalizado).toBe('Balvanera')
    expect(estado(r, 'departamento')).toBe('advertencia')
    expect(r.observaciones[0]).toMatch(/límite/)
    expect(r.alternativas).toContainEqual(expect.objectContaining({ cambios: { localidad: '', departamento: 'Comuna 1' } }))
  })

  it('al declarar la comuna elige ese lado de la calle', async () => {
    const r = await validar({ calle: 'Av. Callao', altura: '500', departamento: 'Comuna 1', provinciaId: '02' })
    expect(r.pasos.find((p) => p.nivel === 'departamento')!.normalizado).toBe('Comuna 1')
    expect(r.veredicto).toBe('valido')
  })

  it('rechaza una altura fuera de la numeración de la calle', async () => {
    const r = await validar({ calle: 'Rivadavia', altura: '99999', localidad: 'Quilmes', provinciaId: '06' })
    expect(r.veredicto).toBe('invalido')
    expect(r.nivelAlcanzado).toBe('calle')
    expect(estado(r, 'altura')).toBe('error')
    expect(r.resumen).toMatch(/del 1 al 800/)
  })

  it('valida hasta la calle cuando el callejero no tiene alturas', async () => {
    const r = await validar({ calle: 'Sin Alturas', altura: '10', localidad: 'Quilmes', provinciaId: '06' })
    expect(r.veredicto).toBe('parcial')
    expect(r.titulo).toBe('Válido hasta la calle')
    expect(estado(r, 'altura')).toBe('no_verificable')
    expect(r.ubicacion?.precision).toBe('localidad')
  })

  it('detecta una calle que no está en el barrio declarado y sugiere dónde está', async () => {
    const r = await validar({ calle: 'Av. Callao', altura: '500', localidad: 'Palermo', provinciaId: '02' })
    expect(r.veredicto).toBe('invalido')
    expect(estado(r, 'localidad')).toBe('ok')
    expect(estado(r, 'calle')).toBe('error')
    expect(r.alternativas.map((a) => a.cambios.localidad)).toContain('Balvanera')
  })

  it('rechaza una localidad que no existe en la provincia', async () => {
    const r = await validar({ localidad: 'Villa Inventada', provinciaId: '50' })
    expect(r.veredicto).toBe('invalido')
    expect(estado(r, 'localidad')).toBe('error')
    expect(r.nivelAlcanzado).toBe('provincia')
  })

  it('sin calle, valida hasta la localidad y ubica el centro', async () => {
    const r = await validar({ localidad: 'Tupungato', provinciaId: '50' })
    expect(r.veredicto).toBe('parcial')
    expect(r.nivelAlcanzado).toBe('localidad')
    expect(estado(r, 'departamento')).toBe('ok')
    expect(r.ubicacion?.precision).toBe('localidad')
  })

  it('marca como ambiguo un paraje con homónimos y ofrece elegir', async () => {
    const r = await validar({ localidad: 'Santa Clara', provinciaId: '50' })
    expect(estado(r, 'localidad')).toBe('ambiguo')
    expect(estado(r, 'departamento')).toBe('ambiguo')
    expect(r.nivelAlcanzado).toBe('provincia')
    expect(r.alternativas.map((a) => a.cambios.departamento)).toEqual(['Lavalle', 'San Rafael'])
  })

  it('con el departamento declarado, el homónimo se resuelve', async () => {
    const r = await validar({ localidad: 'Santa Clara', departamento: 'San Rafael', provinciaId: '50' })
    expect(estado(r, 'localidad')).toBe('ok')
    expect(r.pasos.find((p) => p.nivel === 'departamento')!.normalizado).toBe('San Rafael')
  })

  it('un CPA de otra provincia invalida el domicilio', async () => {
    const r = await validar({ calle: 'Av. Callao', altura: '500', codigoPostal: 'X5000ABC', provinciaId: '02' })
    expect(r.veredicto).toBe('invalido')
    expect(r.nivelAlcanzado).toBe('ubicacion')
    expect(r.complementarios.find((d) => d.campo === 'Código postal')!.estado).toBe('error')
  })

  it('con las entrecalles ubica el centro de la cuadra y avisa si la numeración cae lejos', async () => {
    const r = await validar({ calle: 'Crisologo Larralde', altura: '2049', entreCalles: 'Zapiola y Chivilcoy', localidad: 'Castelar', provinciaId: '06' })
    expect(r.veredicto).toBe('valido')
    expect(r.ubicacion).toMatchObject({ precision: 'cuadra', lat: -34.64543, lon: -58.63647 })
    expect(r.complementarios.find((d) => d.campo === 'Entre calles')).toMatchObject({ estado: 'ok', detalle: 'Cuadra entre JOSE MATIAS ZAPIOLA y CHIVILCOY.' })
    expect(r.observaciones.join(' ')).toMatch(/a \d{3} m de la cuadra declarada/)
    // La cuadra por numeración, para dibujarla y ver el desvío.
    expect(r.cuadra).toMatchObject({ desde: 2000, hasta: 2099, inicio: { lat: -34.64441 }, fin: { lat: -34.64477 } })
  })

  it('sin pedir la cuadra no hace las consultas de más', async () => {
    const entrada = { ...entradaVacia(), calle: 'Crisologo Larralde', altura: '2049', localidad: 'Castelar', provinciaId: '06' }
    const conCuadra = await validarDomicilio(clienteFalso(), entrada)
    const sinCuadra = await validarDomicilio(clienteFalso(), entrada, { cuadra: false })
    expect(conCuadra.cuadra).not.toBeNull()
    expect(sinCuadra.cuadra).toBeNull()
    expect(sinCuadra.pedidos).toBe(conCuadra.pedidos - 2)
  })

  it('si las entrecalles no son consecutivas, ubica en la esquina que encuentre', async () => {
    const r = await validar({ calle: 'Crisologo Larralde', altura: '2049', entreCalles: 'Zapiola y Arrieta', localidad: 'Castelar', provinciaId: '06' })
    expect(r.ubicacion?.precision).toBe('esquina')
    expect(r.complementarios.find((d) => d.campo === 'Entre calles')!.estado).toBe('advertencia')
    expect(r.veredicto).toBe('valido')
  })

  it('si la calle no cruza las entrecalles, ubica por numeración', async () => {
    const r = await validar({ calle: 'Crisologo Larralde', altura: '2049', entreCalles: 'Falsa y Otra', localidad: 'Castelar', provinciaId: '06' })
    expect(r.ubicacion?.precision).toBe('tramo')
    expect(r.complementarios.find((d) => d.campo === 'Entre calles')!.detalle).toMatch(/no cruza/)
  })

  it('sin provincia no busca', async () => {
    const r = await validar({ calle: 'Av. Callao', altura: '500' })
    expect(r.nivelAlcanzado).toBeNull()
    expect(r.pedidos).toBe(0)
  })
})
