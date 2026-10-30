<script setup lang="ts">
import { Map as MapaMapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { borrarCorreccion, correccionDe, guardarCorreccion, textoDistancia } from '../correcciones.ts'
import { distanciaMetros, type Cuadra, type Punto, type ResultadoValidacion } from '../nomenclador/index.ts'
import Boton from './Boton.vue'

// MapLibre deduce la URL de su worker con import.meta.url, que se rompe cuando Vite
// pre-empaqueta la librería ("Worker failed to load" y mapa vacío). Se la pasamos empaquetada.
setWorkerUrl(workerUrl)

/** `punto`: un punto consultado (clic, coordenadas o enlace), no un domicilio. */
type Ubicacion = NonNullable<ResultadoValidacion['ubicacion']> | (Punto & { precision: 'punto' })

const props = defineProps<{
  ubicacion: Ubicacion | null
  /** Identifica el domicilio para guardar una corrección; null: no se puede corregir. */
  clave: string | null
  domicilio: string
  /** Cada clic en el mapa consulta ese punto (sin tener que activar "¿Qué hay acá?"). */
  consultaFija?: boolean
  /** La cuadra según la numeración: se dibuja como una línea con sus alturas en las puntas. */
  cuadra?: Cuadra | null
}>()
const emit = defineEmits<{ consultar: [punto: Punto] }>()

// Argenmap, la cartografía base del IGN (servicio TMS: la fila se cuenta desde abajo).
const ESTILO: StyleSpecification = {
  version: 8,
  sources: {
    argenmap: {
      type: 'raster',
      tiles: ['https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png'],
      scheme: 'tms',
      tileSize: 256,
      maxzoom: 19,
      attribution: '<a href="https://www.ign.gob.ar" target="_blank" rel="noopener">Instituto Geográfico Nacional</a>',
    },
  },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#e8eef5' } },
    { id: 'argenmap', type: 'raster', source: 'argenmap' },
  ],
}

const COLORES = { cuadra: '#1b5e20', esquina: '#1b5e20', tramo: '#1b5e20', localidad: '#b26a00', punto: '#6a1b9a', manual: '#1565c0' }

const contenedor = ref<HTMLDivElement>()
let mapa: MapaMapLibre | null = null
let marcador: Marker | null = null
/** Punto de Georef, atenuado, cuando hay una corrección o se está corrigiendo. */
let referencia: Marker | null = null

const correccion = computed(() => correccionDe(props.clave))
const editando = ref(false)
/** "¿Qué hay acá?": el próximo clic consulta ese punto. */
const consultando = ref(false)
const modoConsulta = computed(() => props.consultaFija || consultando.value)
let ultimoClic: Punto | null = null
const desvio = computed(() =>
  correccion.value?.original ? textoDistancia(distanciaMetros(correccion.value.original, correccion.value)) : null,
)

function limpiarMarcadores() {
  marcador?.remove()
  referencia?.remove()
  marcador = referencia = null
}

/** Alturas en las puntas de la cuadra (HTML: el estilo raster no tiene fuentes para rótulos). */
let alturas: Marker[] = []

