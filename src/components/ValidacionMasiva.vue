<script setup lang="ts">
import Message from 'openvue/message'
import ProgressBar from 'openvue/progressbar'
import Textarea from 'openvue/textarea'
import { computed, ref, shallowRef } from 'vue'
import { descargarArchivo, fechaDeHoy, leerArchivoDeTexto } from '../archivos.ts'
import { cliente, usaApiPublica } from '../cliente.ts'
import { VEREDICTOS } from '../estados.ts'
import {
  entradaDeFila,
  escribirCsv,
  leerTabla,
  mapearColumnas,
  NIVELES,
  provinciaPorId,
  resumirLote,
  tablaDeSalida,
  validarLote,
  type CampoColumna,
  type EntradaDomicilio,
  type ResultadoFila,
  type Tabla,
  type Veredicto,
} from '../nomenclador/index.ts'
import Boton from './Boton.vue'
import Icono from './Icono.vue'

const emit = defineEmits<{ abrir: [entrada: EntradaDomicilio] }>()

/** Con la API pública, un tope razonable para no abusar del servicio. */
const MAXIMO_FILAS = usaApiPublica ? 500 : 20000

const texto = ref('')
const nombreArchivo = ref<string | null>(null)
const tabla = shallowRef<Tabla | null>(null)
const resultados = shallowRef<(ResultadoFila | null)[]>([])
const hechos = ref(0)
const validando = ref(false)
let control: AbortController | null = null

const ETIQUETAS: Record<CampoColumna, string> = {
  linea: 'Domicilio en una línea',
  calle: 'Calle',
  altura: 'Número',
  piso: 'Piso',
  depto: 'Depto.',
  entreCalles: 'Entre calles',
  codigoPostal: 'CP',
  localidad: 'Localidad',
  departamento: 'Partido / depto.',
  provincia: 'Provincia',
  provinciaId: 'Provincia (ID)',
}

const mapeo = computed(() => (tabla.value ? mapearColumnas(tabla.value.encabezados) : {}))
const columnasReconocidas = computed(() =>
  (Object.entries(mapeo.value) as [CampoColumna, number][]).map(([campo, i]) => ({ campo, etiqueta: ETIQUETAS[campo], columna: tabla.value!.encabezados[i]! })),
)
const entradas = computed(() => tabla.value?.filas.map((f) => entradaDeFila(f, mapeo.value)) ?? [])
const sinProvincia = computed(() => entradas.value.filter((e) => !e.provinciaId).length)
const sobran = computed(() => Math.max(0, entradas.value.length - MAXIMO_FILAS))
const resumen = computed(() => resumirLote(resultados.value))
const terminado = computed(() => !validando.value && resumen.value.total > 0)
const avance = computed(() => (resultados.value.length ? Math.round((hechos.value / resultados.value.length) * 100) : 0))
const selectorArchivo = ref<HTMLInputElement>()

function cargarTexto(contenido: string) {
  tabla.value = contenido.trim() ? leerTabla(contenido) : null
  resultados.value = []
  hechos.value = 0
}

async function elegirArchivo(evento: Event) {
  const archivo = (evento.target as HTMLInputElement).files?.[0]
  if (!archivo) return
  nombreArchivo.value = archivo.name
  texto.value = ''
  cargarTexto(await leerArchivoDeTexto(archivo))
  ;(evento.target as HTMLInputElement).value = ''
}

function pegar(contenido = '') {
  texto.value = contenido
  nombreArchivo.value = null
  cargarTexto(contenido)
}

const EJEMPLO = [
  'id;domicilio',
  '1;Av. Callao 500 3° B, CABA, C1022AAO',
  '2;Rivadavia 99999, Quilmes, Buenos Aires',
  '3;Av. Callao 500, Palermo, CABA',
  '4;Av. Colón 500, Córdoba, Córdoba, M5000ABC',
  '5;Tupungato, Mendoza',
].join('\n')

