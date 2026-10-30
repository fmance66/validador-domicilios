<script setup lang="ts">
import { ref } from 'vue'
import { leerArchivoDeTexto } from '../archivos.ts'
import {
  borrarCorreccion,
  correcciones,
  exportarCorrecciones,
  importarCorrecciones,
  textoDistancia,
  vaciarCorrecciones,
} from '../correcciones.ts'
import { distanciaMetros } from '../nomenclador/index.ts'
import Icono from './Icono.vue'

const hora = (fecha: string) =>
  new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const aviso = ref<{ texto: string; error: boolean } | null>(null)

/** Suma las correcciones que exportó otra persona: así se juntan sin un servidor. */
async function importar(evento: Event) {
  const entrada = evento.target as HTMLInputElement
  const archivo = entrada.files?.[0]
  entrada.value = ''
  if (!archivo) return
  try {
    const { nuevas, actualizadas, iguales } = importarCorrecciones(await leerArchivoDeTexto(archivo))
    const partes = [
      `${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}`,
      actualizadas && `${actualizadas} ${actualizadas === 1 ? 'actualizada' : 'actualizadas'}`,
      iguales && `${iguales} que ya estaban`,
    ].filter(Boolean)
    aviso.value = { texto: `Importadas de ${archivo.name}: ${partes.join(', ')}.`, error: false }
  } catch (e) {
    aviso.value = { texto: `No se pudo importar ${archivo.name}: ${e instanceof Error ? e.message : String(e)}`, error: true }
  }
}
</script>

<template>
  <div class="panel historial">
    <div class="historial-encabezado">
      <h2 class="panel-titulo mb-0">Ubicaciones corregidas</h2>
      <span>
        <label class="boton-icono mb-0" title="Importar las correcciones de otra persona (JSON exportado desde esta app)">
          <Icono nombre="upload" tam="sm" />
          <span class="visually-hidden">Importar correcciones</span>
          <input type="file" accept=".json,application/json" class="d-none" @change="importar" />
        </label>
        <template v-if="correcciones.length">
          <button type="button" class="boton-icono" title="Descargar en JSON (para compartirlas o reportar los desvíos)" @click="exportarCorrecciones">
            <Icono nombre="download" tam="sm" />
          </button>
          <button type="button" class="boton-icono" title="Borrar todas las correcciones" @click="vaciarCorrecciones">
            <Icono nombre="delete_sweep" tam="sm" />
          </button>
        </template>
      </span>
    </div>
    <ul v-if="correcciones.length" class="historial-lista">
      <li v-for="c in correcciones" :key="c.clave" class="historial-item">
        <Icono nombre="edit_location_alt" tam="sm" class="historial-icono correccion-icono" />
        <span class="historial-texto">
          <span class="historial-domicilio" :title="c.domicilio">{{ c.domicilio }}</span>
          <span class="historial-meta">
            <template v-if="c.original">A {{ textoDistancia(distanciaMetros(c.original, c)) }} de Georef · </template>{{ hora(c.fecha) }}
          </span>
        </span>
        <button type="button" class="boton-icono ms-auto" title="Borrar esta corrección" @click="borrarCorreccion(c.clave)">
          <Icono nombre="close" tam="sm" />
        </button>
      </li>
    </ul>
    <p v-if="aviso" class="small mb-2" :class="aviso.error ? 'text-danger' : 'texto-valido'" role="status">{{ aviso.texto }}</p>
    <p class="texto-atenuado small mb-0">
      <template v-if="correcciones.length">Se guardan solo en este navegador y no cambian la validación.</template>
      <template v-else>Ninguna todavía. Se corrigen desde el mapa del resultado.</template>
      Para juntar las de varias personas: cada una descarga las suyas y las demás las importan.
    </p>
  </div>
</template>
