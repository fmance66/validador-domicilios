# Validador de domicilios (prototipo)

Proyecto personal de Fernando: hace **solo** la validación de un domicilio. Se escribe un domicilio
y el tablero dice si es válido y hasta qué nivel se pudo validar (provincia → departamento →
localidad → calle → altura → ubicación). Detalle en `README.md`.

## Restricciones

- **Cero datos personales reales** con la API pública de Georef (lo que se escribe viaja a un
  servicio externo). Con datos reales, solo una instancia autoalojada: URL en `VITE_GEOREF_URL`.
- Georef se consulta **desde el navegador** (GET, CORS abierto): la app no tiene servidor propio.
- Capturas: Edge headless con `--dump-dom` no devuelve nada en este equipo; usar CDP
  (`--remote-debugging-port`) y `Page.captureScreenshot`.

## Stack

- Vue 3 + OpenVue (fork MIT de PrimeVue 4.5; PrimeVue 5 ya no es MIT) + Vite, TypeScript 6, Vitest.
  Instalar con `npx npm@11 install`. Puerto 7100.
- Tema: Aura con el azul de la barra, en `src/tema.ts`, solo claro. Reset y utilidades propias en
  `src/estilos.css`: no hay Bootstrap, aunque las utilidades usen sus nombres (`mb-3`, `ms-auto`).
- Componentes de OpenVue con import local (`openvue/button`). Para botones con ícono, `Boton.vue`;
  los íconos son Material Symbols, con `Icono.vue`.
- Mapa: MapLibre con Argenmap del IGN (TMS, `scheme: 'tms'`).
- Lógica en `src/nomenclador/` (sin Vue), UI en `src/components/`. La lógica también se publica
  como biblioteca (`npm run build:lib`, `tsconfig.lib.json`): no importar nada de Vue ni de
  `src/` fuera de `nomenclador/` desde ahí.
- Tests de la interfaz: `// @vitest-environment happy-dom` al principio del archivo y `montar()`
  de `src/pruebas/montar.ts` (OpenVue real, sin tema; reemplaza el mapa). `window.print` no existe
  en happy-dom.
- `vue`, `openvue` y `maplibre-gl` van en `devDependencies` a propósito (la biblioteca no las
  arrastra).

## Estilo

- Responder en español rioplatense. Nombres de dominio en español.
- Commits en español: `Feat: <Área>: <qué>` / `Fix: …`.
