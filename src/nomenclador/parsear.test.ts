import { describe, expect, it } from 'vitest'
import { controlarCodigoPostal } from './codigoPostal.ts'
import { separarEntreCalles } from './entrada.ts'
import { parsearDomicilio } from './parsear.ts'
import { buscarProvincia, provinciaPorId } from './provincias.ts'
import { lugarCoincide, similitudCalle } from './texto.ts'

describe('parsearDomicilio', () => {
  it('separa calle, altura, piso, depto., barrio, provincia y CPA', () => {
    expect(parsearDomicilio('Av. Callao 500 3° B, Balvanera, CABA, C1022AAO')).toEqual({
      calle: 'Av. Callao',
      altura: '500',
      piso: '3',
      depto: 'B',
      entreCalles: '',
      codigoPostal: 'C1022AAO',
      localidad: 'Balvanera',
      departamento: '',
      provinciaId: '02',
    })
  })

  it('reconoce localidad y partido', () => {
    const e = parsearDomicilio('Belgrano 1500 piso 2 dto 4, Bernal, Quilmes, Buenos Aires, 1876')
    expect(e).toMatchObject({ calle: 'Belgrano', altura: '1500', piso: '2', depto: '4', localidad: 'Bernal', departamento: 'Quilmes', provinciaId: '06', codigoPostal: '1876' })
  })

  it('no confunde los números del nombre de la calle con la altura', () => {
    expect(parsearDomicilio('25 de Mayo 300, Mendoza, Mendoza')).toMatchObject({ calle: '25 de Mayo', altura: '300', localidad: 'Mendoza', provinciaId: '50' })
    expect(parsearDomicilio('Calle 13 1234, La Plata, Buenos Aires')).toMatchObject({ calle: 'Calle 13', altura: '1234' })
  })

  it('acepta domicilios sin número', () => {
    expect(parsearDomicilio('Ruta 40 S/N, Tupungato, Mendoza')).toMatchObject({ calle: 'Ruta 40', altura: 'S/N', localidad: 'Tupungato' })
  })

  it('si el primer tramo no tiene número, es un lugar y no una calle', () => {
    expect(parsearDomicilio('Tupungato, Mendoza')).toMatchObject({ calle: '', localidad: 'Tupungato', provinciaId: '50' })
  })

  it('toma "Capital Federal" como provincia CABA', () => {
    expect(parsearDomicilio('Corrientes 1234, Capital Federal')).toMatchObject({ provinciaId: '02', localidad: '' })
  })

  it('sin comas, reconoce la provincia, la localidad y el CP después del número', () => {
    expect(parsearDomicilio('blanco encalada 2851 caba')).toMatchObject({ calle: 'blanco encalada', altura: '2851', provinciaId: '02', localidad: '' })
    expect(parsearDomicilio('Blanco Encalada 2851 3° B Capital Federal C1428ABC')).toMatchObject({ piso: '3', depto: 'B', provinciaId: '02', codigoPostal: 'C1428ABC' })
    expect(parsearDomicilio('Cabildo 2000 piso 4 dto A Belgrano CABA')).toMatchObject({ calle: 'Cabildo', piso: '4', depto: 'A', localidad: 'Belgrano', provinciaId: '02' })
    expect(parsearDomicilio('Rivadavia 500 Quilmes Buenos Aires')).toMatchObject({ localidad: 'Quilmes', provinciaId: '06' })
  })

  it('no toma como provincia el final del nombre de una localidad', () => {
    expect(parsearDomicilio('San Martín 500 San Miguel de Tucumán')).toMatchObject({ localidad: 'San Miguel de Tucumán', provinciaId: '' })
    expect(parsearDomicilio('San Martín 500 San Miguel de Tucumán Tucumán')).toMatchObject({ localidad: 'San Miguel de Tucumán', provinciaId: '90' })
  })

  it('separa las calles que cruzan la cuadra', () => {
    expect(parsearDomicilio('Crisologo Larralde 2049 entre Zapiola y Chivilcoy, Castelar, Morón, Buenos Aires')).toMatchObject({
      calle: 'Crisologo Larralde',
      altura: '2049',
      entreCalles: 'Zapiola y Chivilcoy',
      localidad: 'Castelar',
      departamento: 'Morón',
    })
    expect(parsearDomicilio('Larralde 2049, e/ Zapiola y Chivilcoy, Castelar')).toMatchObject({ calle: 'Larralde', entreCalles: 'Zapiola y Chivilcoy', localidad: 'Castelar' })
  })

  it('no confunde Entre Ríos (provincia o calle) con las entrecalles', () => {
    expect(parsearDomicilio('San Martín 100, Paraná, Entre Ríos')).toMatchObject({ entreCalles: '', provinciaId: '30', localidad: 'Paraná' })
    expect(parsearDomicilio('Av. Entre Ríos 500, CABA')).toMatchObject({ calle: 'Av. Entre Ríos', altura: '500', entreCalles: '' })
  })
})

