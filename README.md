# Validador de domicilios (prototipo)

Se escribe un domicilio y el tablero dice si es válido y **hasta qué nivel** se pudo verificar
contra fuentes oficiales (callejero y localidades del INDEC, vía la API
[Georef](https://www.argentina.gob.ar/georef)).

> Prototipo conectado a la API pública de Georef: lo que se escribe viaja a un servicio externo.
> Solo domicilios de prueba. Con datos personales reales, únicamente una instancia autoalojada de
> [georef-ar-api](https://github.com/datosgobar/georef-ar-api) (ver `.env.example`).

## Uso

```sh
npx npm@11 install
npm start              # http://localhost:7100 (se abre solo en el navegador)
npm test               # Vitest: lógica e interfaz (happy-dom), con un Georef falso
npm run typecheck
npm run build:lib      # la lógica como biblioteca, en dist-lib/ (ver más abajo)
```

El domicilio validado queda en la URL (`?calle=…&altura=…&provinciaId=02`), así que una búsqueda
se comparte con el enlace. También acepta `?q=Av. Callao 500, CABA` y `?punto=-34.6037,-58.3816`.

## Qué hace

- **Un domicilio:** se escribe en una línea o por campos, y el tablero muestra el veredicto, la
  escalera de niveles, el detalle, la forma normalizada, alternativas ("¿Quisiste decir…?") y el
  mapa, con la cuadra según la numeración dibujada.
- **Muchos domicilios:** la solapa de validación masiva (ver abajo).
- **¿Qué hay acá?:** un clic en el mapa, coordenadas (`-34.6037, -58.3816`) o un enlace de Google
  Maps en el campo de una línea dicen en qué provincia, departamento y localidad cae el punto, y
  se pueden pasar al formulario. Georef no geocodifica calles al revés (`/ubicacion` llega al
  departamento): la localidad es la de centro más cercano, orientativa. Los enlaces cortos
  (`maps.app.goo.gl`) no traen el punto; hay que abrirlos y copiar el enlace largo.
- **Informe:** "Imprimir / PDF" en el resultado imprime el veredicto, el mapa y el detalle con un
  encabezado (domicilio informado, fecha y fuente); el diálogo de impresión permite guardarlo en PDF.
- **Ayuda:** solapa (y botón en la barra) con cómo escribir un domicilio, qué significa cada nivel,
  estado y veredicto, la validación masiva, el mapa, las correcciones y los límites. Los ejemplos
  se prueban con un clic.
- **Versión en el pie:** commit y fecha del build (`+cambios` si se compiló con cambios sin
  commitear), para confirmar qué versión está publicada.

## Validar muchos domicilios

Solapa **Muchos domicilios**: un CSV o lo que se pega desde Excel (llega separado por
tabulaciones), con una fila de encabezados. Sirve una columna con el domicilio entero
(`domicilio` o `dirección`) o columnas separadas, que se reconocen por el nombre: `calle`,
`número`/`nro`/`altura`, `piso`, `depto`, `entre calles`, `cp`, `localidad`/`barrio`,
`partido`/`departamento`/`comuna` y `provincia` (escrita como sea: "Bs. As.", "CABA"). Las demás
columnas (un ID, por ejemplo) se conservan. Los CSV guardados por Excel en Windows-1252 se leen
bien. **Descargar plantilla** baja un CSV con todas las columnas y dos filas de ejemplo.

Valida de a dos domicilios a la vez, con una pausa entre uno y otro, y con la API pública hasta
500 filas, para no abusar del servicio. Muestra el avance, un resumen por veredicto y por nivel
alcanzado, y el detalle, que se puede filtrar; cada fila se abre en la vista de un domicilio. El
resultado se descarga como CSV (separado por `;` y con BOM, para abrirlo con doble clic en Excel):
la tabla original más `veredicto`, `nivel_alcanzado`, `niveles_validados`, `titulo`, `motivo`,
`forma_normalizada`, los IDs oficiales, `lat`, `lon` y `precision_ubicacion`.

Con la API pública, solo con domicilios de prueba: **nunca un padrón real**.

## Escalera de validación

| Nivel | Qué se verifica |
|---|---|
| 1. Provincia | una de las 24 jurisdicciones |
| 2. Departamento | departamento, partido o comuna; se deriva si no se informa |
| 3. Localidad | localidad censal, localidad o barrio (BAHRA) o paraje; homónimos → ambiguo |
| 4. Calle | existe en el callejero de esa localidad (si no, dónde existe) |
| 5. Altura | el número está dentro de la numeración de la calle |
| 6. Ubicación | centro de la cuadra entre las calles declaradas, o punto interpolado por numeración |

**Entre calles (opcional):** la numeración del callejero no siempre es pareja (Crisólogo Larralde
2049, en Castelar, cae 450 m al oeste de su cuadra). Con las calles que cruzan la cuadra
("Zapiola y Chivilcoy", también dentro de la línea: "… 2049 entre Zapiola y Chivilcoy"), Georef
devuelve el centro de la cuadra; si no son consecutivas, se usan las esquinas que encuentre. Si
la numeración cae a más de 150 m de esa cuadra, se avisa.

**La cuadra en el mapa:** se dibuja la cuadra de la altura según la numeración (del 2000 al 2099
para el 2049): dónde ubica Georef el primer y el último número. Si el punto o las entrecalles
caen lejos de esa línea, la numeración no es pareja. Son dos consultas más por domicilio; la
validación masiva no las hace.

**Corrección manual:** desde el mapa se puede mover el punto a mano. Queda guardado en el
navegador por calle y altura, y no cambia la validación. Las correcciones se descargan en JSON
(para reportar los desvíos) y se importan: así se juntan las de varias personas sin un servidor.
Si el mismo domicilio está corregido en los dos lados, queda la corrección más reciente.

El nivel alcanzado es el último validado sin cortes. Cada nivel tiene un estado: validado,
corregido (Georef interpretó otro nombre), con salvedad (p. ej. calle límite entre comunas),
ambiguo, no verificable (la fuente no tiene el dato), sin dato o no coincide.

**Límite de las fuentes públicas:** lo más preciso es la cuadra. No hay padrón de parcelas, así
que piso y unidad no se verifican, y el padrón del CPA (Correo Argentino) no es abierto: del
código postal solo se controla que la letra del CPA corresponda a la provincia.

## Publicar

`npm run build` genera un sitio estático en `dist/`, que se puede servir desde cualquier hosting.
Usa rutas relativas (`base: './'`), así que funciona en cualquier subcarpeta, y Georef se consulta
desde el navegador de cada usuario. Sin `VITE_GEOREF_URL` usa la API pública: sigue valiendo que es
solo para domicilios de prueba.

## Usar la lógica desde otra aplicación

`src/nomenclador/` no depende de Vue ni del navegador más allá de `fetch`, y se compila como
biblioteca (JavaScript y tipos, sin dependencias): `npm run build:lib` genera `dist-lib/`. Se
puede instalar directo desde GitHub (npm la compila al instalar, con el script `prepare`):

```sh
npm install github:fmance66/validador-domicilios
```

```ts
import { ClienteGeoref, parsearDomicilio, validarDomicilio } from 'validador-domicilios'

// baseUrl: la instancia propia de Georef; sin ella, la API pública (solo datos de prueba)
const cliente = new ClienteGeoref({ baseUrl: 'https://georef.example.com/api/v2.1' })
const resultado = await validarDomicilio(cliente, parsearDomicilio('Av. Callao 500, CABA'))
resultado.veredicto // 'valido' | 'parcial' | 'invalido'
resultado.nivelAlcanzado // 'provincia' … 'ubicacion'
```

También exporta `validarLote()` (muchos domicilios), `consultarPunto()` y `leerCoordenadas()`.

`vue`, `openvue` y `maplibre-gl` son `devDependencies`: la app los empaqueta con Vite, y así la
biblioteca no arrastra dependencias.

## Estructura

- `src/nomenclador/`: lógica sin framework: cliente Georef, `validarDomicilio()`, separador de
  domicilios en una línea, control de CP, validación masiva (`lote.ts`) y consulta de un punto
  (`punto.ts`). Tests con un Georef falso (`georefFalso.ts`).
- `src/components/`: formulario, resultado (veredicto, escalera, detalle, alternativas, informe),
  mapa (Argenmap del IGN), validación masiva, punto consultado, historial y correcciones. Tests
  con `@vue/test-utils` y happy-dom; el mapa se reemplaza por un div (`src/pruebas/montar.ts`).
- UI con [OpenVue](https://openvue.dev) (fork MIT de PrimeVue 4.5, tema Aura en `src/tema.ts`),
  Material Symbols, Vite y MapLibre.

## Licencia

[MIT](LICENSE).
