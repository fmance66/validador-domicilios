/**
 * Georef falso para los tests: responde con la forma de la API real, a partir de unos pocos
 * datos. Lo usan los tests de la lógica y los de la interfaz.
 */
import { ClienteGeoref, type DireccionGeoref, type LugarGeoref } from './georef.ts'

const ent = (id: string | null, nombre: string | null) => ({ id, nombre })
const CABA = ent('02', 'Ciudad Autónoma de Buenos Aires')
const BSAS = ent('06', 'Buenos Aires')
const MENDOZA = ent('50', 'Mendoza')

function direccion(
  calle: [id: string, nombre: string],
  altura: number,
  lugar: { provincia: typeof CABA; departamento: [string, string]; censal: [string, string]; localidad?: [string, string] },
  punto: [number, number] | null,
): DireccionGeoref {
  const localidad = lugar.localidad ? ent(...lugar.localidad) : ent(null, null)
  return {
    altura: { valor: altura },
    calle: ent(...calle),
    departamento: ent(...lugar.departamento),
    localidad_censal: ent(...lugar.censal),
    localidad,
    provincia: lugar.provincia,
    nomenclatura: `${calle[1]} ${altura}, ${localidad.nombre ?? lugar.censal[1]}, ${lugar.departamento[1]}, ${lugar.provincia.nombre}`,
    ubicacion: punto ? { lat: punto[0], lon: punto[1] } : { lat: null, lon: null },
  }
}

const COMUNA3 = { provincia: CABA, departamento: ['02021', 'Comuna 3'] as [string, string], censal: ['02021010', 'CABA - Comuna 3'] as [string, string], localidad: ['0202101001', 'Balvanera'] as [string, string] }
const COMUNA1 = { provincia: CABA, departamento: ['02007', 'Comuna 1'] as [string, string], censal: ['02007010', 'CABA - Comuna 1'] as [string, string] }
const MORON = { provincia: BSAS, departamento: ['06568', 'Morón'] as [string, string], censal: ['06568010', 'Morón'] as [string, string], localidad: ['0656801001', 'Castelar'] as [string, string] }
const LARRALDE: [string, string] = ['065680100101035', 'CRISOLOGO LARRALDE']
/** Cruce de Larralde con una o dos calles, como lo devuelve Georef ("calle y X", "calle entre X y Y"). */
function cruce(punto: [number, number], ...cruces: string[]): DireccionGeoref {
  return {
    ...direccion(LARRALDE, 0, MORON, punto),
    altura: { valor: null },
    calle_cruce_1: ent('1', cruces[0]!),
    ...(cruces[1] ? { calle_cruce_2: ent('2', cruces[1]) } : {}),
  }
}
const QUILMES = { provincia: BSAS, departamento: ['06658', 'Quilmes'] as [string, string], censal: ['06658010', 'Quilmes'] as [string, string] }

function lugar(id: string, nombre: string, provincia: typeof CABA, departamento: [string, string], censal?: [string, string]): LugarGeoref {
  return {
    id,
    nombre,
    provincia,
    departamento: ent(...departamento),
    ...(censal ? { localidad_censal: ent(...censal) } : {}),
    centroide: { lat: -33, lon: -69 },
  }
}

const CALLAO_500 = [
  direccion(['020210100101080', 'AV CALLAO'], 500, COMUNA3, [-34.6031886, -58.3923866]),
  direccion(['020070100001080', 'AV CALLAO'], 500, COMUNA1, [-34.6031886, -58.3923864]),
]

type Datos = Record<string, unknown>
type Manejador = (p: URLSearchParams) => Datos | undefined

