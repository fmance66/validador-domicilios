<script setup lang="ts">
// Material Symbols: el nombre del ícono es el texto del elemento (una ligadura de la fuente).
defineProps<{ nombre: string; tam?: 'sm' | 'lg' }>()
</script>

<template>
  <span class="material-symbols-outlined icono" :class="tam && `icono-${tam}`" aria-hidden="true">{{ nombre }}</span>
</template>
