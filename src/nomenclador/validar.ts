import { controlarCodigoPostal } from './codigoPostal.ts'
import { alturaNumerica, separarEntreCalles, sinNumero, type EntradaDomicilio } from './entrada.ts'
import type { CalleGeoref, ClienteGeoref, DepartamentoGeoref, DireccionGeoref, LugarGeoref } from './georef.ts'
import { buscarProvincia, ID_CABA, provinciaPorId, type Provincia } from './provincias.ts'
import { lugarCoincide, mismoNombre, similitudCalle } from './texto.ts'

// --- Resultado ------------------------------------------------------------------------------

/** Niveles de la escalera de validación, del más general al más preciso. */
export type Nivel = 'provincia' | 'departamento' | 'localidad' | 'calle' | 'altura' | 'ubicacion'

export const NIVELES: readonly { id: Nivel; titulo: string; alcance: string; descripcion: string }[] = [
  { id: 'provincia', titulo: 'Provincia', alcance: 'la provincia', descripcion: 'una de las 24 jurisdicciones.' },
  { id: 'departamento', titulo: 'Departamento', alcance: 'el departamento o partido', descripcion: 'departamento, partido o comuna; se deriva si no se informa.' },
  { id: 'localidad', titulo: 'Localidad', alcance: 'la localidad', descripcion: 'localidad censal, localidad o barrio (BAHRA), o paraje.' },
  { id: 'calle', titulo: 'Calle', alcance: 'la calle', descripcion: 'existe en el callejero oficial de esa localidad.' },
  { id: 'altura', titulo: 'Altura', alcance: 'la altura', descripcion: 'el número está dentro de la numeración de la calle.' },
  { id: 'ubicacion', titulo: 'Ubicación', alcance: 'la ubicación en el mapa', descripcion: 'punto sobre la cuadra, interpolado por numeración.' },
]

/**
 * - `ok`: coincide con la fuente oficial.
 * - `interpretado`: se encontró, pero con otro nombre (búsqueda aproximada): hay que mirar la corrección.
 * - `advertencia`: validado, con una salvedad (p. ej. calle límite entre dos comunas).
 * - `ambiguo`: hay más de un lugar posible y el domicilio no alcanza para elegir.
 * - `no_verificable`: la fuente no tiene el dato (p. ej. calles sin alturas cargadas).
 * - `sin_dato`: no se informó.
 * - `error`: el dato contradice la fuente (no existe, o no está donde se dice).
 */
export type EstadoPaso = 'ok' | 'interpretado' | 'advertencia' | 'ambiguo' | 'no_verificable' | 'sin_dato' | 'error'

/** Estados con los que la validación sigue al nivel siguiente. */
export const ESTADOS_QUE_VALIDAN: ReadonlySet<EstadoPaso> = new Set(['ok', 'interpretado', 'advertencia'])

export interface Paso {
  nivel: Nivel
  estado: EstadoPaso
  declarado: string | null
  normalizado: string | null
  /** ID de Georef del dato normalizado. */
  id: string | null
  detalle: string
}

export interface DatoComplementario {
  campo: string
  valor: string
  estado: EstadoPaso
  detalle: string
}

/** Otra lectura posible del domicilio: al elegirla se aplican los cambios y se vuelve a validar. */
export interface Alternativa {
  etiqueta: string
  detalle: string
  cambios: Partial<EntradaDomicilio>
}

export type Veredicto = 'valido' | 'parcial' | 'invalido'

export interface ResultadoValidacion {
  veredicto: Veredicto
  /** Nivel más preciso validado sin cortes; null si ni la provincia. */
  nivelAlcanzado: Nivel | null
  titulo: string
  resumen: string
  pasos: Paso[]
  complementarios: DatoComplementario[]
  nomenclatura: string | null
  /**
   * `cuadra`: centro de la cuadra entre las calles declaradas; `esquina`: una de esas esquinas;
   * `tramo`: punto interpolado por numeración; `localidad`: centro de la localidad.
   */
  ubicacion: { lat: number; lon: number; precision: 'cuadra' | 'esquina' | 'tramo' | 'localidad' } | null
  /**
   * La cuadra de la altura según la numeración del callejero (del 500 al 599): los puntos donde
   * Georef ubica el primer y el último número. Null si no se pidió o Georef no ubica los dos.
   */
  cuadra: Cuadra | null
  alternativas: Alternativa[]
  observaciones: string[]
  /** Pedidos HTTP a Georef que hizo esta validación (los cacheados no cuentan). */
  pedidos: number
}

export interface Cuadra {
  desde: number
  hasta: number
  inicio: { lat: number; lon: number }
  fin: { lat: number; lon: number }
}

export interface OpcionesValidacion {
  /** Buscar la cuadra por numeración para dibujarla (dos consultas más; default true). */
  cuadra?: boolean
}

// --- Tipos internos ---------------------------------------------------------------------------

interface Lugar {
  fuente: 'localidad censal' | 'localidad' | 'asentamiento'
  id: string
  nombre: string
  censalId: string | null
  censal: string | null
  departamentoId: string | null
  departamento: string | null
  centroide: { lat: number; lon: number }
}

/** Una calle encontrada (con altura, si se buscó una dirección). */
interface Hallazgo {
  calleId: string
  calle: string
  departamentoId: string | null
  departamento: string | null
  censalId: string | null
  censal: string | null
  /** Localidad BAHRA; en CABA, el barrio. */
  localidadId: string | null
  localidad: string | null
  nomenclatura: string
  punto: { lat: number; lon: number } | null
}