describe('separarEntreCalles', () => {
  it('acepta "y", "e", "/" y "&"', () => {
    expect(separarEntreCalles('Zapiola y Chivilcoy')).toEqual(['Zapiola', 'Chivilcoy'])
    expect(separarEntreCalles('entre Zapiola e Irigoyen')).toEqual(['Zapiola', 'Irigoyen'])
    expect(separarEntreCalles('Zapiola / Chivilcoy')).toEqual(['Zapiola', 'Chivilcoy'])
    expect(separarEntreCalles('25 de Mayo & 9 de Julio')).toEqual(['25 de Mayo', '9 de Julio'])
  })

  it('pide exactamente dos calles', () => {
    expect(separarEntreCalles('Zapiola')).toBeNull()
    expect(separarEntreCalles('')).toBeNull()
    expect(separarEntreCalles(undefined)).toBeNull()
  })
})

describe('similitudCalle', () => {
  it('ignora tipo de vía, abreviaturas y la doble numeración del INDEC', () => {
    expect(similitudCalle('Av. Callao', 'AV CALLAO')).toBe(2)
    expect(similitudCalle('Callao', 'AV CALLAO')).toBe(2)
    expect(similitudCalle('Avenida General Paz', 'AV GRAL PAZ')).toBe(2)
    expect(similitudCalle('Rivadavia', '13 RIVADAVIA')).toBe(2)
  })

  it('acepta iniciales, pero marca que el nombre oficial tiene más', () => {
    expect(similitudCalle('B. Rivadavia', '211 BERNARDINO RIVADAVIA')).toBe(1)
    expect(similitudCalle('Rivadavia', '211 BERNARDINO RIVADAVIA')).toBe(1)
  })

  it('detecta cuando Georef interpretó otra calle', () => {
    expect(similitudCalle('Calao', 'AV CALLAO')).toBe(0)
  })
})

describe('lugarCoincide', () => {
  it('compara nombres de lugar por palabras completas', () => {
    expect(lugarCoincide('3', 'Comuna 3')).toBe(true)
    expect(lugarCoincide('San Martín', 'General San Martín')).toBe(true)
    expect(lugarCoincide('3', 'Comuna 13')).toBe(false)
  })
})

describe('provincias y código postal', () => {
  it('reconoce abreviaturas de provincias', () => {
    expect(buscarProvincia('Bs. As.')?.id).toBe('06')
    expect(buscarProvincia('cordoba')?.id).toBe('14')
    expect(buscarProvincia('TDF')?.id).toBe('94')
  })

  it('controla la letra de provincia del CPA', () => {
    const cordoba = provinciaPorId('14')!
    expect(controlarCodigoPostal('X5000ABC', cordoba).estado).toBe('coincide')
    expect(controlarCodigoPostal('M5500', cordoba)).toMatchObject({ estado: 'no_coincide' })
    expect(controlarCodigoPostal('5000', cordoba).estado).toBe('no_verificable')
    expect(controlarCodigoPostal('ABC', cordoba).estado).toBe('formato_invalido')
    expect(controlarCodigoPostal('', cordoba).estado).toBe('sin_dato')
  })
})
