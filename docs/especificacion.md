# Especificación: Motor de inferencia proposicional

Misión "Del lenguaje natural al árbol semántico" — Inteligencia Artificial.

## Objetivo

Construir una herramienta que reciba reglas escritas en español y determine,
mediante el método de árboles semánticos (tableaux), si esa base de
conocimiento es consistente (tiene al menos una forma de ser verdadera) o
inconsistente (se contradice a sí misma).

## Entregable

Una URL pública donde alguien pueda escribir sus propias reglas y ver el
análisis completo: traducción a lógica y árbol semántico resuelto.

## Pieza 1 — De lenguaje natural a fórmula

El parser no "entiende" español de verdad: busca patrones de palabras fijos.

Antes de leerla, a cada línea se le quita lo que no es parte de la regla:
numeración («1.», «2)», «R3:»), viñetas («-», «•»), comillas y la
puntuación del final.

Orden en el que se revisa cada línea (y, otra vez, cada lado de una
condicional):

0. Si empieza con **"no es cierto que"**, **"no es verdad que"**, **"es
   falso que"** o **"es mentira que"**, se niega **toda** la frase que sigue:
   «No es cierto que llueva y haga frío» → `¬(p ∧ q)`. (Un «no» a secas solo
   niega lo que lo sigue: «No llueve y hace frío» → `¬p ∧ q`.)
0b. Frases hechas al inicio:

   | Frase | Fórmula |
   |---|---|
   | **Si y solo si** A, B | `A ↔ B` |
   | **Basta que** A **para que** B / **Es suficiente que** … | `A → B` |
   | **Es necesario que** A **para que** B / **Hace falta que** … | `B → A` |
   | **Para que** B, **es necesario que** A | `B → A` |
   | **Para que** B, **basta que** A | `A → B` |

1. Si empieza con **"si "**, **"cuando "**, **"siempre que "** o **"en caso
   de que "** y en algún punto aparece **"entonces"** (o una coma, si no
   aparece "entonces"), es una condicional: el antecedente es lo que está
   entre la palabra inicial y "entonces", el consecuente es el resto
   → `A → B`. Cada lado se vuelve a leer desde el paso 0:
   «Si apruebo si y solo si estudio, entonces festejo» → `(p ↔ q) → r`,
   «Cuando no llueve, si hace sol, salgo» → `¬p → (q → r)`.
2. Si no, se busca un conector **en medio** de la frase, en este orden:

   | Frase | Fórmula |
   |---|---|
   | A **es condición necesaria y suficiente para** B | `A ↔ B` |
   | A **es condición suficiente para** B | `A → B` |
   | A **es condición necesaria para** B | `B → A` |
   | A **implica** (que) B | `A → B` |
   | A **equivale a** B / **es equivalente a** | `A ↔ B` |
   | A **si y solo si** B | `A ↔ B` |
   | A **solo si** B (también «sólo si», «únicamente si») | `A → B` |
   | A **a menos que** B | `¬B → A` |
   | A**, entonces** B (también «por lo tanto») | `A → B` |
   | A **si** B / A **cuando** B / A **siempre que** B | `B → A` |

   «si y solo si» va antes que «solo si», y los dos antes que «si» a secas,
   porque cada uno contiene al siguiente.
3. Si no cae en ninguno de los casos anteriores, es un hecho simple
   (por ejemplo "es de día") o una combinación de y/o/ni sin condicional.

Al escribir la fórmula, toda subfórmula compuesta que queda dentro de otro
conector va entre paréntesis: `(p ∧ q) → ¬r`, `¬(p ∨ q)`, `p ∨ (q ∧ r)`.
Solo las cadenas del mismo ∧ o ∨ (`p ∧ q ∧ r`) no los llevan.

Dentro de cualquier pedazo de texto (antecedente, consecuente, o el hecho
completo):

- se parte primero por **" o "** → disyunción (`∨`)
- cada parte resultante se parte por **" y "** o **" pero "** → conjunción (`∧`).
  En lógica «pero» afirma lo mismo que «y» (el contraste es solo de tono);
  lo mismo «aunque», «sin embargo», «no obstante», «además» y el punto y coma.
  «o bien» cuenta como «o». Las palabras se reconocen sin importar
  mayúsculas («O», «Y»).