function dibujarCuadra() {
  if (!mapa) return
  if (!mapa.isStyleLoaded()) {
    mapa.once('load', dibujarCuadra)
    return
  }
  for (const m of alturas) m.remove()
  alturas = []
  const { cuadra } = props
  const datos: Feature | FeatureCollection = cuadra
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[cuadra.inicio.lon, cuadra.inicio.lat], [cuadra.fin.lon, cuadra.fin.lat]] } }
    : { type: 'FeatureCollection', features: [] }
  const fuente = mapa.getSource<GeoJSONSource>('cuadra')
  if (fuente) fuente.setData(datos)
  else {
    mapa.addSource('cuadra', { type: 'geojson', data: datos })
    mapa.addLayer({ id: 'cuadra', type: 'line', source: 'cuadra', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#0d658b', 'line-width': 6, 'line-opacity': 0.55 } })
  }
  if (!cuadra) return
  for (const [p, numero] of [[cuadra.inicio, cuadra.desde], [cuadra.fin, cuadra.hasta]] as const) {
    const elemento = document.createElement('div')
    elemento.className = 'mapa-altura'
    elemento.textContent = String(numero)
    alturas.push(new Marker({ element: elemento }).setLngLat([p.lon, p.lat]).addTo(mapa))
  }
}

function marcarReferencia() {
  if (!mapa || !props.ubicacion) return
  const elemento = document.createElement('div')
  elemento.className = 'mapa-marca-georef'
  elemento.title = 'Ubicación según Georef'
  referencia = new Marker({ element: elemento }).setLngLat([props.ubicacion.lon, props.ubicacion.lat]).addTo(mapa)
}

function mostrar() {
  if (!mapa) return
  limpiarMarcadores()
  dibujarCuadra()
  const { ubicacion } = props
  const manual = correccion.value
  if (manual) {
    marcarReferencia()
    marcador = new Marker({ color: COLORES.manual }).setLngLat([manual.lon, manual.lat]).addTo(mapa)
    // Se encuadran los dos puntos, para ver el desvío.
    if (ubicacion && ubicacion.precision !== 'localidad') {
      const [oeste, este] = [manual.lon, ubicacion.lon].sort((a, b) => a - b)
      const [sur, norte] = [manual.lat, ubicacion.lat].sort((a, b) => a - b)
      mapa.fitBounds([oeste!, sur!, este!, norte!], { padding: 60, maxZoom: 17, duration: 0 })
    } else {
      mapa.jumpTo({ center: [manual.lon, manual.lat], zoom: 16 })
    }
    return
  }
  if (!ubicacion) return
  const exacta = ubicacion.precision !== 'localidad'
  // Un punto en el que se hizo clic se marca sin mover el mapa; uno escrito, se centra.
  if (ubicacion.precision === 'punto' && ultimoClic?.lat === ubicacion.lat && ultimoClic.lon === ubicacion.lon) {
    marcador = new Marker({ color: COLORES.punto }).setLngLat([ubicacion.lon, ubicacion.lat]).addTo(mapa)
    return
  }
  marcador = new Marker({ color: COLORES[ubicacion.precision] }).setLngLat([ubicacion.lon, ubicacion.lat]).addTo(mapa)
  if (props.cuadra) {
    // Se encuadran la cuadra y el punto: si están lejos, es que la numeración no es pareja.
    const puntos = [ubicacion, props.cuadra.inicio, props.cuadra.fin]
    const lons = puntos.map((p) => p.lon)
    const lats = puntos.map((p) => p.lat)
    mapa.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], { padding: 70, maxZoom: 17, duration: 0 })
  } else {
    mapa.jumpTo({ center: [ubicacion.lon, ubicacion.lat], zoom: exacta ? 16 : 12 })
  }
}

function alternarConsulta() {
  consultando.value = !consultando.value
  if (mapa) mapa.getCanvas().style.cursor = consultando.value ? 'help' : ''
}

function empezarCorreccion() {
  if (!mapa) return
  consultando.value = false
  editando.value = true
  limpiarMarcadores()
  marcarReferencia()
  const inicio = correccion.value ?? props.ubicacion
  const punto: [number, number] = inicio ? [inicio.lon, inicio.lat] : mapa.getCenter().toArray()
  marcador = new Marker({ color: COLORES.manual, draggable: true }).setLngLat(punto).addTo(mapa)
  mapa.getCanvas().style.cursor = 'crosshair'
  if (mapa.getZoom() < 15) mapa.easeTo({ center: punto, zoom: 16 })
}

function terminarCorreccion() {
  editando.value = false
  if (mapa) mapa.getCanvas().style.cursor = ''
  mostrar()
}

function guardar() {
  if (!marcador || !props.clave) return
  const { lat, lng } = marcador.getLngLat()
  // Con clave hay un domicilio validado: la ubicación nunca es un punto consultado.
  const original = props.ubicacion?.precision === 'punto' ? null : props.ubicacion
  guardarCorreccion({ clave: props.clave, domicilio: props.domicilio, lat, lon: lng, original })
  terminarCorreccion()
}

