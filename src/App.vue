<script setup lang="ts">
import Message from 'openvue/message'
import ProgressSpinner from 'openvue/progressspinner'
import Tab from 'openvue/tab'
import TabList from 'openvue/tablist'
import Tabs from 'openvue/tabs'
import { onMounted, ref } from 'vue'
import { cliente, usaApiPublica } from './cliente.ts'
import AyudaApp from './components/AyudaApp.vue'
import Boton from './components/Boton.vue'
import CorreccionesManuales from './components/CorreccionesManuales.vue'
import FormularioDomicilio from './components/FormularioDomicilio.vue'
import Icono from './components/Icono.vue'
import { entradaDeLaUrl, guardarEnLaUrl, guardarPuntoEnLaUrl, puntoDeLaUrl } from './enlace.ts'
import HistorialBusquedas from './components/HistorialBusquedas.vue'
import ResultadoPunto from './components/ResultadoPunto.vue'
import ResultadoValidacion from './components/ResultadoValidacion.vue'
import ValidacionMasiva from './components/ValidacionMasiva.vue'
import { registrar, type Busqueda } from './historial.ts'
import {
  consultarPunto,
  entradaDePunto,
  entradaVacia,
  parsearDomicilio,
  NIVELES,
  provinciaPorId,
  validarDomicilio,
  type Alternativa,
  type ConsultaPunto,
  type EntradaDomicilio,
  type Punto,
  type ResultadoValidacion as Resultado,
} from './nomenclador/index.ts'

/** './' en el build (cualquier subcarpeta), '/' en desarrollo. */
const baseUrl = import.meta.env.BASE_URL

const entrada = ref<EntradaDomicilio>(entradaVacia())
/** Lo que se validó (el formulario puede cambiar después). */
const validada = ref<EntradaDomicilio | null>(null)
const resultado = ref<Resultado | null>(null)
const cargando = ref(false)
const error = ref<string | null>(null)
/** `lote`: validar muchos domicilios de una vez. */
type Vista = 'uno' | 'lote' | 'ayuda'
const vista = ref<Vista>('uno')
/** Commit y fecha del build (vite.config.ts): para confirmar qué versión está publicada. */
const version = { commit: import.meta.env.VITE_VERSION_COMMIT, fecha: import.meta.env.VITE_VERSION_FECHA }
const fuente = usaApiPublica ? 'la API pública de Georef' : cliente.baseUrl

let ultima = 0
async function validar() {
  if (!entrada.value.provinciaId) {
    error.value = 'Elegí la provincia: sin ella no se puede buscar.'
    return
  }
  const copia = { ...entrada.value }
  const esta = ++ultima
  modoPunto.value = false
  cargando.value = true
  error.value = null
  try {
    const r = await validarDomicilio(cliente, copia)
    if (esta !== ultima) return
    resultado.value = r
    validada.value = copia
    guardarEnLaUrl(copia)
    registrar({
      entrada: copia,
      texto: r.nomenclatura ?? textoEscrito(copia),
      veredicto: r.veredicto,
      nivelAlcanzado: r.nivelAlcanzado,
      titulo: r.titulo,
    })
  } catch (e) {
    if (esta === ultima) error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (esta === ultima) cargando.value = false
  }
}

function textoEscrito(e: EntradaDomicilio) {
  return [[e.calle, e.altura].filter(Boolean).join(' '), e.localidad, provinciaPorId(e.provinciaId)?.nombre].filter(Boolean).join(', ')
}

function aplicar(cambios: Alternativa['cambios']) {
  entrada.value = { ...entrada.value, ...cambios }
  validar()
}

function elegirDelHistorial(b: Busqueda) {
  // Las búsquedas guardadas antes de un campo nuevo no lo traen.
  entrada.value = { ...entradaVacia(), ...b.entrada }
  validar()
}

// --- ¿Qué hay acá? (un punto del mapa, coordenadas o un enlace de Google Maps) -------------------

