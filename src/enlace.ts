import { entradaVacia, leerCoordenadas, parsearDomicilio, type EntradaDomicilio, type Punto } from './nomenclador/index.ts'

/**
 * El domicilio validado viaja en la URL, para compartir una búsqueda con un enlace:
 * un parámetro por campo (`?calle=Av.+Callao&altura=500&provinciaId=02`), o `?q=` con el
 * domicilio en una línea.
 */
const CAMPOS = Object.keys(entradaVacia()) as (keyof EntradaDomicilio)[]

export function entradaDeLaUrl(): EntradaDomicilio | null {
  const parametros = new URLSearchParams(location.search)
  const linea = parametros.get('q')
  if (linea) return parsearDomicilio(linea)
  const entrada = entradaVacia()
  for (const campo of CAMPOS) entrada[campo] = parametros.get(campo) ?? ''
  return CAMPOS.some((c) => entrada[c]) ? entrada : null
}

/** Un punto consultado en el mapa: `?punto=-34.6037,-58.3816`. */
export function puntoDeLaUrl(): Punto | null {
  const punto = new URLSearchParams(location.search).get('punto')
  return punto ? leerCoordenadas(punto) : null
}

export function guardarPuntoEnLaUrl(punto: Punto) {
  history.replaceState(null, '', `?punto=${punto.lat.toFixed(6)},${punto.lon.toFixed(6)}`)
}

export function guardarEnLaUrl(entrada: EntradaDomicilio | null) {
  const parametros = new URLSearchParams()
  for (const campo of CAMPOS) if (entrada?.[campo]) parametros.set(campo, entrada[campo])
  const consulta = parametros.toString()
  history.replaceState(null, '', consulta ? `?${consulta}` : location.pathname)
}
