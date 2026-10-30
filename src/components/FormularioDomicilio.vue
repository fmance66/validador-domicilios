<script setup lang="ts">
import InputGroup from 'openvue/inputgroup'
import InputText from 'openvue/inputtext'
import Select from 'openvue/select'
import { ref, watch } from 'vue'
import { cliente } from '../cliente.ts'
import Boton from './Boton.vue'
import CampoBorrable from './CampoBorrable.vue'
import { esEnlaceCorto, ID_CABA, leerCoordenadas, parsearDomicilio, PROVINCIAS, type EntradaDomicilio, type Punto } from '../nomenclador/index.ts'

const entrada = defineModel<EntradaDomicilio>({ required: true })
defineProps<{ cargando: boolean }>()
const emit = defineEmits<{ validar: []; limpiar: []; punto: [punto: Punto] }>()

// --- Domicilio en una línea -------------------------------------------------------------------
const linea = ref('')
const avisoLinea = ref<string | null>(null)

/** Coordenadas o un enlace de Google Maps: no es un domicilio, se consulta el punto. */
function esPunto() {
  avisoLinea.value = null
  if (esEnlaceCorto(linea.value)) {
    avisoLinea.value = 'Los enlaces cortos (maps.app.goo.gl) no traen el punto: abrilo y copiá el enlace largo de la barra de direcciones, o las coordenadas.'
    return true
  }
  const punto = leerCoordenadas(linea.value)
  if (punto) emit('punto', punto)
  return punto !== null
}

function separar() {
  if (!linea.value.trim() || esPunto()) return false
  const separado = parsearDomicilio(linea.value)
  entrada.value = { ...separado, provinciaId: separado.provinciaId || entrada.value.provinciaId }
  return true
}

function separarYValidar() {
  if (separar()) emit('validar')
}

/** Select pide un arreglo modificable; PROVINCIAS es de solo lectura. */
const OPCIONES_PROVINCIA = [...PROVINCIAS]

const EJEMPLOS = [
  { texto: 'Av. Callao 500 3° B, CABA, C1022AAO', nota: 'válido (calle límite)' },
  { texto: 'Rivadavia 99999, Quilmes, Buenos Aires', nota: 'altura inexistente' },
  { texto: 'Av. Callao 500, Palermo, CABA', nota: 'calle en otro barrio' },
  { texto: 'Av. Colón 500, Córdoba, Córdoba, M5000ABC', nota: 'CP de otra provincia' },
  { texto: 'Tupungato, Mendoza', nota: 'solo localidad' },
  { texto: 'Crisologo Larralde 2049 entre Zapiola y Chivilcoy, Castelar, Morón, Buenos Aires', nota: 'numeración despareja: ubica por entrecalles' },
]

function usarEjemplo(texto: string) {
  linea.value = texto
  separarYValidar()
}

// --- Sugerencias de localidad (localidades BAHRA de la provincia; en CABA, los barrios) --------
const sugerencias = ref<string[]>([])
watch(
  () => entrada.value.provinciaId,
  async (provincia) => {
    sugerencias.value = []
    if (!provincia) return
    try {
      const { localidades } = await cliente.consultar<{ localidades: { nombre: string }[] }>('localidades', {
        provincia,
        campos: 'nombre',
        orden: 'nombre',
        max: 5000,
      })
      if (entrada.value.provinciaId === provincia) sugerencias.value = [...new Set(localidades.map((l) => l.nombre))]
    } catch {
      // Sin sugerencias: se puede escribir igual.
    }
  },
  { immediate: true },
)

function limpiar() {
  linea.value = ''
  avisoLinea.value = null
  emit('limpiar')
}
</script>

<template>
  <form class="panel formulario" novalidate @submit.prevent="emit('validar')">
    <h2 class="panel-titulo">Domicilio a validar</h2>

    <div class="mb-3">
      <label for="linea" class="form-label">Escribirlo en una línea</label>
      <InputGroup>
        <CampoBorrable
          id="linea"
          v-model="linea"
          placeholder="Calle 123 piso/depto, localidad, provincia, CP"
          @keydown.enter.prevent="separarYValidar"
        />
        <Boton outlined label="Separar" title="Separar en los campos de abajo" @click="separar" />
      </InputGroup>
      <div v-if="avisoLinea" class="form-text text-danger">{{ avisoLinea }}</div>
      <div v-else class="form-text">También acepta coordenadas o un enlace de Google Maps, para ver qué lugar es.</div>
      <div class="ejemplos">
        <span class="texto-atenuado">Ejemplos:</span>
        <button v-for="e in EJEMPLOS" :key="e.texto" type="button" class="ejemplo" :title="e.nota" @click="usarEjemplo(e.texto)">
          {{ e.texto }}
        </button>
      </div>
    </div>

    <hr />

    <div class="campos">
      <div class="col-8">
        <label for="calle" class="form-label">Calle</label>
        <CampoBorrable id="calle" v-model="entrada.calle" />
      </div>
      <div class="col-4">
        <label for="altura" class="form-label">Número</label>
        <InputText id="altura" v-model="entrada.altura" fluid inputmode="numeric" placeholder="S/N" autocomplete="off" />
      </div>
      <div class="col-12">
        <label for="entre" class="form-label">Entre calles</label>
        <CampoBorrable
          id="entre"
          v-model="entrada.entreCalles"
          placeholder="opcional: Zapiola y Chivilcoy"
          title="Ubica la cuadra por sus esquinas: más preciso que la numeración del callejero"
        />
      </div>
      <div class="col-4">
        <label for="piso" class="form-label">Piso</label>
        <InputText id="piso" v-model="entrada.piso" fluid autocomplete="off" />
      </div>
      <div class="col-4">
        <label for="depto" class="form-label">Depto.</label>
        <InputText id="depto" v-model="entrada.depto" fluid autocomplete="off" />
      </div>
      <div class="col-4">
        <label for="cp" class="form-label">Cód. postal</label>
        <InputText id="cp" v-model="entrada.codigoPostal" fluid placeholder="C1022AAO" autocomplete="off" />
      </div>
      <div class="col-12">
        <span id="provincia-etiqueta" class="form-label">Provincia <span class="obligatorio">*</span></span>
        <Select
          v-model="entrada.provinciaId"
          label-id="provincia"
          aria-labelledby="provincia-etiqueta"
          :options="OPCIONES_PROVINCIA"
          option-label="nombre"
          option-value="id"
          placeholder="Elegir…"
          filter
          auto-filter-focus
          empty-filter-message="Sin resultados"
          fluid
        />
      </div>
      <div class="col-6">
        <label for="localidad" class="form-label">{{ entrada.provinciaId === ID_CABA ? 'Barrio' : 'Localidad' }}</label>
        <CampoBorrable id="localidad" v-model="entrada.localidad" list="localidades" />
        <datalist id="localidades">
          <option v-for="s in sugerencias" :key="s" :value="s" />
        </datalist>
      </div>
      <div class="col-6">
        <label for="departamento" class="form-label">{{ entrada.provinciaId === ID_CABA ? 'Comuna' : 'Partido / depto.' }}</label>
        <CampoBorrable id="departamento" v-model="entrada.departamento" placeholder="opcional" />
      </div>
    </div>

    <div class="formulario-acciones">
      <Boton type="submit" icono="travel_explore" label="Validar" :loading="cargando" :disabled="!entrada.provinciaId || cargando" />
      <Boton severity="secondary" text icono="backspace" label="Limpiar" @click="limpiar" />
    </div>
  </form>
</template>