/** Respuestas por recurso; lo que no está previsto devuelve lista vacía. */
export const MANEJADORES: Record<string, Manejador> = {
  direcciones(p) {
    const d = p.get('direccion')
    const censal = p.get('localidad_censal')
    if (d === 'Av. Callao 500' && p.get('provincia') === '02') {
      return { direcciones: CALLAO_500.filter((x) => !censal || x.localidad_censal.id === censal) }
    }
    if (d === 'Rivadavia 99999' && censal === '06658010') {
      return { direcciones: [direccion(['066580100000180', '13 RIVADAVIA'], 99999, QUILMES, null)] }
    }
    // La numeración del callejero ubica el 2049 unos 450 m al oeste de la cuadra real.
    if (d === 'Crisologo Larralde 2049' && censal === '06568010') return { direcciones: [direccion(LARRALDE, 2049, MORON, [-34.64459, -58.64127])] }
    // Puntas de la cuadra del 2000 por numeración (para dibujarla).
    if (d === 'CRISOLOGO LARRALDE 2000' && censal === '06568010') return { direcciones: [direccion(LARRALDE, 2000, MORON, [-34.64441, -58.64178])] }
    if (d === 'CRISOLOGO LARRALDE 2099' && censal === '06568010') return { direcciones: [direccion(LARRALDE, 2099, MORON, [-34.64477, -58.64075])] }
    if (d === 'CRISOLOGO LARRALDE entre Zapiola y Chivilcoy') return { direcciones: [cruce([-34.64543, -58.63647], 'JOSE MATIAS ZAPIOLA', 'CHIVILCOY')] }
    if (d === 'CRISOLOGO LARRALDE y Zapiola') return { direcciones: [cruce([-34.64555, -58.63575], 'JOSE MATIAS ZAPIOLA')] }
    if (d === 'Sin Alturas 10' && censal === '06658010') {
      return { direcciones: [direccion(['066580100009999', 'SIN ALTURAS'], 10, QUILMES, null)] }
    }
    return undefined
  },
  calles(p) {
    if (p.get('id') === '066580100000180') {
      return { calles: [{ id: '066580100000180', altura: { inicio: { derecha: 0, izquierda: 0 }, fin: { derecha: 799, izquierda: 800 } } }] }
    }
    if (p.get('id') === '066580100009999') {
      return { calles: [{ id: '066580100009999', altura: { inicio: { derecha: 0, izquierda: 0 }, fin: { derecha: 0, izquierda: 0 } } }] }
    }
    return undefined
  },
  'localidades-censales'(p) {
    const nombre = p.get('nombre')
    if (nombre === 'Castelar') return undefined
    if (nombre === 'Quilmes') return { localidades_censales: [lugar('06658010', 'Quilmes', BSAS, ['06658', 'Quilmes'])] }
    if (nombre === 'Tupungato') return { localidades_censales: [lugar('50119010', 'Tupungato', MENDOZA, ['50119', 'Tupungato'])] }
    return undefined
  },
  ubicacion(p) {
    // Castelar (Morón); lo demás, fuera del país.
    if (Number(p.get('lat')) > -34.7 && Number(p.get('lat')) < -34.6 && Number(p.get('lon')) > -58.7 && Number(p.get('lon')) < -58.6) {
      return { ubicacion: { provincia: BSAS, departamento: ent('06568', 'Morón'), gobierno_local: ent('060568', 'Morón') } }
    }
    return undefined
  },
  localidades(p) {
    if (p.get('departamento') === '06568') {
      return {
        localidades: [
          { id: '0656801001', nombre: 'Castelar', centroide: { lat: -34.6528, lon: -58.6445 } },
          { id: '0656801002', nombre: 'Haedo', centroide: { lat: -34.6437, lon: -58.5936 } },
        ],
      }
    }
    if (p.get('nombre') === 'Castelar') return { localidades: [lugar('0656801001', 'Castelar', BSAS, ['06568', 'Morón'], ['06568010', 'Morón'])] }
    if (p.get('nombre') === 'Palermo' && p.get('provincia') === '02') {
      return { localidades: [lugar('0209101001', 'Palermo', CABA, ['02091', 'Comuna 14'], ['02091010', 'CABA - Comuna 14'])] }
    }
    return undefined
  },
  asentamientos(p) {
    if (p.get('nombre') === 'Santa Clara') {
      return {
        asentamientos: [
          lugar('50070001', 'Santa Clara', MENDOZA, ['50070', 'Lavalle']),
          lugar('50112001', 'Santa Clara', MENDOZA, ['50112', 'San Rafael']),
        ],
      }
    }
    return undefined
  },
}

const VACIO: Record<string, Datos> = {
  direcciones: { direcciones: [] },
  calles: { calles: [] },
  'localidades-censales': { localidades_censales: [] },
  localidades: { localidades: [] },
  asentamientos: { asentamientos: [] },
  departamentos: { departamentos: [] },
  ubicacion: { ubicacion: { provincia: ent(null, null), departamento: ent(null, null), gobierno_local: ent(null, null) } },
}

export function clienteFalso() {
  const fetchFalso = (async (url: string) => {
    const u = new URL(url)
    const recurso = u.pathname.split('/').pop()!
    const datos = MANEJADORES[recurso]?.(u.searchParams) ?? VACIO[recurso]
    return new Response(JSON.stringify(datos), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return new ClienteGeoref({ baseUrl: 'https://georef.test', fetch: fetchFalso })
}
