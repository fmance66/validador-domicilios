import { ClienteGeoref } from './nomenclador/index.ts'

/** Un solo cliente para toda la app: comparte la caché de respuestas entre búsquedas. */
export const cliente = new ClienteGeoref({ baseUrl: import.meta.env.VITE_GEOREF_URL })

export const usaApiPublica = !import.meta.env.VITE_GEOREF_URL
