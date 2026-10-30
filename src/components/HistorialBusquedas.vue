<script setup lang="ts">
import { VEREDICTOS } from '../estados.ts'
import { historial, vaciarHistorial, type Busqueda } from '../historial.ts'
import Icono from './Icono.vue'

const emit = defineEmits<{ elegir: [busqueda: Busqueda] }>()

const hora = (fecha: string) =>
  new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div v-if="historial.length" class="panel historial">
    <div class="historial-encabezado">
      <h2 class="panel-titulo mb-0">Búsquedas recientes</h2>
      <button type="button" class="boton-icono" title="Borrar el historial" @click="vaciarHistorial">
        <Icono nombre="delete_sweep" tam="sm" />
      </button>
    </div>
    <ul class="historial-lista">
      <li v-for="b in historial" :key="b.fecha">
        <button type="button" class="historial-item" @click="emit('elegir', b)">
          <Icono :nombre="VEREDICTOS[b.veredicto].icono" tam="sm" class="historial-icono" :class="VEREDICTOS[b.veredicto].clase" />
          <span class="historial-texto">
            <span class="historial-domicilio">{{ b.texto }}</span>
            <span class="historial-meta">{{ b.titulo }} · {{ hora(b.fecha) }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p class="texto-atenuado small mb-0">Se guarda solo en este navegador.</p>
  </div>
</template>