/** Distancia máxima entre dos resultados para tomarlos como la misma cuadra (calle límite). */
const METROS_MISMA_CUADRA = 300
/** Desvío a partir del cual se avisa que la numeración no cae en la cuadra declarada. */
const METROS_DESVIO_NUMERACION = 150
/** Distancia máxima entre las dos esquinas declaradas para ubicar entre ellas. */
const METROS_ENTRE_ESQUINAS = 500

/** Ubicación por las calles que cruzan la cuadra. */
interface Cruce {
  punto: { lat: number; lon: number } | null
  precision: 'cuadra' | 'esquina'
  /** Nombres oficiales de los cruces encontrados. */
  cruces: string[]
}

// --- Validación -------------------------------------------------------------------------------

export async function validarDomicilio(
  cliente: ClienteGeoref,
  entrada: EntradaDomicilio,
  opciones: OpcionesValidacion = {},
): Promise<ResultadoValidacion> {
  const pedidosAntes = cliente.pedidos
  const pasos = new Map<Nivel, Paso>()
  const observaciones: string[] = []
  const alternativas: Alternativa[] = []
  const paso = (nivel: Nivel, datos: Omit<Paso, 'nivel' | 'id' | 'declarado' | 'normalizado'> & Partial<Paso>) =>
    pasos.set(nivel, { declarado: null, normalizado: null, id: null, ...datos, nivel })

  const provincia = provinciaPorId(entrada.provinciaId)
  if (!provincia) {
    paso('provincia', { estado: 'sin_dato', detalle: 'Falta la provincia: sin ella no se puede buscar.' })
    return armarResultado({ pasos, entrada, provincia, observaciones, alternativas, pedidos: 0 })
  }
  paso('provincia', { estado: 'ok', declarado: provincia.nombre, normalizado: provincia.nombre, id: provincia.id, detalle: 'Provincia elegida de la lista oficial.' })

  const esCaba = provincia.id === ID_CABA
  const calleDeclarada = entrada.calle.trim()
  const departamentoDeclarado = entrada.departamento.trim()
  let localidadDeclarada = entrada.localidad.trim()
  // "CABA" o "Capital Federal" como localidad no agrega nada: es la provincia.
  if (esCaba && buscarProvincia(localidadDeclarada)?.id === ID_CABA) localidadDeclarada = ''

  // 1. Localidad declarada: localidad censal, localidad BAHRA (o barrio) o paraje.
  let lugares: Lugar[] = []
  let lugarAproximado = false
  if (localidadDeclarada) {
    const encontrados = await buscarLugares(cliente, localidadDeclarada, provincia.id)
    const exactos = encontrados.filter((l) => mismoNombre(l.nombre, localidadDeclarada))
    lugares = exactos.length ? exactos : encontrados.slice(0, 1)
    lugarAproximado = !exactos.length && lugares.length > 0
    if (departamentoDeclarado) {
      const delDepartamento = lugares.filter((l) => lugarCoincide(departamentoDeclarado, l.departamento))
      if (delDepartamento.length) lugares = delDepartamento
    }
    lugares = distintos(lugares).slice(0, 4)
  }

  // 2. Calle (y altura): dentro de los lugares declarados, o en toda la provincia.
  const altura = alturaNumerica(entrada.altura)
  let hallazgos: Hallazgo[] = []
  let hallazgosFuera: Hallazgo[] = []
  if (calleDeclarada) {
    const buscar = (filtro: Record<string, string>) =>
      altura !== null
        ? buscarDirecciones(cliente, `${calleDeclarada} ${altura}`, provincia.id, filtro)
        : buscarCalles(cliente, calleDeclarada, provincia.id, filtro)
    if (lugares.length) {
      const filtros = distintosPor(lugares.map(filtroDeLugar), (f) => JSON.stringify(f))
      hallazgos = (await Promise.all(filtros.map(buscar))).flat()
      // No está donde se dijo: ¿existe en otra localidad de la provincia?
      if (!hallazgos.length) hallazgosFuera = await buscar({})
    } else if (!localidadDeclarada) {
      hallazgos = await buscar({})
    } else {
      // La localidad no existe: se busca la calle en la provincia para sugerir dónde está.
      hallazgosFuera = await buscar({})
    }
  }

  // 3. Elegir el mejor resultado y detectar si hay otros igual de buenos en otro lugar.
  const puntaje = (h: Hallazgo) =>
    similitudCalle(calleDeclarada, h.calle) * 4 +
    (h.punto ? 2 : 0) +
    (lugares.some((l) => l.id === h.localidadId || l.id === h.censalId) ? 3 : 0) +
    (localidadDeclarada && lugarCoincide(localidadDeclarada, h.localidad) ? 1 : 0) +
    (departamentoDeclarado && lugarCoincide(departamentoDeclarado, h.departamento) ? 1 : 0)
  const hallazgo = mejor(hallazgos, puntaje)

  let otrosLugares: Hallazgo[] = []
  let calleLimite = false
  if (hallazgo) {
    otrosLugares = distintosPor(
      hallazgos.filter((h) => h.calle === hallazgo.calle && h.censalId !== hallazgo.censalId && (altura === null || h.punto)),
      (h) => h.censalId ?? h.calleId,
    )
    calleLimite =
      otrosLugares.length > 0 &&
      hallazgo.punto !== null &&
      otrosLugares.every((h) => h.punto && distanciaMetros(hallazgo.punto!, h.punto) <= METROS_MISMA_CUADRA)
    for (const h of otrosLugares) alternativas.push(alternativaDeLugar(h, esCaba))
    // Otras calles parecidas en el mismo lugar ("RIVADAVIA" y "BERNARDINO RIVADAVIA").
    const parecidas = distintosPor(
      hallazgos.filter((h) => h.calle !== hallazgo.calle && h.censalId === hallazgo.censalId && similitudCalle(calleDeclarada, h.calle) > 0),
      (h) => h.calle,
    )
    for (const h of parecidas.slice(0, 3)) {
      alternativas.push({ etiqueta: h.calle, detalle: `Otra calle con nombre parecido en ${h.localidad ?? h.censal}.`, cambios: { calle: h.calle } })
    }
  }
  for (const h of distintosPor(hallazgosFuera, (h) => `${h.censalId}|${h.localidadId}`).slice(0, 5)) {
    alternativas.push(alternativaDeLugar(h, esCaba, `La calle ${h.calle} existe en ${lugarDe(h)}.`))
  }
  const ambiguo = otrosLugares.length > 0 && !calleLimite

  // 4. Pasos: localidad.
  const lugarElegido = hallazgo
    ? (lugares.find((l) => (l.censalId ? l.censalId === hallazgo.censalId : l.departamentoId === hallazgo.departamentoId)) ?? null)
    : (lugares[0] ?? null)
  const nombresOtros = (hs: Hallazgo[]) => [hallazgo!, ...hs].map(lugarDe).join('; ')
  if (localidadDeclarada && !lugares.length) {
    paso('localidad', {
      estado: 'error',
      declarado: localidadDeclarada,
      detalle: `No se encontró "${localidadDeclarada}" en ${provincia.nombre} (ni como localidad, barrio o paraje).`,
    })
  } else if (hallazgo) {
    const normalizado = hallazgo.localidad ?? hallazgo.censal
    const base = { declarado: localidadDeclarada || null, normalizado, id: hallazgo.localidadId ?? hallazgo.censalId }
    if (ambiguo) {
      paso('localidad', { ...base, estado: 'ambiguo', detalle: `La calle está en más de un lugar: ${nombresOtros(otrosLugares)}. Indicá la localidad (o el departamento) para elegir.` })
    } else if (!localidadDeclarada) {
      paso('localidad', { ...base, estado: 'ok', detalle: esCaba ? 'No se informó el barrio: se deriva de la dirección.' : 'No se informó: se deriva de la calle, que está en un solo lugar de la provincia.' })
    } else if (mismoNombre(localidadDeclarada, hallazgo.localidad) || mismoNombre(localidadDeclarada, hallazgo.censal)) {
      paso('localidad', { ...base, estado: 'ok', detalle: descripcionLugar(hallazgo) })
    } else if (lugarElegido && !lugarAproximado) {
      paso('localidad', {
        ...base,
        estado: 'advertencia',
        detalle: `La dirección figura en ${normalizado}, no en ${lugarElegido.nombre}${hallazgo.censal ? ` (las dos dentro de ${hallazgo.censal})` : ''}.`,
      })
    } else {
      paso('localidad', { ...base, estado: 'interpretado', detalle: `Se interpretó "${localidadDeclarada}" como ${normalizado}.` })
    }
  } else if (lugares.length) {
    const lugar = lugares[0]!
    const base = { declarado: localidadDeclarada, normalizado: lugar.nombre, id: lugar.id }
    if (lugares.length > 1 && !hallazgosFuera.length) {
      paso('localidad', {
        ...base,
        estado: 'ambiguo',
        detalle: `Hay ${lugares.length} lugares llamados ${lugar.nombre} en ${provincia.nombre}: ${lugares.map((l) => `${l.nombre} (${l.departamento})`).join(', ')}. Indicá el departamento.`,
      })
      for (const l of lugares) {
        alternativas.push({ etiqueta: `${l.nombre}, ${l.departamento}`, detalle: `${l.fuente} en el departamento ${l.departamento}.`, cambios: { localidad: l.nombre, departamento: l.departamento ?? '' } })
      }
    } else if (lugarAproximado) {
      paso('localidad', { ...base, estado: 'interpretado', detalle: `Se interpretó "${localidadDeclarada}" como ${lugar.nombre} (${lugar.fuente}).` })
    } else {
      paso('localidad', { ...base, estado: 'ok', detalle: `${primeraMayuscula(lugar.fuente)}${lugar.censal && lugar.censal !== lugar.nombre ? `, dentro de ${lugar.censal}` : ''}.` })
    }
  } else if (calleDeclarada && hallazgos.length === 0 && !localidadDeclarada) {
    paso('localidad', { estado: 'sin_dato', detalle: 'No se informó la localidad, y la calle no alcanza para deducirla.' })
  } else {
    paso('localidad', { estado: 'sin_dato', detalle: esCaba ? 'No se informó el barrio.' : 'No se informó la localidad.' })
  }

  // 5. Pasos: calle, altura y ubicación.
  const lugarPrincipal = lugarElegido ?? lugares[0] ?? null
  const dondeSeBusco = lugarPrincipal ? lugarPrincipal.nombre : provincia.nombre
  let ubicacion: ResultadoValidacion['ubicacion'] = null

  if (!calleDeclarada) {
    const paraje = lugarPrincipal?.fuente === 'asentamiento'
    paso('calle', {
      estado: paraje ? 'no_verificable' : 'sin_dato',
      detalle: paraje ? 'Paraje rural: el callejero oficial no tiene calles para este lugar.' : 'No se informó la calle.',
    })
  } else if (hallazgo) {
    const similitud = similitudCalle(calleDeclarada, hallazgo.calle)
    paso('calle', {
      estado: similitud > 0 ? 'ok' : 'interpretado',
      declarado: calleDeclarada,
      normalizado: hallazgo.calle,
      id: hallazgo.calleId,
      detalle:
        similitud > 0
          ? `Existe en el callejero oficial (INDEC) de ${lugarDe(hallazgo)}.`
          : `No hay una calle "${calleDeclarada}": Georef la interpretó como ${hallazgo.calle}. Revisar que sea la misma.`,
    })
  } else if (hallazgosFuera.length) {
    paso('calle', {
      estado: 'error',
      declarado: calleDeclarada,
      detalle: `No existe una calle "${calleDeclarada}" en ${dondeSeBusco}${lugares.length ? '' : ' (la localidad no se encontró)'}; sí en ${distintosPor(hallazgosFuera, lugarDe).slice(0, 3).map(lugarDe).join('; ')}.`,
    })
  } else {
    paso('calle', { estado: 'error', declarado: calleDeclarada, detalle: `No se encontró la calle "${calleDeclarada}" en ${dondeSeBusco}.` })
  }

  const alturaEscrita = entrada.altura.trim()
  if (!alturaEscrita || sinNumero(alturaEscrita)) {
    paso('altura', { estado: 'sin_dato', declarado: alturaEscrita || null, detalle: alturaEscrita ? 'Domicilio sin número (S/N).' : 'No se informó la altura.' })
  } else if (altura === null) {
    paso('altura', { estado: 'error', declarado: alturaEscrita, detalle: `"${alturaEscrita}" no es una altura válida (se espera un número de puerta).` })
  } else if (!hallazgo) {
    paso('altura', { estado: 'no_verificable', declarado: alturaEscrita, detalle: 'Sin una calle validada no se puede controlar la altura.' })
  } else if (hallazgo.punto) {
    paso('altura', {
      estado: 'ok',
      declarado: alturaEscrita,
      normalizado: String(altura),
      detalle: `El ${altura} está dentro del rango de alturas de ${hallazgo.calle}.`,
    })
  } else {
    const rango = await rangoDeCalle(cliente, hallazgo.calleId)
    if (!rango) {
      paso('altura', { estado: 'no_verificable', declarado: alturaEscrita, detalle: `El callejero no tiene alturas cargadas para ${hallazgo.calle}: se valida solo hasta la calle.` })
    } else if (altura < rango.desde || altura > rango.hasta) {
      paso('altura', { estado: 'error', declarado: alturaEscrita, detalle: `El ${altura} no existe en ${hallazgo.calle}: la numeración va del ${rango.desde} al ${rango.hasta}.` })
    } else {
      paso('altura', {
        estado: 'ok',
        declarado: alturaEscrita,
        normalizado: String(altura),
        detalle: `Está dentro de la numeración de la calle (${rango.desde}–${rango.hasta}), aunque Georef no la pudo ubicar en un tramo.`,
      })
    }
  }

  // Entre calles: ubica mejor que la numeración, que en el callejero no siempre es pareja.
  const complementarios: DatoComplementario[] = []
  const entreEscrito = (entrada.entreCalles ?? '').trim()
  const entre = separarEntreCalles(entreEscrito)
  let cruce: Cruce | null = null
  if (entreEscrito && !entre) {
    complementarios.push({ campo: 'Entre calles', valor: entreEscrito, estado: 'advertencia', detalle: 'Se esperan dos calles: "Zapiola y Chivilcoy".' })
  } else if (entre && !hallazgo) {
    complementarios.push({ campo: 'Entre calles', valor: entreEscrito, estado: 'no_verificable', detalle: 'Sin una calle validada no se pueden buscar los cruces.' })
  } else if (entre && hallazgo) {
    cruce = await ubicarEntreCalles(cliente, hallazgo, entre, provincia.id)
    complementarios.push(
      !cruce
        ? { campo: 'Entre calles', valor: entreEscrito, estado: 'advertencia', detalle: `${hallazgo.calle} no cruza ${entre[0]} ni ${entre[1]} en el callejero: se ubica por numeración.` }
        : cruce.precision === 'cuadra'
          ? { campo: 'Entre calles', valor: entreEscrito, estado: 'ok', detalle: `Cuadra entre ${cruce.cruces.join(' y ')}.` }
          : { campo: 'Entre calles', valor: entreEscrito, estado: 'advertencia', detalle: `Solo se encontró el cruce con ${cruce.cruces.join(' y ')}: se ubica en esa esquina.` },
    )
  }

  if (cruce?.punto) {
    ubicacion = { ...cruce.punto, precision: cruce.precision }
    paso('ubicacion', {
      estado: 'ok',
      normalizado: `${cruce.punto.lat.toFixed(6)}, ${cruce.punto.lon.toFixed(6)}`,
      detalle:
        cruce.precision === 'cuadra'
          ? `Centro de la cuadra entre ${cruce.cruces.join(' y ')}: precisión de cuadra, no de parcela.`
          : `Esquina con ${cruce.cruces[0]}: precisión de cuadra, no de parcela.`,
    })
    const desvio = hallazgo?.punto ? distanciaMetros(hallazgo.punto, cruce.punto) : 0
    if (desvio > METROS_DESVIO_NUMERACION) {
      observaciones.push(
        `Por numeración, Georef ubica el ${altura} a ${Math.round(desvio)} m de la cuadra declarada: la numeración del callejero no es pareja en ${hallazgo!.calle}. Se usa la cuadra entre calles; conviene confirmar la altura.`,
      )
    }
  } else if (hallazgo?.punto) {
    ubicacion = { ...hallazgo.punto, precision: 'tramo' }
    paso('ubicacion', {
      estado: 'ok',
      normalizado: `${hallazgo.punto.lat.toFixed(6)}, ${hallazgo.punto.lon.toFixed(6)}`,
      detalle: 'Punto interpolado sobre la cuadra según la numeración: precisión de cuadra, no de parcela.',
    })
    if (calleLimite) {
      observaciones.push(
        `${hallazgo.calle} ${altura} está sobre un límite: Georef la ubica en ${nombresOtros(otrosLugares)}. La vereda (par o impar) define de qué lado cae.`,
      )
    }
  } else {
    const centro = lugarPrincipal?.centroide ?? (hallazgo?.censalId ? await centroideCensal(cliente, hallazgo.censalId) : null)
    if (centro) ubicacion = { ...centro, precision: 'localidad' }
    paso('ubicacion', {
      estado: centro ? 'no_verificable' : 'sin_dato',
      normalizado: centro ? `${centro.lat.toFixed(5)}, ${centro.lon.toFixed(5)}` : null,
      detalle: centro ? 'Solo aproximada: centro de la localidad, no del domicilio.' : 'No hay datos para ubicar el domicilio.',
    })
  }

  const cuadra = hallazgo?.punto && altura !== null && opciones.cuadra !== false ? await cuadraDeNumeracion(cliente, hallazgo, altura, provincia.id) : null

  // 6. Departamento: el del resultado, comparado con el declarado.
  const fuentesDepartamento: { departamentoId: string | null; departamento: string | null }[] = hallazgo
    ? [hallazgo, ...(ambiguo ? otrosLugares : [])]
    : lugares
  const departamentosPosibles = distintosPor(fuentesDepartamento, (l) => l.departamentoId ?? '').filter((l) => l.departamentoId)
  const departamento = departamentosPosibles[0] ?? null
  if (departamento) {
    const base = { declarado: departamentoDeclarado || null, normalizado: departamento.departamento, id: departamento.departamentoId }
    if (departamentosPosibles.length > 1) {
      paso('departamento', { ...base, estado: 'ambiguo', detalle: `Puede ser ${departamentosPosibles.map((d) => d.departamento).join(', ')}.` })
    } else if (departamentoDeclarado && !lugarCoincide(departamentoDeclarado, departamento.departamento)) {
      paso('departamento', { ...base, estado: 'error', detalle: `El domicilio está en ${departamento.departamento}, no en ${departamentoDeclarado}.` })
    } else if (calleLimite && hallazgo && otrosLugares.some((h) => h.departamentoId !== hallazgo.departamentoId)) {
      paso('departamento', { ...base, estado: 'advertencia', detalle: `Calle límite: del otro lado es ${otrosLugares.map((h) => h.departamento).join(', ')}.` })
    } else {
      paso('departamento', {
        ...base,
        estado: 'ok',
        detalle: departamentoDeclarado ? 'Coincide con el declarado.' : `No se informó: se deriva ${hallazgo ? 'de la dirección' : 'de la localidad'}.`,
      })
    }
  } else if (departamentoDeclarado) {
    const encontrado = await buscarDepartamento(cliente, departamentoDeclarado, provincia.id)
    paso('departamento', encontrado
      ? { estado: 'ok', declarado: departamentoDeclarado, normalizado: encontrado.nombre, id: encontrado.id, detalle: `Existe en ${provincia.nombre}.` }
      : { estado: 'error', declarado: departamentoDeclarado, detalle: `No hay un departamento o partido "${departamentoDeclarado}" en ${provincia.nombre}.` })
  } else {
    paso('departamento', { estado: 'sin_dato', detalle: 'No se informó, y no se pudo derivar de la localidad ni de la calle.' })
  }

  const nomenclatura = hallazgo
    ? hallazgo.nomenclatura
    : lugarPrincipal
      ? [lugarPrincipal.nombre, lugarPrincipal.departamento, provincia.nombre].filter(Boolean).join(', ')
      : null

  return armarResultado({
    pasos,
    entrada,
    provincia,
    observaciones,
    alternativas,
    nomenclatura,
    ubicacion,
    cuadra,
    complementarios,
    pedidos: cliente.pedidos - pedidosAntes,
  })
}

