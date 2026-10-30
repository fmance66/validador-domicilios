<script setup lang="ts">
import { usaApiPublica } from '../cliente.ts'
import { ESTADOS, VEREDICTOS } from '../estados.ts'
import { NIVELES, type EstadoPaso, type Veredicto } from '../nomenclador/index.ts'
import Icono from './Icono.vue'

const emit = defineEmits<{ probar: [texto: string]; irA: [vista: 'uno' | 'lote'] }>()

const SECCIONES = [
  { id: 'ayuda-escribir', titulo: 'Escribir un domicilio' },
  { id: 'ayuda-resultado', titulo: 'Leer el resultado' },
  { id: 'ayuda-lote', titulo: 'Muchos domicilios' },
  { id: 'ayuda-punto', titulo: '¿Qué hay acá?' },
  { id: 'ayuda-mapa', titulo: 'El mapa y las correcciones' },
  { id: 'ayuda-informe', titulo: 'Compartir e imprimir' },
  { id: 'ayuda-limites', titulo: 'Límites y privacidad' },
]

const EJEMPLOS = [
  { texto: 'Av. Callao 500 3° B, CABA, C1022AAO', nota: 'Válido. La calle es límite entre dos comunas: ofrece la otra.' },
  { texto: 'Rivadavia 99999, Quilmes, Buenos Aires', nota: 'Inválido: esa altura no existe en la calle.' },
  { texto: 'Av. Callao 500, Palermo, CABA', nota: 'Inválido: la calle no está en ese barrio; dice en cuáles sí.' },
  { texto: 'Av. Colón 500, Córdoba, Córdoba, M5000ABC', nota: 'Inválido: la M del código postal es de Mendoza.' },
  { texto: 'Tupungato, Mendoza', nota: 'Válido hasta la localidad: no tiene calle.' },
  { texto: 'Crisologo Larralde 2049 entre Zapiola y Chivilcoy, Castelar, Morón, Buenos Aires', nota: 'Las entrecalles ubican mejor que la numeración, que ahí no es pareja.' },
]

const TEXTO_ESTADOS: Record<EstadoPaso, string> = {
  ok: 'Coincide con la fuente oficial.',
  interpretado: 'Se encontró, pero con otro nombre (por ejemplo "Rivadavia" como "13 RIVADAVIA"): conviene mirar la corrección.',
  advertencia: 'Validado, con una salvedad: por ejemplo, una calle que es límite entre dos comunas.',
  ambiguo: 'Hay más de un lugar posible y el domicilio no alcanza para elegir: agregar la localidad o el partido.',
  no_verificable: 'La fuente no tiene el dato (calles sin numeración cargada, pisos, departamentos).',
  sin_dato: 'No se informó.',
  error: 'El dato contradice la fuente: no existe, o no está donde se dice.',
}

const TEXTO_VEREDICTOS: Record<Veredicto, { titulo: string; texto: string }> = {
  valido: { titulo: 'Domicilio válido', texto: 'Se validaron los seis niveles, hasta ubicarlo sobre la cuadra.' },
  parcial: { titulo: 'Válido hasta un nivel', texto: 'Lo informado está bien, pero falta algo para llegar más lejos (por ejemplo, la calle).' },
  invalido: { titulo: 'Domicilio inválido', texto: 'Algún dato no coincide con la fuente oficial: el motivo se explica arriba.' },
}

