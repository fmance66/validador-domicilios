<script setup lang="ts">
import Message from 'openvue/message'
import { computed, ref } from 'vue'
import { claveDe } from '../correcciones.ts'
import { ESTADOS, VEREDICTOS } from '../estados.ts'
import { NIVELES, provinciaPorId, type Alternativa, type EntradaDomicilio, type Punto, type ResultadoValidacion } from '../nomenclador/index.ts'
import Boton from './Boton.vue'
import EscaleraNiveles from './EscaleraNiveles.vue'
import Icono from './Icono.vue'
import MapaDomicilio from './MapaDomicilio.vue'

const props = defineProps<{ resultado: ResultadoValidacion; entrada: EntradaDomicilio; fuente: string }>()
const emit = defineEmits<{ aplicar: [cambios: Alternativa['cambios']]; consultar: [punto: Punto] }>()

const veredicto = computed(() => VEREDICTOS[props.resultado.veredicto])
const indice = computed(() => NIVELES.findIndex((n) => n.id === props.resultado.nivelAlcanzado) + 1)
const tituloNivel = (nivel: string) => NIVELES.find((n) => n.id === nivel)?.titulo ?? nivel

/** Forma normalizada completa: la de Georef más piso, depto. y CP, que Georef no maneja. */
const formaCompleta = computed(() => {
  const { nomenclatura } = props.resultado
  if (!nomenclatura) return null
  const unidad = [props.entrada.piso && `piso ${props.entrada.piso}`, props.entrada.depto && `depto. ${props.entrada.depto}`]
    .filter(Boolean)
    .join(' ')
  const [primera, ...resto] = nomenclatura.split(', ')
  return [unidad ? `${primera} ${unidad}` : primera, ...resto, props.entrada.codigoPostal.trim() && `CP ${props.entrada.codigoPostal.trim().toUpperCase()}`]
    .filter(Boolean)
    .join(', ')
})

const ids = computed(() =>
  props.resultado.pasos.filter((p) => p.id && ['provincia', 'departamento', 'localidad', 'calle'].includes(p.nivel)),
)

/** Lo que se escribió, para el encabezado del informe impreso (el formulario no se imprime). */
const escrito = computed(() => {
  const e = props.entrada
  const calle = [e.calle, e.altura, e.piso && `piso ${e.piso}`, e.depto && `depto. ${e.depto}`].filter(Boolean).join(' ')
  const entre = e.entreCalles && `entre ${e.entreCalles}`
  return [calle, entre, e.localidad, e.departamento, provinciaPorId(e.provinciaId)?.nombre, e.codigoPostal].filter(Boolean).join(', ')
})
const fechaInforme = ref('')

/**
 * El navegador ofrece "Guardar como PDF" en el diálogo de impresión. Antes se pasa la página al
 * ancho de la hoja (clase `imprimiendo`): el canvas del mapa no se redimensiona al imprimir, así
 * que MapLibre tiene que redibujarlo a ese ancho antes de abrir el diálogo.
 */
function imprimir() {
  fechaInforme.value = new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
  const raiz = document.documentElement
  raiz.classList.add('imprimiendo')
  window.addEventListener('afterprint', () => raiz.classList.remove('imprimiendo'), { once: true })
  setTimeout(() => window.print(), 400)
}