// --- Armado del resultado -----------------------------------------------------------------------

function armarResultado(datos: {
  pasos: Map<Nivel, Paso>
  entrada: EntradaDomicilio
  provincia: Provincia | undefined
  observaciones: string[]
  alternativas: Alternativa[]
  nomenclatura?: string | null
  ubicacion?: ResultadoValidacion['ubicacion']
  cuadra?: Cuadra | null
  /** Además de los que salen de la entrada (piso, depto., CP). */
  complementarios?: DatoComplementario[]
  pedidos: number
}): ResultadoValidacion {
  const pasos = NIVELES.map(
    ({ id }) => datos.pasos.get(id) ?? { nivel: id, estado: 'sin_dato' as const, declarado: null, normalizado: null, id: null, detalle: 'Sin evaluar.' },
  )
  const complementarios = [...datosComplementarios(datos.entrada, datos.provincia), ...(datos.complementarios ?? [])]

  let nivelAlcanzado: Nivel | null = null
  for (const p of pasos) {
    if (!ESTADOS_QUE_VALIDAN.has(p.estado)) break
    nivelAlcanzado = p.nivel
  }

  const errores = [...pasos, ...complementarios].filter((p) => p.estado === 'error')
  const veredicto: Veredicto = errores.length ? 'invalido' : nivelAlcanzado === 'ubicacion' ? 'valido' : 'parcial'
  const corte = pasos.find((p) => !ESTADOS_QUE_VALIDAN.has(p.estado))
  const interpretados = pasos.filter((p) => p.estado === 'interpretado')
  const alcance = NIVELES.find((n) => n.id === nivelAlcanzado)?.alcance

  let titulo: string
  let resumen: string
  if (veredicto === 'valido') {
    titulo = interpretados.length ? 'Válido, con correcciones' : 'Domicilio válido'
    resumen = 'Se validó hasta el número de puerta: la altura existe en la calle y el domicilio se ubicó sobre la cuadra.'
    if (interpretados.length) resumen += ` Revisar: ${interpretados.map((p) => p.detalle).join(' ')}`
  } else if (veredicto === 'invalido') {
    titulo = 'Domicilio inválido'
    resumen = errores.map((e) => e.detalle).join(' ')
  } else {
    titulo = alcance ? `Válido hasta ${alcance}` : 'No se pudo validar'
    resumen = corte ? corte.detalle : ''
  }

  return {
    veredicto,
    nivelAlcanzado,
    titulo,
    resumen,
    pasos,
    complementarios,
    nomenclatura: datos.nomenclatura ?? null,
    ubicacion: datos.ubicacion ?? null,
    cuadra: datos.cuadra ?? null,
    alternativas: distintosPor(datos.alternativas, (a) => JSON.stringify(a.cambios)).slice(0, 8),
    observaciones: datos.observaciones,
    pedidos: datos.pedidos,
  }
}

