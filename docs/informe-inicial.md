# Informe inicial (28/09/2026)

Estado del proyecto al terminar la primera versión: un tablero en Vue (puerto 7100) donde se
escribe un domicilio y se informa si es válido y hasta qué nivel se pudo verificar. Los 23 tests
pasan, los tipos compilan y los cinco ejemplos se probaron contra Georef real con el resultado
esperado.

## La pantalla

- **A la izquierda, la búsqueda:** un campo para escribir el domicilio en una línea (por ejemplo
  "Av. Callao 500 3° B, CABA, C1022AAO"), que lo separa solo. Abajo están los campos sueltos:
  calle, número, piso, depto., CP, provincia, localidad o barrio (con sugerencias de Georef) y
  partido o comuna. Hay ejemplos para hacer clic y un historial de búsquedas recientes, que se
  guarda solo en ese navegador.
- **A la derecha, el tablero:**
  - un cartel con el veredicto (válido, válido hasta cierto nivel o inválido), el motivo y
    cuántos niveles se validaron (por ejemplo, 6 de 6);
  - una escala de seis niveles (provincia → departamento → localidad → calle → altura →
    ubicación), con el estado de cada uno;
  - una tabla que compara lo escrito con lo oficial y explica cada nivel;
  - la forma normalizada, con botón para copiarla, y los IDs oficiales;
  - un mapa con Argenmap del IGN;
  - un bloque "¿Quisiste decir…?" con alternativas que, al elegirlas, completan el formulario y
    vuelven a validar.

## Hasta dónde se puede validar el número

Con fuentes públicas, lo más preciso es la cuadra. Se controla que el número esté dentro de la
numeración de esa calle y se ubica un punto aproximado sobre la cuadra. No hay datos por
parcela, así que piso y depto. no se pueden verificar. El padrón del código postal del Correo
tampoco es abierto: solo se controla que la letra del CP corresponda a la provincia.

## Pruebas contra Georef real

| Domicilio | Resultado |
|---|---|
| Av. Callao 500, CABA | Válido 6 de 6. Avisa que la calle es límite entre la Comuna 3 y la 1 y ofrece la otra comuna como alternativa. |
| Rivadavia 99999, Quilmes | Inválido: la calle va del 1 al 800. |
| Av. Callao 500, Palermo | Inválido: esa calle no está en Palermo. Dice en qué barrios sí está. |
| Av. Colón 500, Córdoba, CP M5000ABC | Inválido: la M del CPA es de Mendoza. |
| Tupungato, Mendoza | Válido hasta la localidad. |

## Otras cosas que conviene saber

- Georef se consulta desde el navegador (GET, con CORS abierto); la app no tiene servidor propio.
- Cada búsqueda queda en la URL, así que se puede compartir con un enlace.
- Arriba hay un aviso fijo: con la API pública solo se pueden usar domicilios de prueba. Para
  datos reales hay que configurar una instancia propia de Georef en `VITE_GEOREF_URL`.
- Uso, estructura y detalle de la escalera: `README.md`. Contexto para Claude: `CLAUDE.md`.
