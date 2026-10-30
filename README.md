<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/backend-ninguno-111111" alt="Sin backend">
  <img src="https://img.shields.io/badge/pruebas-211%2F211-2ecc71" alt="211/211 pruebas pasando">
</p>

# Motor de inferencia proposicional

Proyecto para la misión "Del lenguaje natural al árbol semántico" (materia de Inteligencia Artificial).

Convierte reglas escritas en español a lógica proposicional y construye el árbol semántico (método de tableaux) para determinar si una base de conocimiento es consistente.

## Cómo correrlo

No necesita instalación ni servidor: se abre `index.html` directamente en el navegador.

## Capturas

| 1. Escribe la base de conocimiento | 2. Traducción a lógica y resultado | 3. El árbol, paso a paso |
| --- | --- | --- |
| ![Editor con el caso del profesor](docs/capturas/paso1-entrada.png) | ![Resultado: la base de conocimiento es consistente](docs/capturas/paso2-resultado.png) | ![Árbol semántico construyéndose paso a paso](docs/capturas/paso3-arbol.png) |

## Qué ofrece la interfaz

- Análisis en vivo mientras escribes (con `Ctrl` + `Enter` vas directo al resultado) y ejemplos de un clic.
- Cada átomo tiene su propio color en la tabla, en el texto de la regla, en las fórmulas y en el árbol; al pasar el cursor sobre una letra se resaltan todas sus apariciones.
- El árbol se reproduce paso a paso (reproducir, avanzar, retroceder) y explica qué regla α/β se aplicó en cada paso; tiene zoom y se ajusta solo al ancho de la pantalla.
- Cada rama abierta se muestra como asignación de valores y se comprueba que hace verdaderas todas las reglas.
- «Copiar enlace» genera una URL (`?kb=...`) que abre la página con esa misma base de conocimiento.
- Tema claro y oscuro (botón en la barra). Recuerda la elección; si nunca se eligió, sigue al sistema.
- Avisos bajo el editor cuando una regla probablemente no quedó como se quería: un «si» sin consecuencia, dos proposiciones casi iguales con letras distintas, o la misma palabra en otra forma («llueve» / «llueva»).
- Atajos en el árbol: `←` `→` para avanzar o retroceder, `Espacio` para reproducir.
- Tutorial animado aparte (`tutorial.html`): los pasos se ejecutan solos, con capítulos, velocidad y tres ejemplos. Usa el mismo motor, así que muestra el cálculo real.
- Modo fórmula: se puede escribir directo `(p ^ q) <-> (r v s)`, con símbolos o notación de teclado, y mezclarlo con reglas en español.
- Cada rama cerrada dice qué dos líneas chocan y de qué regla viene cada una.
- Tabla de verdad automática (hasta 6 átomos) como verificación cruzada del árbol.
- Historial: guarda las últimas 5 bases en este navegador y restaura la última al recargar.
- El árbol se puede ver como texto (para lectores de pantalla), descargar como PNG o copiar como imagen.
- «Imprimir o guardar en PDF» genera una versión limpia en claro con la tabla, las fórmulas, el árbol completo y los modelos.

## Pruebas

`tests/pruebas.html` verifica el motor punto por punto contra la rúbrica de la misión (211 pruebas):
parser y conectivos, frases naturales («cuando», «solo si», «ni… ni», «condición necesaria», «basta que… para que», listas numeradas…), modo fórmula, átomos repetidos, negación, paréntesis, las 9 reglas de expansión, cierre de ramas, trazabilidad, tabla de verdad, casos límite (entrada vacía, puros signos, bases de más de 50 reglas, texto hostil),
modelos, el caso del video, una prueba masiva de 1000 bases al azar comparadas contra la tabla de verdad,
y una revisión de la página real y del tutorial. Se abre desde el pie de la página
(«Ver las pruebas del motor»). Necesita servirse desde un servidor (o la URL pública), no como archivo suelto,
porque revisa `index.html` dentro de un iframe.

## Estructura

- `index.html` — estructura de la página.
- `css/estilos.css` — estilos visuales.
- `js/motor.js` — lógica pura: parser de lenguaje natural, registro de átomos y algoritmo del árbol semántico. No toca el DOM.
- `js/vista.js` — convierte lo que calcula el motor en HTML: fórmulas, árbol con sus pasos, versión en texto e imagen. Lo comparten la herramienta y el tutorial.
- `js/interfaz.js` — conecta el motor con la herramienta (editor, resultados, reproducción, historial).
- `tutorial.html` y `js/tutorial.js` — el tutorial animado.
- `tests/` — las pruebas.
- `docs/especificacion.md` — explicación en teoría de la gramática y el algoritmo usados.
- `docs/capturas/` — capturas de pantalla usadas en este README.
- `examples/casos-prueba.txt` — conjuntos de reglas de ejemplo para probar la herramienta.
- `assets/` — ícono del proyecto e imagen de vista previa para compartir el enlace.

## Licencia

[MIT](LICENSE).
