<script setup lang="ts">
import InputText from 'openvue/inputtext'
import { ref } from 'vue'
import Icono from './Icono.vue'

// Los atributos (id, placeholder, list, eventos) van al <input>, no al contenedor.
defineOptions({ inheritAttrs: false })

const valor = defineModel<string>({ required: true })
const contenedor = ref<HTMLDivElement>()

function borrar() {
  valor.value = ''
  contenedor.value?.querySelector('input')?.focus()
}
</script>

<template>
  <div ref="contenedor" class="campo-borrable">
    <InputText v-model="valor" fluid autocomplete="off" v-bind="$attrs" />
    <button v-if="valor" type="button" class="campo-borrar" title="Borrar" aria-label="Borrar" tabindex="-1" @click="borrar">
      <Icono nombre="close" tam="sm" />
    </button>
  </div>
</template>