function datosComplementarios(entrada: EntradaDomicilio, provincia: Provincia | undefined): DatoComplementario[] {
  const datos: DatoComplementario[] = []
  const unidad = 'Las fuentes públicas (callejero INDEC) llegan a la cuadra: pisos y unidades requieren catastro.'
  if (entrada.piso.trim()) datos.push({ campo: 'Piso', valor: entrada.piso.trim(), estado: 'no_verificable', detalle: unidad })
  if (entrada.depto.trim()) datos.push({ campo: 'Departamento / unidad', valor: entrada.depto.trim(), estado: 'no_verificable', detalle: unidad })
  if (entrada.codigoPostal.trim() && provincia) {
    const control = controlarCodigoPostal(entrada.codigoPostal, provincia)
    if (control.estado !== 'sin_dato') {
      const estado: EstadoPaso =
        control.estado === 'coincide' ? 'ok' : control.estado === 'no_verificable' ? 'no_verificable' : 'error'
      datos.push({ campo: 'Código postal', valor: entrada.codigoPostal.trim(), estado, detalle: control.detalle })
    }
  }
  return datos
}

// --- Consultas a Georef ------------------------------------------------------------------------

async function buscarLugares(cliente: ClienteGeoref, nombre: string, provincia: string): Promise<Lugar[]> {
  const parametros = { nombre, provincia, campos: 'completo', max: 10 }
  const [censales, localidades, asentamientos] = await Promise.all([
    cliente.consultar<{ localidades_censales: LugarGeoref[] }>('localidades-censales', parametros),
    cliente.consultar<{ localidades: LugarGeoref[] }>('localidades', parametros),
    cliente.consultar<{ asentamientos: LugarGeoref[] }>('asentamientos', parametros),
  ])
  const lugares = [
    ...censales.localidades_censales.map((l) => lugarDeGeoref(l, 'localidad censal')),
    ...localidades.localidades.map((l) => lugarDeGeoref(l, 'localidad')),
    ...asentamientos.asentamientos.map((l) => lugarDeGeoref(l, 'asentamiento')),
  ]
  // Una localidad BAHRA con el mismo nombre que su localidad censal es el mismo lugar;
  // localidades y asentamientos BAHRA comparten IDs.
  const vistos = new Set<string>()
  return lugares.filter((l) => {
    const clave = l.fuente === 'localidad censal' || !mismoNombre(l.nombre, l.censal) ? l.id : l.censalId!
    if (vistos.has(clave) || vistos.has(l.id)) return false
    vistos.add(clave)
    vistos.add(l.id)
    return true
  })
}

