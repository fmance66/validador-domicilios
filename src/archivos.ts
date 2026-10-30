/** Descarga un texto como archivo (el navegador lo guarda en Descargas). */
export function descargarArchivo(nombre: string, contenido: string, tipo: string) {
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}

/**
 * Lee un archivo de texto. Excel guarda los CSV en Windows-1252 (no en UTF-8): si el archivo no
 * es UTF-8 válido, se lee de nuevo con esa codificación para no romper los acentos.
 */
export async function leerArchivoDeTexto(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Fecha para nombres de archivo: 2026-09-28. */
export const fechaDeHoy = () => new Date().toISOString().slice(0, 10)