function irASeccion(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="ayuda">
    <nav class="panel ayuda-indice" aria-label="Secciones de la ayuda">
      <h2 class="panel-titulo">Ayuda</h2>
      <ol>
        <li v-for="s in SECCIONES" :key="s.id">
          <a :href="`#${s.id}`" @click.prevent="irASeccion(s.id)">{{ s.titulo }}</a>
        </li>
      </ol>
    </nav>

    <div class="ayuda-contenido">
      <section class="panel">
        <p class="ayuda-intro mb-0">
          El validador dice si un domicilio es válido y <strong>hasta qué nivel</strong> se pudo verificar contra el
          callejero y las localidades oficiales del INDEC, que publica el servicio
          <a href="https://www.argentina.gob.ar/georef" target="_blank" rel="noopener">Georef</a>. No hace falta cargar
          el domicilio perfecto: la app interpreta lo escrito, lo corrige cuando puede y dice qué corrigió.
        </p>
      </section>

      <section :id="SECCIONES[0]!.id" class="panel">
        <h3 class="ayuda-titulo">Escribir un domicilio</h3>
        <p>
          Lo más rápido es escribirlo <strong>en una línea</strong>, como viene de cualquier sistema, y apretar Enter:
          la app lo separa en calle, número, piso, depto., localidad, partido, provincia y código postal. También se
          pueden completar los campos a mano, o revisar cómo se separó con el botón <em>Separar</em>.
        </p>
        <ul>
          <li>La <strong>provincia</strong> es lo único obligatorio. Se reconoce escrita de muchas formas: "CABA", "Capital Federal", "Bs. As.", "Pcia. de Córdoba".</li>
          <li>El orden es libre después de la calle: <code>Blanco Encalada 2851 caba</code> también sirve.</li>
          <li><strong>Entre calles</strong> (<code>… 2049 entre Zapiola y Chivilcoy</code>) es opcional, pero ubica mejor que el número.</li>
          <li>Sin número: <code>S/N</code>. En CABA, la localidad es el barrio y el partido, la comuna.</li>
        </ul>
        <p class="mb-2">Ejemplos para probar (cada uno muestra un caso distinto):</p>
        <ul class="ayuda-ejemplos">
          <li v-for="e in EJEMPLOS" :key="e.texto">
            <button type="button" class="ejemplo" @click="emit('probar', e.texto)">{{ e.texto }}</button>
            <span class="texto-atenuado small">{{ e.nota }}</span>
          </li>
        </ul>
      </section>

      <section :id="SECCIONES[1]!.id" class="panel">
        <h3 class="ayuda-titulo">Leer el resultado</h3>
        <p>Arriba está el <strong>veredicto</strong>, con el motivo y cuántos niveles se validaron:</p>
        <ul class="ayuda-leyenda ayuda-leyenda-veredictos">
          <li v-for="(v, clave) in TEXTO_VEREDICTOS" :key="clave">
            <span class="ayuda-veredicto" :class="VEREDICTOS[clave].clase"><Icono :nombre="VEREDICTOS[clave].icono" tam="sm" /></span>
            <span><strong>{{ v.titulo }}:</strong> {{ v.texto }}</span>
          </li>
        </ul>
        <p>
          Después viene la <strong>escalera</strong> de seis niveles. Cada nivel se valida solo si el anterior se
          validó: el resultado es el último nivel sin cortes.
        </p>
        <ol class="ayuda-niveles">
          <li v-for="n in NIVELES" :key="n.id"><strong>{{ n.titulo }}:</strong> {{ n.descripcion }}</li>
        </ol>
        <p>Cada nivel tiene un estado:</p>
        <ul class="ayuda-leyenda">
          <li v-for="(texto, estado) in TEXTO_ESTADOS" :key="estado">
            <span class="chip-estado" :class="ESTADOS[estado].clase"><Icono :nombre="ESTADOS[estado].icono" tam="sm" />{{ ESTADOS[estado].etiqueta }}</span>
            <span>{{ texto }}</span>
          </li>
        </ul>
        <p class="mb-0">
          Más abajo están la <strong>forma normalizada</strong> (la oficial, con botón para copiarla), los
          <strong>IDs oficiales</strong> de provincia, departamento, localidad y calle, el detalle de cada nivel
          (lo escrito contra lo oficial) y, si hay otras lecturas posibles, <strong>¿Quisiste decir…?</strong>: al elegir
          una se completa el formulario y se vuelve a validar.
        </p>
      </section>

      <section :id="SECCIONES[2]!.id" class="panel">
        <h3 class="ayuda-titulo">Muchos domicilios</h3>
        <p>
          En la solapa <a href="#" @click.prevent="emit('irA', 'lote')">Muchos domicilios</a> se valida una tabla
          entera: un archivo CSV o lo que se copia de Excel y se pega. La primera fila tiene que tener los nombres de las
          columnas. Sirve una sola columna <code>domicilio</code> con el domicilio en una línea, o columnas separadas
          (<code>calle</code>, <code>número</code>, <code>piso</code>, <code>depto</code>, <code>entre calles</code>,
          <code>cp</code>, <code>localidad</code>, <code>partido</code>, <code>provincia</code>). Hay una plantilla para
          descargar. Las columnas que no se reconocen, como un ID, se conservan.
        </p>
        <p class="mb-0">
          Al terminar se ve cuántos son válidos, cuántos se cortaron en cada nivel y el detalle de cada fila (con un
          botón para abrirla en la vista de un domicilio). <strong>Descargar resultado</strong> baja la misma tabla con
          el veredicto, el nivel, el motivo, la forma normalizada, los IDs y las coordenadas, lista para Excel.
          <template v-if="usaApiPublica"> Con la API pública se validan hasta 500 filas.</template>
        </p>
      </section>

      <section :id="SECCIONES[3]!.id" class="panel">
        <h3 class="ayuda-titulo">¿Qué hay acá?</h3>
        <p class="mb-0">
          Para saber en qué provincia, departamento y localidad cae un lugar: botón <strong>¿Qué hay acá?</strong> en el
          mapa y clic en el punto, o escribir en el campo de una línea unas coordenadas (<code>-34.6037, -58.3816</code>)
          o un enlace de Google Maps. Georef no informa la calle ni el número de un punto, y la localidad es la de centro
          más cercano: sirve de orientación. Los enlaces cortos de Google Maps (<code>maps.app.goo.gl</code>) no traen
          el punto: hay que abrirlos y copiar el enlace largo de la barra de direcciones.
        </p>
      </section>

      <section :id="SECCIONES[4]!.id" class="panel">
        <h3 class="ayuda-titulo">El mapa y las correcciones</h3>
        <ul class="mb-0">
          <li>
            El marcador verde es la ubicación del domicilio: el centro de la cuadra si se informaron las entrecalles, o
            un punto calculado por el número. Naranja: solo se sabe la localidad.
          </li>
          <li>
            La <strong>línea azul</strong> es la cuadra según la numeración del callejero (por ejemplo, del 2000 al
            2099). Si queda lejos del marcador o se estira mucho, la numeración de esa calle no es pareja.
          </li>
          <li>
            Si el punto está mal, <strong>Corregir ubicación</strong> permite moverlo a mano. La corrección queda
            guardada en este navegador (no cambia la validación) y se ve en el panel <em>Ubicaciones corregidas</em>,
            desde donde se descargan (para reportar los errores del callejero) o se importan las de otra persona.
          </li>
        </ul>
      </section>

      <section :id="SECCIONES[5]!.id" class="panel">
        <h3 class="ayuda-titulo">Compartir e imprimir</h3>
        <ul class="mb-0">
          <li>Cada búsqueda queda en la dirección de la página: copiarla y pasarla abre el mismo domicilio validado.</li>
          <li><strong>Imprimir / PDF</strong>, arriba del resultado, arma un informe con el veredicto, el mapa y el detalle. En el diálogo de impresión se elige "Guardar como PDF".</li>
          <li>Las <em>Búsquedas recientes</em> quedan solo en este navegador.</li>
        </ul>
      </section>

      <section :id="SECCIONES[6]!.id" class="panel">
        <h3 class="ayuda-titulo">Límites y privacidad</h3>
        <ul class="mb-0">
          <li>
            Lo más preciso que se puede validar con fuentes públicas es <strong>la cuadra</strong>. El piso y el
            departamento no se verifican (haría falta catastro), y del código postal solo se controla que la letra
            corresponda a la provincia (el padrón del Correo no es público).
          </li>
          <li>El callejero oficial tiene errores y calles sin numeración: un "no verificable" no quiere decir que el domicilio esté mal.</li>
          <li v-if="usaApiPublica">
            <strong>Esta versión usa la API pública de Georef.</strong> Todo lo que se escribe viaja a un servicio
            externo: usar solo domicilios de prueba, <strong>nunca datos personales reales</strong>. Para datos reales
            hace falta una instancia propia de Georef.
          </li>
          <li v-else>Esta versión consulta una instancia propia de Georef.</li>
        </ul>
      </section>
    </div>
  </div>
</template>