function lugarDeGeoref(l: LugarGeoref, fuente: Lugar['fuente']): Lugar {
  const censal = fuente === 'localidad censal' ? { id: l.id, nombre: l.nombre } : l.localidad_censal
  return {
    fuente,
    id: l.id,
    nombre: l.nombre,
    censalId: censal?.id ?? null,
    censal: censal?.nombre ?? null,
    departamentoId: l.departamento.id,
    departamento: l.departamento.nombre,
    centroide: { lat: l.centroide.lat, lon: l.centroide.lon },
  }
}

/** Filtro de Georef para buscar calles dentro de un lugar. */
function filtroDeLugar(l: Lugar): Record<string, string> {
  if (l.censalId) return { localidad_censal: l.censalId }
  return l.departamentoId ? { departamento: l.departamentoId } : {}
}

async function buscarDirecciones(cliente: ClienteGeoref, direccion: string, provincia: string, filtro: Record<string, string>): Promise<Hallazgo[]> {
  // Una calle larga aparece como varios tramos o en varias comunas: se piden varios resultados.
  const { direcciones } = await cliente.consultar<{ direcciones: DireccionGeoref[] }>('direcciones', {
    direccion,
    provincia,
    ...filtro,
    campos: 'completo',
    max: 10,
  })
  return direcciones
    .filter((d) => d.calle.id)
    .map((d) => ({
      calleId: d.calle.id!,
      calle: d.calle.nombre!,
      departamentoId: d.departamento.id,
      departamento: d.departamento.nombre,
      censalId: d.localidad_censal.id,
      censal: d.localidad_censal.nombre,
      localidadId: d.localidad?.id ?? null,
      localidad: d.localidad?.nombre ?? null,
      nomenclatura: d.nomenclatura,
      punto: d.ubicacion.lat !== null && d.ubicacion.lon !== null ? { lat: d.ubicacion.lat, lon: d.ubicacion.lon } : null,
    }))
}

