/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de Georef; vacío = API pública. */
  readonly VITE_GEOREF_URL?: string
  /** Commit y fecha del build: los pone vite.config.ts. */
  readonly VITE_VERSION_COMMIT: string
  readonly VITE_VERSION_FECHA: string
}
