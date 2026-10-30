<script setup lang="ts">
import Button from 'openvue/button'
import Icono from './Icono.vue'

// El resto (label, severity, outlined, size, loading, disabled, eventos) pasa directo a Button.
defineProps<{ icono?: string }>()
</script>

<template>
  <Button>
    <template v-if="icono" #icon="{ class: clase }"><Icono :nombre="icono" tam="sm" :class="clase" /></template>
  </Button>
</template>