async function buscarCalles(cliente: ClienteGeoref, nombre: string, provincia: string, filtro: Record<string, string>): Promise<Hallazgo[]> {
  const { calles } = await cliente.consultar<{ calles: CalleGeoref[] }>('calles', {
    nombre,
    provincia,
    ...filtro,
    campos: 'completo',
    max: 10,
  })
  return calles.map((c) => ({
    calleId: c.id,
    calle: c.nombre,
    departamentoId: c.departamento.id,
    departamento: c.departamento.nombre,
    censalId: c.localidad_censal.id,
    censal: c.localidad_censal.nombre,
    localidadId: c.localidad?.id ?? null,
    localidad: c.localidad?.nombre ?? null,
    nomenclatura: c.nomenclatura,
    punto: null,
  }))
}

/**
 * Ubica la cuadra por las calles que la cruzan: "CALLE entre A y B" (Georef devuelve el centro
 * de la cuadra si A y B son consecutivas). Si no, las esquinas: el punto medio si están las dos
 * y cerca, o la que haya. Null si la calle no cruza ninguna.
 */
async function ubicarEntreCalles(cliente: ClienteGeoref, h: Hallazgo, [a, b]: [string, string], provincia: string): Promise<Cruce | null> {
  const filtro: Record<string, string> = h.censalId ? { localidad_censal: h.censalId } : h.departamentoId ? { departamento: h.departamentoId } : {}
  const buscar = async (direccion: string) => {
    const { direcciones } = await cliente.consultar<{ direcciones: DireccionGeoref[] }>('direcciones', {
      direccion,
      provincia,
      ...filtro,
      campos: 'completo',
      max: 5,
    })
    return direcciones.find((d) => d.calle.id === h.calleId && d.ubicacion.lat !== null && d.ubicacion.lon !== null) ?? null
  }
  const punto = (d: DireccionGeoref) => ({ lat: d.ubicacion.lat!, lon: d.ubicacion.lon! })

  const cuadra = await buscar(`${h.calle} entre ${a} y ${b}`)
  if (cuadra) {
    return { punto: punto(cuadra), precision: 'cuadra', cruces: [cuadra.calle_cruce_1?.nombre ?? a, cuadra.calle_cruce_2?.nombre ?? b] }
  }
  const esquinas = (await Promise.all([a, b].map((x) => buscar(`${h.calle} y ${x}`)))).filter((d) => d !== null)
  const nombre = (d: DireccionGeoref, i: number) => d.calle_cruce_1?.nombre ?? [a, b][i]!
  if (esquinas.length === 2) {
    const [p1, p2] = esquinas.map(punto) as [{ lat: number; lon: number }, { lat: number; lon: number }]
    if (distanciaMetros(p1, p2) <= METROS_ENTRE_ESQUINAS) {
      return { punto: { lat: (p1.lat + p2.lat) / 2, lon: (p1.lon + p2.lon) / 2 }, precision: 'cuadra', cruces: esquinas.map(nombre) }
    }
  }
  const esquina = esquinas[0]
  return esquina ? { punto: punto(esquina), precision: 'esquina', cruces: [nombre(esquina, 0)] } : null
}