/** Plantilla con las columnas separadas, para completar en Excel (con ; y BOM, como la salida). */
function descargarPlantilla() {
  const filas = [
    ['id', 'calle', 'número', 'piso', 'depto', 'entre calles', 'cp', 'localidad', 'partido', 'provincia'],
    ['1', 'Av. Callao', '500', '3', 'B', '', 'C1022AAO', 'Balvanera', '', 'CABA'],
    ['2', 'Crisologo Larralde', '2049', '', '', 'Zapiola y Chivilcoy', '', 'Castelar', 'Morón', 'Buenos Aires'],
  ]
  descargarArchivo('plantilla-domicilios.csv', escribirCsv(filas), 'text/csv;charset=utf-8')
}

function usarEjemplo() {
  pegar(EJEMPLO)
}

async function validar() {
  if (!tabla.value) return
  const lote = entradas.value.slice(0, MAXIMO_FILAS)
  control = new AbortController()
  validando.value = true
  hechos.value = 0
  const parciales: (ResultadoFila | null)[] = lote.map(() => null)
  resultados.value = [...parciales]
  try {
    await validarLote(cliente, lote, {
      senal: control.signal,
      alAvanzar: (n, _total, fila, i) => {
        hechos.value = n
        parciales[i] = fila
        // Se refresca de a tandas: con miles de filas, redibujar en cada una traba la pantalla.
        if (n % 5 === 0 || n === lote.length) resultados.value = [...parciales]
      },
    })
  } finally {
    resultados.value = [...parciales]
    validando.value = false
    control = null
  }
}

function cancelar() {
  control?.abort()
}

function descargar() {
  if (!tabla.value) return
  const base = nombreArchivo.value?.replace(/\.[^.]+$/, '') ?? 'domicilios'
  descargarArchivo(`${base}-validados-${fechaDeHoy()}.csv`, escribirCsv(tablaDeSalida(tabla.value, resultados.value)), 'text/csv;charset=utf-8')
}

function limpiar() {
  cancelar()
  texto.value = ''
  nombreArchivo.value = null
  cargarTexto('')
}

// --- Resultados -----------------------------------------------------------------------------------

const TEXTO_VEREDICTO: Record<Veredicto, string> = { valido: 'Válidos', parcial: 'Válidos hasta un nivel', invalido: 'Inválidos' }
const filtro = ref<Veredicto | 'error' | null>(null)
const porcentaje = (n: number) => (resumen.value.total ? Math.round((n / resumen.value.total) * 100) : 0)
const tituloNivel = (nivel: string | null) => NIVELES.find((n) => n.id === nivel)?.titulo ?? 'Ninguno'
const maximoNivel = computed(() => Math.max(1, ...resumen.value.porNivel.map((n) => n.cantidad)))

const MOSTRAR = 200
const filasVisibles = computed(() =>
  resultados.value
    .map((fila, i) => ({ fila, i }))
    .filter(({ fila }) => fila && (filtro.value === null || (filtro.value === 'error' ? !fila.resultado : fila.resultado?.veredicto === filtro.value))),
)

function domicilioEscrito(e: EntradaDomicilio) {
  return [[e.calle, e.altura].filter(Boolean).join(' '), e.localidad, e.departamento, provinciaPorId(e.provinciaId)?.nombre].filter(Boolean).join(', ')
}
</script>