function deshacer() {
  if (props.clave) borrarCorreccion(props.clave)
  mostrar()
}

onMounted(() => {
  mapa = new MapaMapLibre({
    container: contenedor.value!,
    style: ESTILO,
    center: [-64, -38],
    zoom: 3,
    // Sin esto el mapa sale en blanco al imprimir (el canvas de WebGL se borra después de dibujar).
    canvasContextAttributes: { preserveDrawingBuffer: true },
  })
  if (props.consultaFija) mapa.getCanvas().style.cursor = 'help'
  mapa.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  // Mientras se corrige, un clic lleva el marcador ahí (además de poder arrastrarlo).
  mapa.on('click', (e) => {
    if (editando.value) marcador?.setLngLat(e.lngLat)
    else if (modoConsulta.value) {
      ultimoClic = { lat: e.lngLat.lat, lon: e.lngLat.lng }
      emit('consultar', ultimoClic)
      if (!props.consultaFija) alternarConsulta()
    }
  })
  mostrar()
})

onBeforeUnmount(() => mapa?.remove())

// Otro domicilio: se abandona la corrección en curso.
watch(
  () => [props.ubicacion, props.clave, props.cuadra],
  () => {
    editando.value = false
    consultando.value = false
    if (mapa) mapa.getCanvas().style.cursor = props.consultaFija ? 'help' : ''
    mostrar()
  },
)
</script>

<template>
  <div>
    <div class="mapa" :class="{ 'mapa-editando': editando || consultando }">
      <div ref="contenedor" class="mapa-lienzo" />
      <div class="mapa-leyenda">
        <template v-if="editando">Arrastrá el marcador azul, o hacé clic en el mapa, hasta el lugar correcto</template>
        <template v-else-if="modoConsulta && !ubicacion">Hacé clic en el mapa para ver qué lugar es</template>
        <template v-else-if="consultando">Hacé clic en el punto que querés consultar</template>
        <template v-else-if="ubicacion?.precision === 'punto'">Punto consultado · clic en otro lugar para consultarlo</template>
        <template v-else-if="correccion">
          Corregida a mano<template v-if="desvio"> · a {{ desvio }} de la de Georef (gris)</template>
        </template>
        <template v-else-if="!ubicacion">Sin ubicación</template>
        <template v-else-if="ubicacion.precision === 'cuadra'">Centro de la cuadra (entre las calles declaradas)</template>
        <template v-else-if="ubicacion.precision === 'esquina'">Esquina con una de las calles declaradas</template>
        <template v-else-if="ubicacion.precision === 'tramo'">Punto sobre la cuadra (interpolado por numeración)</template>
        <template v-else>Aproximada: centro de la localidad</template>
        <template v-if="cuadra && !editando && !consultando">
          <br /><span class="mapa-leyenda-cuadra" /> Cuadra del {{ cuadra.desde }} al {{ cuadra.hasta }} según la numeración
        </template>
      </div>
    </div>
    <div v-if="clave || !consultaFija" class="mapa-acciones">
      <template v-if="editando">
        <Boton size="small" icono="check" label="Guardar ubicación" @click="guardar" />
        <Boton severity="secondary" outlined size="small" label="Cancelar" @click="terminarCorreccion" />
      </template>
      <template v-else>
        <template v-if="clave">
          <Boton severity="secondary" outlined size="small" icono="edit_location_alt" :label="correccion ? 'Mover' : 'Corregir ubicación'" @click="empezarCorreccion" />
          <Boton v-if="correccion" severity="secondary" outlined size="small" icono="undo" label="Volver a la de Georef" @click="deshacer" />
        </template>
        <Boton
          v-if="!consultaFija"
          :severity="consultando ? undefined : 'secondary'"
          :outlined="!consultando"
          size="small"
          icono="help_center"
          label="¿Qué hay acá?"
          title="Hacé clic en el mapa para ver en qué provincia, departamento y localidad cae ese punto"
          @click="alternarConsulta"
        />
      </template>
    </div>
  </div>
</template>
