<script setup lang="ts">
import { computed } from 'vue'
import { ESTADOS } from '../estados.ts'
import { NIVELES, type Nivel, type Paso } from '../nomenclador/index.ts'
import Icono from './Icono.vue'

const props = defineProps<{ pasos: Paso[]; nivelAlcanzado: Nivel | null }>()

const indiceAlcanzado = computed(() => NIVELES.findIndex((n) => n.id === props.nivelAlcanzado))
const escalones = computed(() =>
  props.pasos.map((p, i) => ({
    ...p,
    titulo: NIVELES[i]!.titulo,
    estadoVisual: ESTADOS[p.estado],
    // Validado en cadena: todo nivel hasta el alcanzado. Los siguientes se muestran atenuados.
    alcanzado: i <= indiceAlcanzado.value,
  })),
)
</script>

<template>
  <ol class="escalera" :aria-label="`Validado hasta el nivel ${indiceAlcanzado + 1} de ${NIVELES.length}`">
    <li
      v-for="e in escalones"
      :key="e.nivel"
      class="escalon"
      :class="[e.estadoVisual.clase, { 'escalon-alcanzado': e.alcanzado }]"
      :title="e.detalle"
    >
      <span class="escalon-marca"><Icono :nombre="e.estadoVisual.icono" tam="sm" /></span>
      <span class="escalon-titulo">{{ e.titulo }}</span>
      <span class="escalon-valor">{{ e.normalizado ?? e.declarado ?? '—' }}</span>
      <span class="escalon-estado">{{ e.estadoVisual.etiqueta }}</span>
    </li>
  </ol>
</template>
