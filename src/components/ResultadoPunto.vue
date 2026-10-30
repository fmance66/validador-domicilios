<script setup lang="ts">
import Message from 'openvue/message'
import ProgressSpinner from 'openvue/progressspinner'
import { computed } from 'vue'
import { textoDistancia } from '../correcciones.ts'
import { ID_CABA, type ConsultaPunto, type Punto } from '../nomenclador/index.ts'
import Boton from './Boton.vue'
import Icono from './Icono.vue'
import MapaDomicilio from './MapaDomicilio.vue'

const props = defineProps<{
  /** null: todavía no se eligió un punto (el mapa espera el clic). */
  consulta: ConsultaPunto | null
  /** El punto que se está consultando, para marcarlo mientras llega la respuesta. */
  punto: Punto | null
  cargando: boolean
}>()
const emit = defineEmits<{ consultar: [punto: Punto]; usar: []; cerrar: [] }>()

const ubicacion = computed(() => (props.punto ? { ...props.punto, precision: 'punto' as const } : null))
const esCaba = computed(() => props.consulta?.provincia?.id === ID_CABA)
const coordenadas = computed(() => (props.punto ? `${props.punto.lat.toFixed(6)}, ${props.punto.lon.toFixed(6)}` : ''))
const enlaceMaps = computed(() => (props.punto ? `https://www.google.com/maps/search/?api=1&query=${props.punto.lat},${props.punto.lon}` : ''))
</script>

<template>
  <section class="resultado">
    <div class="panel">
      <div class="historial-encabezado">
        <h2 class="panel-titulo mb-0">¿Qué hay acá?</h2>
        <button type="button" class="boton-icono" title="Cerrar" @click="emit('cerrar')">
          <Icono nombre="close" tam="sm" />
        </button>
      </div>
      <p class="texto-atenuado small">
        Hacé clic en el mapa, o escribí coordenadas o un enlace de Google Maps en el campo de la izquierda. Georef dice en
        qué provincia, departamento y localidad cae el punto; no informa la calle ni la altura.
      </p>

      <div v-if="cargando" class="cargando py-2">
        <ProgressSpinner class="spinner spinner-chico" stroke-width="6" aria-label="Consultando" />
        <span>Consultando el punto…</span>
      </div>
      <template v-else-if="consulta">
        <Message v-if="!consulta.provincia" severity="warn" class="mb-2">
          El punto está fuera de la Argentina (o en el agua): Georef no tiene datos ahí.
        </Message>
        <dl v-else class="punto-datos">
          <dt>Provincia</dt>
          <dd>{{ consulta.provincia.nombre }} <code>{{ consulta.provincia.id }}</code></dd>
          <dt>{{ esCaba ? 'Comuna' : 'Departamento' }}</dt>
          <dd>{{ consulta.departamento?.nombre ?? '—' }} <code v-if="consulta.departamento">{{ consulta.departamento.id }}</code></dd>
          <template v-if="consulta.gobiernoLocal && consulta.gobiernoLocal.nombre !== consulta.departamento?.nombre">
            <dt>Gobierno local</dt>
            <dd>{{ consulta.gobiernoLocal.nombre }} <code>{{ consulta.gobiernoLocal.id }}</code></dd>
          </template>
          <dt>{{ esCaba ? 'Barrio' : 'Localidad' }}</dt>
          <dd>
            <template v-if="consulta.localidadCercana">
              {{ consulta.localidadCercana.nombre }}
              <span class="texto-atenuado small">
                (la más cercana: su centro está a {{ textoDistancia(consulta.localidadCercana.metros) }})
              </span>
            </template>
            <template v-else>—</template>
          </dd>
          <dt>Coordenadas</dt>
          <dd>
            <code>{{ coordenadas }}</code>
            <a :href="enlaceMaps" target="_blank" rel="noopener" class="ms-2 small">Ver en Google Maps</a>
          </dd>
        </dl>
        <div v-if="consulta.provincia" class="formulario-acciones mt-0 mb-3">
          <Boton severity="secondary" outlined size="small" icono="input" label="Usar en el formulario" @click="emit('usar')" />
          <span class="texto-atenuado small">Completa provincia, {{ esCaba ? 'comuna y barrio' : 'departamento y localidad' }}: falta escribir la calle y el número.</span>
        </div>
      </template>

      <MapaDomicilio :ubicacion="ubicacion" :clave="null" :domicilio="coordenadas" consulta-fija @consultar="emit('consultar', $event)" />
    </div>
  </section>
</template>