const copiado = ref(false)
async function copiar() {
  if (!formaCompleta.value) return
  try {
    await navigator.clipboard.writeText(formaCompleta.value)
  } catch {
    // Sin API de portapapeles (http): selección y copia a la vieja usanza.
    const area = document.createElement('textarea')
    area.value = formaCompleta.value
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  copiado.value = true
  setTimeout(() => (copiado.value = false), 1500)
}
</script>

<template>
  <section class="resultado">
    <!-- Solo en el informe impreso: el formulario y la barra no se imprimen -->
    <header class="solo-impresion informe-encabezado">
      <h1>Validación de domicilio</h1>
      <p><strong>Domicilio informado:</strong> {{ escrito || '—' }}</p>
      <p class="texto-atenuado">{{ fechaInforme }} · Fuente: callejero y localidades del INDEC vía {{ fuente }}</p>
    </header>

    <div class="resultado-acciones no-imprimir">
      <Boton severity="secondary" outlined size="small" icono="print" label="Imprimir / PDF" title="Imprimir el resultado o guardarlo en PDF" @click="imprimir" />
    </div>

    <!-- Veredicto -->
    <div class="veredicto" :class="veredicto.clase" role="status">
      <Icono :nombre="veredicto.icono" tam="lg" class="veredicto-icono" />
      <div class="veredicto-texto">
        <h2 class="veredicto-titulo">{{ resultado.titulo }}</h2>
        <p class="veredicto-resumen">{{ resultado.resumen }}</p>
      </div>
      <div class="veredicto-nivel" :title="`Niveles validados en cadena, de ${NIVELES.length}`">
        <span class="veredicto-nivel-valor">{{ indice }}<small>/{{ NIVELES.length }}</small></span>
        <span class="veredicto-nivel-etiqueta">niveles</span>
      </div>
    </div>

    <EscaleraNiveles :pasos="resultado.pasos" :nivel-alcanzado="resultado.nivelAlcanzado" />

    <div class="resultado-grilla">
      <!-- Forma normalizada + mapa -->
      <div class="panel">
        <h3 class="panel-subtitulo">Forma normalizada</h3>
        <div v-if="formaCompleta" class="normalizada">
          <span class="normalizada-texto">{{ formaCompleta }}</span>
          <button type="button" class="boton-icono" :title="copiado ? 'Copiado' : 'Copiar'" @click="copiar">
            <Icono :nombre="copiado ? 'check' : 'content_copy'" tam="sm" />
          </button>
        </div>
        <p v-else class="texto-atenuado mb-2">No se llegó a un domicilio normalizado.</p>
        <dl v-if="ids.length" class="ids">
          <template v-for="p in ids" :key="p.nivel">
            <dt>{{ tituloNivel(p.nivel) }}</dt>
            <dd><code>{{ p.id }}</code></dd>
          </template>
        </dl>
        <MapaDomicilio
          :ubicacion="resultado.ubicacion"
          :cuadra="resultado.cuadra"
          :clave="claveDe(resultado)"
          :domicilio="formaCompleta ?? resultado.titulo"
          @consultar="emit('consultar', $event)"
        />
      </div>

      <!-- Detalle por nivel -->
      <div class="panel">
        <h3 class="panel-subtitulo">Detalle por nivel</h3>
        <table class="tabla tabla-detalle">
          <thead>
            <tr>
              <th scope="col">Nivel</th>
              <th scope="col">Escrito</th>
              <th scope="col">Oficial</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in resultado.pasos" :key="p.nivel">
              <tr class="fila-dato">
                <th scope="row">{{ tituloNivel(p.nivel) }}</th>
                <td>{{ p.declarado ?? '—' }}</td>
                <td>{{ p.normalizado ?? '—' }}</td>
              </tr>
              <tr class="fila-detalle">
                <td colspan="3">
                  <span class="chip-estado" :class="ESTADOS[p.estado].clase">
                    <Icono :nombre="ESTADOS[p.estado].icono" tam="sm" />{{ ESTADOS[p.estado].etiqueta }}
                  </span>
                  {{ p.detalle }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <template v-if="resultado.complementarios.length">
          <h3 class="panel-subtitulo">Otros datos</h3>
          <ul class="lista-simple">
            <li v-for="d in resultado.complementarios" :key="d.campo">
              <span class="chip-estado" :class="ESTADOS[d.estado].clase">
                <Icono :nombre="ESTADOS[d.estado].icono" tam="sm" />{{ ESTADOS[d.estado].etiqueta }}
              </span>
              <strong>{{ d.campo }} {{ d.valor }}:</strong> {{ d.detalle }}
            </li>
          </ul>
        </template>
      </div>
    </div>

    <Message v-for="o in resultado.observaciones" :key="o" severity="info" class="mt-3 mb-0">{{ o }}</Message>

    <div v-if="resultado.alternativas.length" class="panel mt-3">
      <h3 class="panel-subtitulo">¿Quisiste decir…?</h3>
      <p class="texto-atenuado small mb-2">Elegir una opción completa el formulario y vuelve a validar.</p>
      <div class="alternativas">
        <button v-for="a in resultado.alternativas" :key="JSON.stringify(a.cambios)" type="button" class="alternativa" @click="emit('aplicar', a.cambios)">
          <span class="alternativa-etiqueta">{{ a.etiqueta }}</span>
          <span class="alternativa-detalle">{{ a.detalle }}</span>
        </button>
      </div>
    </div>

    <p class="pie-resultado">
      {{ resultado.pedidos }} {{ resultado.pedidos === 1 ? 'consulta' : 'consultas' }} a Georef (las repetidas salen de la caché) ·
      Fuente: callejero y localidades del INDEC vía {{ fuente }}.
    </p>
  </section>
</template>