/**
 * Una cuadra mide unos 100 m, pero la numeración del callejero no siempre es pareja (en Crisólogo
 * Larralde, Castelar, el 2000 cae en la esquina y del 2001 al 2099 entran en 30 m, 500 m más
 * allá): justamente eso se quiere ver. Más que esto entre las puntas, es otro tramo de la calle.
 */
const METROS_CUADRA_MAXIMA = 1000

/**
 * Los puntos donde Georef ubica el primer y el último número de la cuadra de la altura (500 y
 * 599 para el 550). Si el último no existe (la calle termina antes), la cuadra llega hasta la
 * altura buscada.
 */
async function cuadraDeNumeracion(cliente: ClienteGeoref, h: Hallazgo, altura: number, provincia: string): Promise<Cuadra | null> {
  const desde = Math.floor(altura / 100) * 100
  const filtro: Record<string, string> = h.censalId ? { localidad_censal: h.censalId } : h.departamentoId ? { departamento: h.departamentoId } : {}
  const ubicar = async (numero: number) => {
    const { direcciones } = await cliente.consultar<{ direcciones: DireccionGeoref[] }>('direcciones', {
      direccion: `${h.calle} ${numero}`,
      provincia,
      ...filtro,
      campos: 'calle.id,ubicacion.lat,ubicacion.lon',
      max: 5,
    })
    const d = direcciones.find((x) => x.calle.id === h.calleId && x.ubicacion.lat !== null && x.ubicacion.lon !== null)
    return d ? { lat: d.ubicacion.lat!, lon: d.ubicacion.lon! } : null
  }
  // El número redondo suele caer en el borde entre dos tramos y Georef no lo ubica: se prueba
  // el de la otra vereda (2001 en lugar de 2000, 2098 en lugar de 2099).
  const ubicarAlguno = async (numeros: number[]) => {
    for (const numero of numeros) {
      const punto = await ubicar(numero)
      if (punto) return { numero, punto }
    }
    return null
  }
  const [inicio, fin] = await Promise.all([ubicarAlguno([Math.max(desde, 1), desde + 1]), ubicarAlguno([desde + 99, desde + 98])])
  // Sin el último número (la calle termina antes), la cuadra llega hasta la altura buscada.
  const final = fin ?? (h.punto ? { numero: altura, punto: h.punto } : null)
  if (!inicio || !final) return null
  const largo = distanciaMetros(inicio.punto, final.punto)
  if (largo > METROS_CUADRA_MAXIMA || largo < 1) return null
  return { desde: inicio.numero, hasta: final.numero, inicio: inicio.punto, fin: final.punto }
}