- una lista con comas toma el conector del final: «A, B y C» → `A ∧ B ∧ C`,
  «A, B o C» → `A ∨ B ∨ C`; sin conector, las comas cuentan como «y». En
  «O A o B» la primera «o» solo anuncia la disyunción.
- **"ni A ni B"** (o «no A ni B») → `¬A ∧ ¬B`.
- cada pedazo final se revisa: si empieza con **"no "**, **"no es cierto
  que "**, **"no es verdad que "**, **"es falso que "** o **"es mentira
  que "**, es la negación (`¬`) de lo que sigue. Un **"no"** a media frase
  también niega: «Juan no va a la fiesta» → `¬p` con p = «Juan va a la
  fiesta». Si no hay negación, es una proposición simple.

## Pieza 2 — Registro de átomos

Cada proposición nueva recibe la siguiente letra libre (p, q, r, ...). Antes
de asignar una letra nueva, el texto se normaliza (sin mayúsculas, sin
acentos, sin espacios ni puntuación de sobra) y se compara contra las
proposiciones ya vistas: si coincide, se reutiliza la misma letra. La ñ sí
cuenta («año» y «ano» son átomos distintos).

Límite: el parser compara palabras, no significados. «llueve» y «llueva»
(otro tiempo verbal) o «Juan estudia» y «él estudia» quedan como átomos
distintos; hay que escribir la misma idea con las mismas palabras.

## Pieza 3 — Árbol semántico (tableau)

Se parte de que **todas** las fórmulas de la base de conocimiento son
verdaderas a la vez, y se van descomponiendo hasta que solo quedan
literales (una letra, o una letra negada).

**Reglas no ramificantes (alfa)** — se agregan a la misma rama, sin partir
el árbol:

| Fórmula | Se agrega |
|---|---|
| `A ∧ B` | `A` y `B` |
| `¬(A ∨ B)` | `¬A` y `¬B` |
| `¬(A → B)` | `A` y `¬B` |
| `¬¬A` | `A` |

**Reglas ramificantes (beta)** — el árbol se parte en dos caminos:

| Fórmula | Rama 1 | Rama 2 |
|---|---|---|
| `A ∨ B` | `A` | `B` |
| `A → B` | `¬A` | `B` |
| `A ↔ B` | `A` y `B` | `¬A` y `¬B` |
| `¬(A ∧ B)` | `¬A` | `¬B` |
| `¬(A ↔ B)` | `A` y `¬B` | `¬A` y `B` |

**Cierre de una rama:** en cuanto aparece una letra y esa misma letra
negada en la misma rama, es una contradicción: la rama se cierra (✗) y no
se le sigue agregando nada.

**Rama abierta:** si una rama llega a tener solo literales sin ninguna
contradicción, queda abierta (✓). Lo que quedó ahí (qué letras en positivo
y cuáles en negativo) es un **modelo**: una asignación de valores que hace
verdaderas todas las reglas originales.

**Conclusión final:**

- Si todas las ramas se cierran → la base de conocimiento es
  **inconsistente**.
- Si al menos una rama queda abierta → la base de conocimiento es
  **consistente**, y esa rama (o esas ramas) dan el modelo que lo prueba.

## Pieza 4 — Visualización

1. Tabla de átomos (letra + significado).
2. Cada regla junto a su fórmula ya traducida (`R1: ... → p → q`).
3. El árbol dibujado: un tronco con las fórmulas originales, que se va
   partiendo en columnas cada vez que toca una regla ramificante. Cada
   fórmula ya usada se marca, y cada camino termina en una marca de
   "rama cerrada" o "rama abierta" (con su modelo).

## Caso de prueba de referencia

Entrada:

```
Si es de día, entonces voy a trabajar
Si llueve, entonces no voy a trabajar
Es de día
```

Traducción: `p = es de día`, `q = voy a trabajar`, `r = llueve`.

- R1: `p → q`
- R2: `r → ¬q`
- R3: `p`

Resultado esperado: **dos ramas cerradas y una abierta**, con el modelo
`p = V, q = V, r = F`.