/** Se muestra el panel del punto en lugar del resultado de la validación. */
const modoPunto = ref(false)
const punto = ref<Punto | null>(null)
const consulta = ref<ConsultaPunto | null>(null)
const cargandoPunto = ref(false)

let ultimoPunto = 0
async function consultar(p: Punto) {
  const esta = ++ultimoPunto
  vista.value = 'uno'
  modoPunto.value = true
  punto.value = p
  consulta.value = null
  cargandoPunto.value = true
  error.value = null
  guardarPuntoEnLaUrl(p)
  try {
    const c = await consultarPunto(cliente, p)
    if (esta === ultimoPunto) consulta.value = c
  } catch (e) {
    if (esta === ultimoPunto) error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (esta === ultimoPunto) cargandoPunto.value = false
  }
}

function elegirPunto() {
  vista.value = 'uno'
  modoPunto.value = true
  punto.value = consulta.value = null
}

/** Pasa provincia, departamento y localidad al formulario; falta escribir la calle. */
function usarPunto() {
  if (!consulta.value) return
  entrada.value = { ...entradaVacia(), ...entradaDePunto(consulta.value) }
  resultado.value = validada.value = null
  cerrarPunto()
}

function cerrarPunto() {
  modoPunto.value = false
  guardarEnLaUrl(validada.value)
}

/** Desde la ayuda: probar un ejemplo en la vista de un domicilio. */
function probarEjemplo(texto: string) {
  entrada.value = parsearDomicilio(texto)
  vista.value = 'uno'
  validar()
  window.scrollTo({ top: 0 })
}

function irA(destino: Vista) {
  vista.value = destino
  window.scrollTo({ top: 0 })
}

/** El logo de la barra: vuelve a la pantalla inicial, con el formulario vacío. */
function irAlInicio() {
  // Descarta lo que esté en curso: que no aparezca un resultado después de volver.
  ultima++
  ultimoPunto++
  cargando.value = cargandoPunto.value = false
  modoPunto.value = false
  punto.value = consulta.value = null
  limpiar()
  irA('uno')
}

/** Desde la validación masiva: ver el detalle de una fila. */
function abrirDelLote(e: EntradaDomicilio) {
  entrada.value = { ...e }
  vista.value = 'uno'
  validar()
}

function limpiar() {
  entrada.value = entradaVacia()
  resultado.value = null
  validada.value = null
  error.value = null
  guardarEnLaUrl(null)
}

onMounted(() => {
  const puntoUrl = puntoDeLaUrl()
  if (puntoUrl) return void consultar(puntoUrl)
  const desdeUrl = entradaDeLaUrl()
  if (!desdeUrl) return
  entrada.value = desdeUrl
  validar()
})
</script>