/** Rango de numeración de la calle; null si el callejero no tiene alturas para ella. */
async function rangoDeCalle(cliente: ClienteGeoref, id: string): Promise<{ desde: number; hasta: number } | null> {
  const { calles } = await cliente.consultar<{ calles: CalleGeoref[] }>('calles', { id, campos: 'id,altura', max: 1 })
  const calle = calles[0]
  if (!calle) return null
  const desde = Math.min(calle.altura.inicio.derecha, calle.altura.inicio.izquierda) || 1
  const hasta = Math.max(calle.altura.fin.derecha, calle.altura.fin.izquierda)
  return hasta > desde ? { desde, hasta } : null
}

async function centroideCensal(cliente: ClienteGeoref, id: string): Promise<{ lat: number; lon: number } | null> {
  const { localidades_censales } = await cliente.consultar<{ localidades_censales: LugarGeoref[] }>('localidades-censales', {
    id,
    campos: 'id,centroide',
    max: 1,
  })
  return localidades_censales[0]?.centroide ?? null
}

async function buscarDepartamento(cliente: ClienteGeoref, nombre: string, provincia: string): Promise<DepartamentoGeoref | null> {
  const { departamentos } = await cliente.consultar<{ departamentos: DepartamentoGeoref[] }>('departamentos', {
    nombre,
    provincia,
    campos: 'id,nombre,provincia.id',
    max: 5,
  })
  return departamentos.find((d) => lugarCoincide(nombre, d.nombre)) ?? null
}

// --- Utilidades ---------------------------------------------------------------------------------

function lugarDe(h: Hallazgo): string {
  // En CABA la localidad censal es "CABA - Comuna N": no agrega nada a la comuna.
  const localidad = h.localidad ?? (h.censal?.startsWith('CABA - ') ? null : h.censal)
  return [localidad, h.departamento !== localidad ? h.departamento : null].filter(Boolean).join(', ')
}

function descripcionLugar(h: Hallazgo): string {
  return h.localidad && h.censal && h.localidad !== h.censal ? `${h.localidad}, dentro de la localidad censal ${h.censal}.` : 'Coincide con la localidad oficial.'
}

function alternativaDeLugar(h: Hallazgo, esCaba: boolean, detalle?: string): Alternativa {
  return {
    etiqueta: `${h.calle}, ${lugarDe(h)}`,
    detalle: detalle ?? `La misma dirección también existe en ${lugarDe(h)}.`,
    cambios: {
      localidad: h.localidad ?? (esCaba ? '' : (h.censal ?? '')),
      departamento: h.departamento ?? '',
    },
  }
}

function mejor<T>(items: T[], puntaje: (item: T) => number): T | null {
  let elegido: T | null = null
  let maximo = -Infinity
  for (const item of items) {
    const p = puntaje(item)
    if (p > maximo) {
      maximo = p
      elegido = item
    }
  }
  return elegido
}

function distintosPor<T>(items: T[], clave: (item: T) => string): T[] {
  const vistos = new Set<string>()
  return items.filter((item) => {
    const k = clave(item)
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

/** Lugares que son el mismo (misma localidad censal y mismo nombre) cuentan una sola vez. */
const distintos = (lugares: Lugar[]) => distintosPor(lugares, (l) => `${l.censalId ?? l.id}|${l.nombre}`)

const primeraMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function distanciaMetros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}