<template>
  <div class="lote">
    <div class="panel">
      <h2 class="panel-titulo">Validar muchos domicilios</h2>
      <p class="texto-atenuado small">
        Un domicilio por fila, en un CSV o pegado desde Excel. Sirve una sola columna con el domicilio en una línea
        (<code>domicilio</code>) o columnas separadas (<code>calle</code>, <code>número</code>, <code>localidad</code>,
        <code>partido</code>, <code>provincia</code>, <code>cp</code>…). Las demás columnas (por ejemplo un ID) se
        conservan en el archivo de salida.
      </p>

      <div class="lote-carga">
        <Boton outlined icono="upload_file" label="Elegir archivo…" :disabled="validando" @click="selectorArchivo?.click()" />
        <input ref="selectorArchivo" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" class="d-none" @change="elegirArchivo" />
        <span v-if="nombreArchivo" class="texto-atenuado small">{{ nombreArchivo }}</span>
        <span class="texto-atenuado small">o pegalo abajo</span>
        <button type="button" class="ejemplo ms-auto" title="CSV con las columnas, para completar en Excel" @click="descargarPlantilla">
          Descargar plantilla
        </button>
        <button type="button" class="ejemplo" :disabled="validando" @click="usarEjemplo">Cargar un ejemplo</button>
      </div>
      <Textarea
        :model-value="texto"
        class="lote-texto"
        rows="5"
        fluid
        placeholder="domicilio&#10;Av. Callao 500, CABA&#10;Tupungato, Mendoza"
        :disabled="validando"
        aria-label="Domicilios, uno por fila"
        @update:model-value="pegar"
      />

      <template v-if="tabla">
        <p class="small mt-2 mb-1">
          <strong>{{ tabla.filas.length }}</strong> {{ tabla.filas.length === 1 ? 'fila' : 'filas' }}.
          <template v-if="columnasReconocidas.length">
            Columnas reconocidas:
            <span v-for="c in columnasReconocidas" :key="c.campo" class="lote-columna" :title="`Columna «${c.columna}»`">{{ c.etiqueta }}</span>
          </template>
        </p>
        <Message v-if="!columnasReconocidas.length" severity="warn" size="small" class="mb-2">
          No se reconoció ninguna columna. Poné una fila de encabezados (<code>domicilio</code>, o <code>calle</code>,
          <code>número</code>, <code>provincia</code>…).
        </Message>
        <Message v-else-if="sinProvincia" severity="warn" size="small" class="mb-2">
          En {{ sinProvincia }} {{ sinProvincia === 1 ? 'fila no se reconoce' : 'filas no se reconoce' }} la provincia: sin ella no se
          pueden validar y salen como error.
        </Message>
        <Message v-if="sobran" severity="warn" size="small" class="mb-2">
          Se validan las primeras {{ MAXIMO_FILAS }} filas<template v-if="usaApiPublica">, para no abusar de la API pública</template>;
          las otras {{ sobran }} salen como «sin validar».
        </Message>
      </template>

      <div class="formulario-acciones">
        <Boton v-if="!validando" icono="fact_check" label="Validar todos" :disabled="!tabla || !tabla.filas.length" @click="validar" />
        <Boton v-else severity="secondary" outlined icono="stop" label="Detener" @click="cancelar" />
        <Boton severity="secondary" text icono="backspace" label="Limpiar" :disabled="validando" @click="limpiar" />
        <Boton v-if="terminado" severity="secondary" outlined icono="download" label="Descargar resultado (CSV)" class="ms-auto" @click="descargar" />
      </div>

      <div v-if="validando || resumen.total" class="lote-progreso">
        <ProgressBar :value="avance" :show-value="false" class="lote-barra" />
        <span class="small texto-atenuado">{{ hechos }} de {{ resultados.length }}{{ validando ? '…' : '' }}</span>
      </div>
    </div>

    <template v-if="resumen.total">
      <div class="lote-tarjetas">
        <button
          v-for="v in (['valido', 'parcial', 'invalido'] as const)"
          :key="v"
          type="button"
          class="lote-tarjeta veredicto"
          :class="[VEREDICTOS[v].clase, { 'lote-tarjeta-activa': filtro === v }]"
          :aria-pressed="filtro === v"
          @click="filtro = filtro === v ? null : v"
        >
          <Icono :nombre="VEREDICTOS[v].icono" />
          <span class="lote-tarjeta-valor">{{ resumen.porVeredicto[v] }}</span>
          <span class="lote-tarjeta-texto">{{ TEXTO_VEREDICTO[v] }} · {{ porcentaje(resumen.porVeredicto[v]) }} %</span>
        </button>
        <button
          v-if="resumen.errores"
          type="button"
          class="lote-tarjeta veredicto lote-tarjeta-error"
          :class="{ 'lote-tarjeta-activa': filtro === 'error' }"
          :aria-pressed="filtro === 'error'"
          @click="filtro = filtro === 'error' ? null : 'error'"
        >
          <Icono nombre="error" />
          <span class="lote-tarjeta-valor">{{ resumen.errores }}</span>
          <span class="lote-tarjeta-texto">Sin validar (error)</span>
        </button>
      </div>

      <div class="panel mt-3">
        <h3 class="panel-subtitulo">Hasta qué nivel se validó</h3>
        <ul class="lote-niveles">
          <li v-for="n in resumen.porNivel" :key="n.nivel ?? 'ninguno'">
            <span class="lote-nivel-nombre">{{ tituloNivel(n.nivel) }}</span>
            <span class="lote-nivel-barra">
              <span
                v-for="v in (['valido', 'parcial', 'invalido'] as const)"
                v-show="n.porVeredicto[v]"
                :key="v"
                :class="`lote-nivel-${v}`"
                :style="{ width: `${(n.porVeredicto[v] / maximoNivel) * 100}%` }"
                :title="`${n.porVeredicto[v]} ${TEXTO_VEREDICTO[v].toLowerCase()}`"
              />
            </span>
            <span class="lote-nivel-cantidad">{{ n.cantidad }} <small class="texto-atenuado">({{ porcentaje(n.cantidad) }} %)</small></span>
          </li>
        </ul>
        <p class="texto-atenuado small mb-0">
          Cada domicilio cuenta en el último nivel que validó sin cortes («Ubicación» es el máximo: hasta la cuadra), con
          el color de su veredicto: <span class="texto-valido">válido</span>, <span class="texto-parcial">válido hasta un
          nivel</span> o <span class="texto-invalido">inválido</span> (por ejemplo, la calle valida pero el CP es de otra provincia).
        </p>
      </div>

      <div class="panel mt-3">
        <div class="historial-encabezado">
          <h3 class="panel-subtitulo mb-0">
            Detalle<template v-if="filtro"> · {{ filtro === 'error' ? 'errores' : TEXTO_VEREDICTO[filtro].toLowerCase() }}</template>
          </h3>
          <button v-if="filtro" type="button" class="ejemplo" @click="filtro = null">Ver todos</button>
        </div>
        <div class="tabla-desplazable">
          <table class="tabla lote-tabla">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Domicilio</th>
                <th scope="col">Resultado</th>
                <th scope="col">Nivel</th>
                <th scope="col"><span class="visually-hidden">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ fila, i } in filasVisibles.slice(0, MOSTRAR)" :key="i">
                <td class="texto-atenuado">{{ i + 1 }}</td>
                <td>{{ domicilioEscrito(fila!.entrada) || '—' }}</td>
                <td>
                  <template v-if="fila!.resultado">
                    <strong :class="`texto-${fila!.resultado.veredicto}`">{{ fila!.resultado.titulo }}</strong>
                    <div class="small texto-atenuado">{{ fila!.resultado.resumen }}</div>
                  </template>
                  <span v-else class="texto-invalido">{{ fila!.error }}</span>
                </td>
                <td class="text-nowrap">
                  {{ fila!.resultado ? `${NIVELES.findIndex((n) => n.id === fila!.resultado!.nivelAlcanzado) + 1}/${NIVELES.length}` : '—' }}
                </td>
                <td>
                  <button type="button" class="boton-icono" title="Ver el detalle de este domicilio" @click="emit('abrir', fila!.entrada)">
                    <Icono nombre="open_in_new" tam="sm" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="filasVisibles.length > MOSTRAR" class="texto-atenuado small mb-0">
          Se muestran las primeras {{ MOSTRAR }} de {{ filasVisibles.length }}. El CSV descargado tiene todas.
        </p>
      </div>
    </template>
  </div>
</template>