<template>
  <header class="barra">
    <a :href="baseUrl" class="navbar-inicio" title="Volver al inicio" @click.prevent="irAlInicio">
      <img :src="`${baseUrl}icono.svg`" alt="" class="navbar-logo" width="32" height="32" />
      <span class="navbar-titulo">Validador <strong>de domicilios</strong></span>
    </a>
    <div class="navbar-acciones">
      <button
        type="button"
        class="navbar-boton"
        title="Ver en qué provincia, departamento y localidad cae un punto del mapa"
        @click="elegirPunto"
      >
        <Icono nombre="travel_explore" tam="sm" /><span>¿Qué hay acá?</span>
      </button>
      <button type="button" class="navbar-boton" title="Cómo se usa" @click="irA('ayuda')">
        <Icono nombre="help" tam="sm" /><span>Ayuda</span>
      </button>
    </div>
  </header>

  <main class="app-main">
    <Message v-if="usaApiPublica" severity="warn" class="mb-3">
      Prototipo conectado a la API pública de Georef: lo que se escribe viaja a un servicio externo. Usar solo domicilios de prueba, nunca datos personales reales.
    </Message>

    <Tabs :value="vista" class="solapas" @update:value="(v) => (vista = v as Vista)">
      <TabList>
        <Tab value="uno"><Icono nombre="home_pin" tam="sm" />Un domicilio</Tab>
        <Tab value="lote"><Icono nombre="table_rows" tam="sm" />Muchos domicilios</Tab>
        <Tab value="ayuda"><Icono nombre="help" tam="sm" />Ayuda</Tab>
      </TabList>
    </Tabs>

    <AyudaApp v-if="vista === 'ayuda'" @probar="probarEjemplo" @ir-a="irA" />

    <!-- v-show: al volver a la solapa, el lote sigue ahí (y sigue validando si estaba en curso) -->
    <ValidacionMasiva v-show="vista === 'lote'" @abrir="abrirDelLote" />

    <div v-if="vista === 'uno'" class="tablero">
      <aside class="tablero-lateral">
        <FormularioDomicilio v-model="entrada" :cargando="cargando" @validar="validar" @limpiar="limpiar" @punto="consultar" />
        <HistorialBusquedas @elegir="elegirDelHistorial" />
        <CorreccionesManuales />
      </aside>

      <div class="tablero-principal">
        <Message v-if="error" severity="error" class="mb-3">
          {{ error }}
          <Boton severity="secondary" outlined size="small" icono="refresh" label="Reintentar" class="ms-2" @click="modoPunto && punto ? consultar(punto) : validar()" />
        </Message>

        <ResultadoPunto
          v-if="modoPunto"
          :consulta="consulta"
          :punto="punto"
          :cargando="cargandoPunto"
          @consultar="consultar"
          @usar="usarPunto"
          @cerrar="cerrarPunto"
        />

        <div v-else-if="cargando && !resultado" class="cargando">
          <ProgressSpinner class="spinner" stroke-width="5" aria-label="Consultando" />
          <span>Consultando el callejero oficial…</span>
        </div>

        <ResultadoValidacion
          v-else-if="resultado && validada"
          :class="{ 'resultado-actualizando': cargando }"
          :resultado="resultado"
          :entrada="validada"
          :fuente="fuente"
          @aplicar="aplicar"
          @consultar="consultar"
        />

        <div v-else class="panel inicio">
          <div class="inicio-vacio">
            <Icono nombre="search" tam="lg" class="texto-atenuado" />
            <h2 class="panel-titulo mb-0">Escribí un domicilio para validarlo</h2>
            <p class="texto-atenuado">El tablero indica si es válido y hasta qué nivel se pudo verificar contra las fuentes oficiales.</p>
          </div>
          <ol class="inicio-niveles">
            <li v-for="(n, i) in NIVELES" :key="n.id">
              <span class="inicio-numero">{{ i + 1 }}</span>
              <span>
                <strong>{{ n.titulo }}</strong>
                <span class="texto-atenuado"> — {{ n.descripcion }}</span>
              </span>
            </li>
          </ol>
          <div class="inicio-punto">
            <Icono nombre="travel_explore" class="inicio-punto-icono" />
            <div class="inicio-punto-texto">
              <strong>¿No tenés el domicilio, pero sí el lugar?</strong>
              <span class="texto-atenuado small">
                Hacé clic en el mapa, o escribí coordenadas o un enlace de Google Maps, para saber en qué provincia,
                departamento y localidad cae.
              </span>
            </div>
            <Boton severity="secondary" outlined size="small" icono="map" label="Buscar en el mapa" @click="elegirPunto" />
          </div>
          <p class="texto-atenuado small mb-0">
            El nivel más preciso posible con fuentes públicas es la cuadra: el número se valida contra el rango de
            numeración de la calle y se ubica por interpolación. Piso, departamento y código postal completo (CPA) no se
            pueden verificar sin catastro o el padrón del Correo; del CPA se controla la letra de la provincia.
          </p>
        </div>
      </div>
    </div>

    <footer class="pie-app no-imprimir">
      Validador de domicilios (prototipo) · Fuente: callejero y localidades del INDEC vía {{ fuente }} ·
      <a href="#" @click.prevent="irA('ayuda')">Ayuda</a> ·
      <span :title="`Build del ${version.fecha}`">versión {{ version.commit }} del {{ version.fecha }}</span>
    </footer>
  </main>
</template>
