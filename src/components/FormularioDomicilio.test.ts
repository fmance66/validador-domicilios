// @vitest-environment happy-dom
import Select from 'openvue/select'
import { describe, expect, it, vi } from 'vitest'
import { entradaVacia, type EntradaDomicilio } from '../nomenclador/index.ts'
import { boton, esperarPromesas, montar } from '../pruebas/montar.ts'
import FormularioDomicilio from './FormularioDomicilio.vue'

vi.mock('../cliente.ts', async () => {
  const { clienteFalso } = await import('../nomenclador/georefFalso.ts')
  return { cliente: clienteFalso(), usaApiPublica: true }
})

function montarFormulario() {
  const envoltorio = montar(FormularioDomicilio, {
    props: {
      modelValue: entradaVacia(),
      cargando: false,
      'onUpdate:modelValue': (e: EntradaDomicilio) => envoltorio.setProps({ modelValue: e }),
    },
  })
  return envoltorio
}

describe('FormularioDomicilio', () => {
  it('separa el domicilio escrito en una línea y pide validar con Enter', async () => {
    const f = montarFormulario()
    await f.find('#linea').setValue('Av. Callao 500 3° B, CABA, C1022AAO')
    await f.find('#linea').trigger('keydown', { key: 'Enter' })
    expect(f.props('modelValue')).toMatchObject({ calle: 'Av. Callao', altura: '500', piso: '3', depto: 'B', provinciaId: '02', codigoPostal: 'C1022AAO' })
    expect(f.emitted('validar')).toHaveLength(1)
    expect((f.find('#calle').element as HTMLInputElement).value).toBe('Av. Callao')
  })

  it('con coordenadas o un enlace de Google Maps consulta el punto en lugar de validar', async () => {
    const f = montarFormulario()
    await f.find('#linea').setValue('https://www.google.com/maps/@-34.6545,-58.6364,17z')
    await boton(f, 'Separar').trigger('click')
    expect(f.emitted('punto')).toEqual([[{ lat: -34.6545, lon: -58.6364 }]])
    expect(f.emitted('validar')).toBeUndefined()
  })

  it('avisa que los enlaces cortos de Google Maps no sirven', async () => {
    const f = montarFormulario()
    await f.find('#linea').setValue('https://maps.app.goo.gl/AbCdEf123')
    await f.find('#linea').trigger('keydown', { key: 'Enter' })
    expect(f.text()).toMatch(/enlaces cortos/)
    expect(f.emitted('punto')).toBeUndefined()
  })

  it('un ejemplo completa el formulario y valida', async () => {
    const f = montarFormulario()
    await boton(f, 'Tupungato, Mendoza').trigger('click')
    expect(f.props('modelValue')).toMatchObject({ localidad: 'Tupungato', provinciaId: '50' })
    expect(f.emitted('validar')).toHaveLength(1)
  })

  it('en CABA la localidad se llama barrio, y el botón Validar se habilita con la provincia', async () => {
    const f = montarFormulario()
    expect(boton(f, 'Validar').attributes('disabled')).toBeDefined()
    await f.findComponent(Select).setValue('02')
    await esperarPromesas()
    expect(f.find('label[for=localidad]').text()).toBe('Barrio')
    expect(boton(f, 'Validar').attributes('disabled')).toBeUndefined()
  })
})
