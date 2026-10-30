/* =====================================================================
   motor.js — Piezas 1, 2 y 3
   Lógica pura: nada de DOM aquí. Entra texto, salen datos.
   interfaz.js es quien toma lo que calcula este archivo y lo pinta
   en la pantalla.
   ===================================================================== */

/* ---------------------------------------------------------------------
   PIEZA 2 — Registro de átomos
   Un "diccionario" que, dado el texto de una proposición, regresa
   siempre la misma letra si ya la había visto (comparando el texto
   normalizado: sin mayúsculas ni espacios/puntuación de sobra), o le
   asigna la siguiente letra libre (p, q, r, ...) si es nueva.
   --------------------------------------------------------------------- */

function normalizeAtomText(s) {
  return s
    .replace(/^[\s,;:.¿?¡!]+/, "")
    .replace(/[\s,;:.¿?¡!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// clave para comparar proposiciones: sin mayusculas ni acentos ("Es de dia" y
// "es de día" son la misma idea). Solo se quitan tildes y dieresis; la ñ se
// conserva, porque "año" y "ano" no son lo mismo.
function atomKey(s) {
  return normalizeAtomText(s).toLowerCase().normalize("NFD").replace(/[̀́̈]/g, "").normalize("NFC");
}

// ¿hay algo que leer? (al menos una letra o un numero: "¿?" o "..." no cuentan)
function tieneTexto(s) {
  return /[\p{L}\p{N}]/u.test(s);
}

function createAtomRegistry() {
  const order = [];           // lista en orden de aparicion: [{key, text, letter}, ...]
  const byKey = new Map();    // texto normalizado -> entry (para busqueda rapida)
  const byLetter = new Map(); // letra -> entry (una formula puede citar una letra ya asignada)
  const letters = "pqrstuvwxyzabcdefghijklmno".split("");
  let siguiente = 0;

  function letterFor(index) {
    const base = letters[index % letters.length];
    const vuelta = Math.floor(index / letters.length);
    return vuelta === 0 ? base : base + (vuelta + 1); // si se acaban las letras: p2, q2, ...
  }

  function registrar(entry) {
    entry.index = order.length;
    order.push(entry);
    byKey.set(entry.key, entry);
    byLetter.set(entry.letter, entry);
    return entry;
  }

  // una letra escrita tal cual ("p", "q2"): se respeta esa letra. Si ya se le
  // asigno a una proposicion, es esa misma proposicion.
  function porLetra(letra) {
    const l = letra.toLowerCase();
    return byLetter.get(l) || registrar({ key: l, text: l, letter: l, directa: true });
  }

  function getOrCreate(rawText) {
    const text = normalizeAtomText(rawText);
    if (/^[a-z]\d*$/i.test(text)) return porLetra(text);
    const key = atomKey(text);
    if (byKey.has(key)) return byKey.get(key); // ya existia: reusa su letra
    while (byLetter.has(letterFor(siguiente))) siguiente++; // salta las escritas a mano
    return registrar({ key, text, letter: letterFor(siguiente) });
  }

  return { getOrCreate, porLetra, list: () => order.slice() };
}


/* ---------------------------------------------------------------------
   PIEZA 1 — Parser de lenguaje natural a fórmulas
   Reconoce los 5 conectores (y, o, no, si...entonces, si y solo si) y
   arma un árbol de fórmula (atom / not / and / or / imp / iff) a partir
   del texto de cada regla.
   --------------------------------------------------------------------- */

// Constructores de formula (nodos del arbol logico)
const Atom = (entry) => ({ type: "atom", entry });
const Not  = (arg)   => ({ type: "not", arg });
const And  = (args)  => (args.length === 1 ? args[0] : { type: "and", args });
const Or   = (args)  => (args.length === 1 ? args[0] : { type: "or", args });
const Imp  = (l, r)  => ({ type: "imp", left: l, right: r });
const Iff  = (l, r)  => ({ type: "iff", left: l, right: r });

function isLiteral(f) {
  return f.type === "atom" || (f.type === "not" && f.arg.type === "atom");
}

// separa un texto por un separador dado, limpiando espacios y partes sin texto
function splitTopLevel(text, sep) {
  return text.split(sep).map((p) => p.trim()).filter(tieneTexto);
}

/* ---------------------------------------------------------------------
   Modo formula: leer directamente (p ^ q) <-> (r v s), sin frase en español.
   Acepta los simbolos o su version de teclado:
     ¬ ~ !    ∧ ^ &    ∨ v |    → -> =>    ↔ <-> <=>
   Precedencia, de mas a menos fuerte: ¬, ∧, ∨, →, ↔. → y ↔ agrupan a la derecha.
   --------------------------------------------------------------------- */

const SIMBOLO_FORMULA = /[¬∧∨→↔^&|~]|<-|->|=>/;

function tokensFormula(s) {
  const toks = [];
  let i = 0;
  const operando = () => toks.length && (toks[toks.length - 1].t === "letra" || toks[toks.length - 1].t === ")");
  while (i < s.length) {
    const resto = s.slice(i);
    let m;
    if (/^\s/.test(resto)) { i++; continue; }
    if ((m = resto.match(/^(?:<->|<=>|↔)/))) { toks.push({ t: "iff" }); i += m[0].length; continue; }
    if ((m = resto.match(/^(?:->|=>|→)/)))   { toks.push({ t: "imp" }); i += m[0].length; continue; }
    if ((m = resto.match(/^(?:&&|\|\||[∧^&∨|¬~!()])/))) {
      const c = m[0][0];
      toks.push({ t: "∧^&".includes(c) ? "and" : "∨|".includes(c) ? "or" : "¬~!".includes(c) ? "not" : c });
      i += m[0].length;
      continue;
    }
    // la "v" entre dos operandos es la disyuncion: en "rvs" son r, v, s
    if (/^v/i.test(resto) && operando()) { toks.push({ t: "or" }); i++; continue; }
    if ((m = resto.match(/^[a-z]\d*/i))) { toks.push({ t: "letra", v: m[0].toLowerCase() }); i += m[0].length; continue; }
    return null;
  }
  return toks;
}

// regresa la formula, o null si el texto no es una formula bien escrita.
// Solo crea atomos cuando toda la linea se pudo leer.
function leerFormula(texto, registry) {
  const s = texto.trim();
  // sin simbolos ni parentesis solo cuenta la forma "pvq": letras de la p en
  // adelante, para no confundirla con palabras como "uva" o "ave"
  if (!SIMBOLO_FORMULA.test(s) && !/[()]/.test(s) && !/\sv\s/i.test(s) && !/^[p-z](?:v[p-z])+$/i.test(s)) return null;
  const toks = tokensFormula(s);
  if (!toks || !toks.length) return null;
  let i = 0;
  const ve = (t) => toks[i] && toks[i].t === t;

  function primario() {
    if (ve("not")) { i++; const a = primario(); return a && { n: "not", a }; }
    if (ve("(")) {
      i++;
      const e = expr();
      if (!e || !ve(")")) return null;
      i++;
      return e;
    }
    if (ve("letra")) return { n: "letra", v: toks[i++].v };
    return null;
  }
  // cadena del mismo conector: p ∧ q ∧ r queda como una sola conjuncion
  function cadena(sub, t) {
    const args = [sub()];
    if (!args[0]) return null;
    while (ve(t)) {
      i++;
      const b = sub();
      if (!b) return null;
      args.push(b);
    }
    return args.length === 1 ? args[0] : { n: t, args };
  }
  const conj = () => cadena(primario, "and");
  const disy = () => cadena(conj, "or");
  function flecha(sub, t) {
    const a = sub();
    if (!a || !ve(t)) return a;
    i++;
    const b = flecha(sub, t);
    return b && { n: t, a, b };
  }
  const impl = () => flecha(disy, "imp");
  function expr() { return flecha(impl, "iff"); }

  const arbol = expr();
  if (!arbol || i !== toks.length) return null;

  const armar = (n) => {
    switch (n.n) {
      case "letra": return Atom(registry.porLetra(n.v));
      case "not": return Not(armar(n.a));
      case "and": return And(n.args.map(armar));
      case "or": return Or(n.args.map(armar));
      case "imp": return Imp(armar(n.a), armar(n.b));
      case "iff": return Iff(armar(n.a), armar(n.b));
    }
    return null;
  };
  return armar(arbol);
}

// formas de negar una proposicion completa al inicio de la frase
const NEG_PREFIJO = /^(?:no\s+es\s+(?:cierto|verdad)\s+que|es\s+(?:falso|mentira)\s+que|no)\s+(.+)$/i;

// un "termino": una proposicion simple, quiza negada
function parseTerm(text, registry) {
  const t = text.trim();
  const incrustada = leerFormula(t, registry);         // "Si (p ^ q), entonces r"
  if (incrustada) return incrustada;
  const m = t.match(NEG_PREFIJO);                      // "no llueve", "no es cierto que llueva"
  if (m && tieneTexto(m[1])) return Not(parseTerm(m[1], registry));
  // "no" a media frase: "Juan no va a la fiesta" es la negacion de "Juan va a la fiesta"
  const medio = t.match(/^(.+?)\s+no\s+(.+)$/i);
  if (medio) return Not(Atom(registry.getOrCreate(medio[1] + " " + medio[2])));
  return Atom(registry.getOrCreate(t));
}

// separadores de "o" y de "y" (sin importar mayusculas). "pero" es una
// conjuncion: en logica "llueve pero salgo" dice lo mismo que "llueve y salgo"
const SEP_O = /\s+o\s+/i;
const SEP_Y = /\s+(?:y|pero)\s+/i;
const SEP_NI = /\s+ni\s+/i;

// las partes de una conjuncion. "ni A ni B" (o "no A ni B") niega cada parte
function parseConjuncts(d, registry) {
  const empiezaNi = /^ni\s+/i.test(d);
  if (!empiezaNi && !SEP_NI.test(d)) return splitTopLevel(d, SEP_Y).map((c) => parseTerm(c, registry));
  const partes = splitTopLevel(d.replace(/^ni\s+/i, ""), SEP_NI);
  return partes.map((p, i) => (i === 0 && !empiezaNi ? parseTerm(p, registry) : Not(parseTerm(p, registry))));
}

// una formula "simple": sin si...entonces, solo combinaciones de y / pero / o / ni / no
function parseSimpleFormula(text, registry) {
  let t = text.trim()
    // otras formas de decir "y": en logica el matiz de contraste no cuenta
    .replace(/\by\s+(?:además|tambien|también)\b/gi, "y")
    .replace(/\s*[;,]?\s*\b(?:sin\s+embargo|no\s+obstante|aunque|además)\b\s*,?\s*/gi, " y ")
    .replace(/\s*;\s*/g, ", ")                          // el punto y coma separa igual que la coma
    .replace(/\bo\s+bien\b/gi, "o")                     // "o bien A o bien B"
    .replace(/\s+/g, " ").trim().replace(/^y\s+/i, ""); // "Aunque A, B" deja una "y" al inicio
  // "o A o B": la primera "o" solo anuncia la disyuncion
  if (/^o\s+/i.test(t) && SEP_O.test(t.replace(/^o\s+/i, ""))) t = t.replace(/^o\s+/i, "");
  // comas: "A, B y C" / "A, B o C" toman el conector del final; sin conector, cuentan como "y"
  if (t.includes(",")) {
    const cola = t.slice(t.lastIndexOf(","));
    t = t.replace(/\s*,\s*/g, SEP_O.test(cola) ? " o " : " y ");
  }
  const disjuncts = splitTopLevel(t, SEP_O);                    // primero las "o"
  return Or(disjuncts.map((d) => And(parseConjuncts(d, registry)))); // luego las "y"
}

// conectores que van EN MEDIO de la frase ("A … B"). El orden importa:
// "necesaria y suficiente" antes que cada una por separado; "si y solo si"
// antes que "solo si", y los dos antes que "si" a secas.
const CONDICION = "es\\s+(?:una\\s+)?condici[oó]n\\s+";
const CONECTOR_MEDIO = [
  [new RegExp("^(.+?)\\s+" + CONDICION + "necesaria\\s+y\\s+suficiente\\s+para\\s+(?:que\\s+)?(.+)$", "i"), (a, b) => Iff(a, b)],
  [new RegExp("^(.+?)\\s+" + CONDICION + "suficiente\\s+para\\s+(?:que\\s+)?(.+)$", "i"), (a, b) => Imp(a, b)], // A es suficiente para B  =  A → B
  [new RegExp("^(.+?)\\s+" + CONDICION + "necesaria\\s+para\\s+(?:que\\s+)?(.+)$", "i"),  (a, b) => Imp(b, a)], // A es necesaria para B   =  B → A
  [/^(.+?),?\s+implica\s+(?:que\s+)?(.+)$/i,                                    (a, b) => Imp(a, b)],
  [/^(.+?),?\s+(?:equivale\s+a|es\s+equivalente\s+a)\s+(?:que\s+)?(.+)$/i,      (a, b) => Iff(a, b)],
  [/^(.+?),?\s+si\s+y\s+solo\s+si\s+(.+)$/i,                       (a, b) => Iff(a, b)],    // A si y solo si B
  [/^(.+?),?\s+(?:solo|sólo|únicamente|unicamente)\s+si\s+(.+)$/i, (a, b) => Imp(a, b)],    // A solo si B  =  A → B
  // A a menos que B  =  A salvo que B  =  A excepto si B  =  ¬B → A
  [/^(.+?),?\s+(?:a\s+menos\s+que|a\s+no\s+ser\s+que|salvo\s+(?:que|si)|excepto\s+(?:que|si|cuando))\s+(.+)$/i, (a, b) => Imp(Not(b), a)],
  [/^(.+?),?\s+(?:entonces|por\s+lo\s+tanto|por\s+tanto)\s+(.+)$/i, (a, b) => Imp(a, b)],   // A, entonces B
  [/^(.+?),?\s+(?:si|cuando|siempre\s+(?:que|y\s+cuando))\s+(.+)$/i, (a, b) => Imp(b, a)],  // A si B  =  B → A
];

// un pedazo de texto que puede traer un conector en medio o ser una formula simple
// (se usa para la regla completa y para cada lado de un "si... entonces")
function parseClause(text, registry) {
  for (const [re, armar] of CONECTOR_MEDIO) {
    const m = text.match(re);
    if (m && m[1].trim() && m[2].trim()) {
      return armar(parseSimpleFormula(m[1], registry), parseSimpleFormula(m[2], registry));
    }
  }
  return parseSimpleFormula(text, registry);
}

// palabras con las que puede empezar una condicional: "si", "cuando", "siempre que"…
const COND_INICIO = /^(?:si|cuando|siempre\s+(?:que|y\s+cuando)|en\s+caso\s+de\s+que)\s+(?!y\s+solo\s+si\b)(.*)$/i;

// negar TODA la frase que sigue: "No es cierto que llueva y haga frío" = ¬(p ∧ q).
// (Un "no" a secas solo niega la proposicion que lo sigue: "No llueve y hace frío" = ¬p ∧ q.)
const NEG_TODO = /^(?:no\s+es\s+(?:cierto|verdad)\s+que|es\s+(?:falso|mentira)\s+que)\s+(.+)$/i;

// condicionales que empiezan con una frase hecha. Cada una arma la formula
// con sus dos partes en el orden en que aparecen en el texto.
const FRASE_INICIO = [
  [/^si\s+y\s+solo\s+si\s+(.+?)\s*,\s*(?:entonces\s+)?(.+)$/i,                              (a, b) => Iff(a, b)], // Si y solo si A, B
  [/^(?:basta|es\s+suficiente)\s+(?:con\s+)?que\s+(.+?),?\s+para\s+que\s+(.+)$/i,             (a, b) => Imp(a, b)], // Basta que A para que B
  [/^(?:es\s+necesario|hace\s+falta)\s+que\s+(.+?),?\s+para\s+que\s+(.+)$/i,                 (a, b) => Imp(b, a)], // Es necesario que A para que B
  [/^para\s+que\s+(.+?),?\s+(?:es\s+necesario|hace\s+falta)\s+que\s+(.+)$/i,                 (b, a) => Imp(b, a)], // Para que B, es necesario que A
  [/^para\s+que\s+(.+?),?\s+(?:basta|es\s+suficiente)\s+(?:con\s+)?que\s+(.+)$/i,             (b, a) => Imp(a, b)], // Para que B, basta que A
  // Salvo que B, A  =  A menos que B, A  =  Excepto si B, A  =  ¬B → A
  [/^(?:a\s+menos\s+que|a\s+no\s+ser\s+que|salvo\s+(?:que|si)|excepto\s+(?:que|si|cuando))\s+(.+?),\s*(.+)$/i, (b, a) => Imp(Not(b), a)],
];

// "si A, entonces B" / "si A entonces B" / "si A, B" (tambien "cuando…", "siempre que…")
function parseCondicional(text, registry) {
  const siMatch = text.match(COND_INICIO);
  if (!siMatch) return null;
  const rest = siMatch[1];
  let antecedente = rest.trim(), consecuente = "";
  const entoncesMatch = rest.match(/^(.*?)(?:,)?\s*\bentonces\b\s*,?\s*(.*)$/i);
  if (entoncesMatch) {
    antecedente = entoncesMatch[1].trim().replace(/,$/, "");
    consecuente = entoncesMatch[2].trim();
  } else if (rest.includes(",")) {
    const i = rest.indexOf(",");
    antecedente = rest.slice(0, i).trim();
    consecuente = rest.slice(i + 1).trim();
  }
  if (!antecedente || !consecuente) return null;
  return Imp(parseText(antecedente, registry), parseText(consecuente, registry));
}

// cualquier pedazo de texto -> formula. Orden en que se revisa:
//   1) negacion de toda la frase ("no es cierto que…")
//   2) condicionales con frase hecha al inicio ("si y solo si…", "basta que…")
//   3) "si / cuando / siempre que A, (entonces) B". Va antes que los conectores
//      en medio: en "Si apruebo si y solo si estudio, entonces festejo" el
//      conector principal es el "si... entonces" y el ↔ vive en el
//      antecedente: (p ↔ q) → r. Cada lado se lee otra vez desde el paso 1.
//   4) conector en medio ("A si y solo si B", "A solo si B", "A si B"…)
//   5) hecho simple o formula con y, o, ni, no
function parseText(text, registry) {
  let t = text.trim();
  // punto y coma: si separa condicionales completas ("Si A, B; si C, D") es la
  // conjuncion de todas; si no, es una lista como la de comas ("A; B o C")
  if (t.includes(";")) {
    const partes = splitTopLevel(t, /\s*;\s*/);
    if (partes.length > 1 && partes.some((p) => COND_INICIO.test(p))) {
      return And(partes.map((p) => parseText(p.replace(/^y\s+/i, ""), registry)));
    }
    t = t.replace(/\s*;\s*/g, ", ");
  }
  const neg = t.match(NEG_TODO);
  if (neg) return Not(parseText(neg[1], registry));
  for (const [re, armar] of FRASE_INICIO) {
    const m = t.match(re);
    if (m) return armar(parseText(m[1], registry), parseText(m[2], registry));
  }
  return parseCondicional(t, registry) || parseClause(t, registry);
}

// quita lo que no es parte de la regla: numeracion ("1.", "2)", "R3:"),
// viñetas ("-", "•"), comillas y puntuacion al final
function limpiarRegla(linea) {
  return linea.trim()
    .replace(/^(?:(?:regla\s*|r)?\d+\s*[.):\-]|[-•*·–—>])\s*/i, "")
    .replace(/^["“”«'‘]+|["“”»'’]+$/g, "")
    .replace(/[.;:,]+$/, "")
    .trim();
}

// una regla completa (una linea del editor). Primero se intenta leer como
// formula pura; si no, como frase en español. formulaMal avisa de una linea
// con simbolos logicos que no se pudo leer como formula.
function parseRuleText(rawText, registry) {
  const text = limpiarRegla(rawText);
  if (!tieneTexto(text)) return null;
  const pura = leerFormula(text, registry);
  if (pura) return { text, formula: pura, esFormula: true };
  const regla = { text, formula: parseText(text, registry) };
  if (SIMBOLO_FORMULA.test(text)) regla.formulaMal = true;
  return regla;
}

// una base de conocimiento completa: una regla por linea. Las lineas sin
// ningun texto (como "¿?") no son reglas: se cuentan en ignoradas para avisar.
function parseKnowledgeBase(inputText) {
  const registry = createAtomRegistry();
  const lines = inputText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const rules = [];
  let ignoradas = 0;
  for (const line of lines) {
    const r = parseRuleText(line, registry);
    if (r) rules.push(r);
    else ignoradas++;
  }
  return { rules, registry, ignoradas };
}

// Parentesis: como en un libro de logica, toda subformula compuesta (∧, ∨,
// →, ↔) que quede dentro de otro conector va entre parentesis, para que no
// haya que saberse la precedencia: (p ∧ q) → ¬r, ¬(p ∨ q), p ∨ (q ∧ r).
// La unica excepcion son las cadenas del mismo ∧ o ∨ (p ∧ q ∧ r), que no
// son ambiguas.
const BINARIO = { and: true, or: true, imp: true, iff: true };
function needsParens(child, parent) {
  if (!parent || !BINARIO[child.type]) return false;
  if (parent.type === "not") return true;
  return !(child.type === parent.type && (child.type === "and" || child.type === "or"));
}

function formulaToString(f, parent) {
  let s;
  switch (f.type) {
    case "atom": s = f.entry.letter; break;
    case "not": s = "¬" + formulaToString(f.arg, f); break;
    case "and": s = f.args.map((a) => formulaToString(a, f)).join(" ∧ "); break;
    case "or":  s = f.args.map((a) => formulaToString(a, f)).join(" ∨ "); break;
    case "imp": s = formulaToString(f.left, f) + " → " + formulaToString(f.right, f); break;
    case "iff": s = formulaToString(f.left, f) + " ↔ " + formulaToString(f.right, f); break;
  }
  return needsParens(f, parent) ? "(" + s + ")" : s;
}

// misma logica que formulaToString, pero regresa piezas sueltas para que
// la interfaz pueda darle estilo a cada atomo, operador y parentesis
function formulaToTokens(f, parent) {
  const op = (v, kind) => ({ t: "op", v, kind });
  let toks = [];
  const joinWith = (args, sym, kind) => args.forEach((a, i) => {
    if (i > 0) toks.push(op(sym, kind));
    toks = toks.concat(formulaToTokens(a, f));
  });
  switch (f.type) {
    case "atom": toks.push({ t: "atom", entry: f.entry }); break;
    case "not": toks.push(op("¬", "not")); toks = toks.concat(formulaToTokens(f.arg, f)); break;
    case "and": joinWith(f.args, "∧", "and"); break;
    case "or":  joinWith(f.args, "∨", "or"); break;
    case "imp": toks = toks.concat(formulaToTokens(f.left, f), [op("→", "imp")], formulaToTokens(f.right, f)); break;
    case "iff": toks = toks.concat(formulaToTokens(f.left, f), [op("↔", "iff")], formulaToTokens(f.right, f)); break;
  }
  return needsParens(f, parent) ? [{ t: "paren", v: "(" }].concat(toks, [{ t: "paren", v: ")" }]) : toks;
}

// valor de verdad de una formula con una asignacion dada (Map letra -> true/false)
function evaluate(f, assignment) {
  switch (f.type) {
    case "atom": return assignment.get(f.entry.letter) === true;
    case "not": return !evaluate(f.arg, assignment);
    case "and": return f.args.every((a) => evaluate(a, assignment));
    case "or":  return f.args.some((a) => evaluate(a, assignment));
    case "imp": return !evaluate(f.left, assignment) || evaluate(f.right, assignment);
    case "iff": return evaluate(f.left, assignment) === evaluate(f.right, assignment);
  }
  return false;
}

// la formula en palabras, para lectores de pantalla ("p implica no q")
function formulaHablada(f, parent) {
  let s;
  const lista = (args, nexo) => args.map((a) => formulaHablada(a, f)).join(nexo);
  switch (f.type) {
    case "atom": s = f.entry.letter; break;
    case "not": s = "no " + formulaHablada(f.arg, f); break;
    case "and": s = lista(f.args, " y "); break;
    case "or":  s = lista(f.args, " o "); break;
    case "imp": s = formulaHablada(f.left, f) + " implica " + formulaHablada(f.right, f); break;
    case "iff": s = formulaHablada(f.left, f) + " si y solo si " + formulaHablada(f.right, f); break;
  }
  return needsParens(f, parent) ? "abre paréntesis " + s + " cierra paréntesis" : s;
}

// tabla de verdad completa, para verificar el arbol por otro camino. Hasta 6
// atomos (64 filas): con mas ya no se puede leer. Regresa null si son demasiados.
const TABLA_MAX_ATOMOS = 6;
function tablaDeVerdad(formulas, letras) {
  if (letras.length > TABLA_MAX_ATOMOS) return null;
  const filas = [];
  const total = 1 << letras.length;
  for (let n = 0; n < total; n++) {
    // la primera fila es todo V y la ultima todo F, como se escribe a mano
    const valores = letras.map((_, i) => !(n & (1 << (letras.length - 1 - i))));
    const asignacion = new Map(letras.map((l, i) => [l, valores[i]]));
    const reglas = formulas.map((f) => evaluate(f, asignacion));
    filas.push({ valores, reglas, todas: reglas.every(Boolean) });
  }
  return { letras, filas, modelos: filas.filter((x) => x.todas).length };
}

// valor con una asignacion parcial: true, false, o null si aun no se puede saber
function evaluarParcial(f, a) {
  const no = (v) => (v === null ? null : !v);
  const y = (lista) => (lista.includes(false) ? false : lista.includes(null) ? null : true);
  const o = (lista) => (lista.includes(true) ? true : lista.includes(null) ? null : false);
  switch (f.type) {
    case "atom": return a.has(f.entry.letter) ? a.get(f.entry.letter) : null;
    case "not": return no(evaluarParcial(f.arg, a));
    case "and": return y(f.args.map((x) => evaluarParcial(x, a)));
    case "or":  return o(f.args.map((x) => evaluarParcial(x, a)));
    case "imp": return o([no(evaluarParcial(f.left, a)), evaluarParcial(f.right, a)]);
    case "iff": {
      const l = evaluarParcial(f.left, a), r = evaluarParcial(f.right, a);
      return l === null || r === null ? null : l === r;
    }
  }
  return null;
}

// Plan B para cuando el arbol seria demasiado grande para dibujarlo: busca una
// asignacion por retroceso, descartando en cuanto alguna formula ya es falsa.
// Regresa el Map del modelo, null si no existe ninguno, o undefined si se rinde.
function buscarModelo(formulas, letras, limite) {
  const a = new Map();
  let pasos = 0;
  // las formulas cortas primero: "Llueve" y "No llueve" chocan de inmediato,
  // aunque esten al final de 50 reglas. Las letras se prueban en ese mismo orden.
  const letrasDe = (f) => (f.type === "atom" ? [f.entry.letter]
    : f.type === "not" ? letrasDe(f.arg)
    : f.args ? f.args.flatMap(letrasDe)
    : letrasDe(f.left).concat(letrasDe(f.right)));
  const ordenadas = formulas.map((f) => ({ f, ls: letrasDe(f) })).sort((x, y) => x.ls.length - y.ls.length);
  formulas = ordenadas.map((x) => x.f);
  letras = Array.from(new Set(ordenadas.flatMap((x) => x.ls).concat(letras)));

  function buscar(i) {
    if (++pasos > (limite || 50000)) throw new RangeError("limite");
    let todas = true;
    for (const f of formulas) {
      const v = evaluarParcial(f, a);
      if (v === false) return false;
      if (v === null) todas = false;
    }
    if (todas) return true;
    for (const v of [true, false]) {
      a.set(letras[i], v);
      if (buscar(i + 1)) return true;
    }
    a.delete(letras[i]);
    return false;
  }
  try { return buscar(0) ? a : null; } catch (e) { return undefined; }
}


/* ---------------------------------------------------------------------
   PIEZA 3 — Árbol semántico (tableau)
   Reglas no ramificantes (alfa): ∧, ¬∨, ¬→, ¬¬
   Reglas ramificantes (beta):    ∨, →, ↔, ¬∧, ¬↔
   Una rama se cierra si contiene un átomo y su negación.
   --------------------------------------------------------------------- */

let _fid = 0;
function resetFormulaIds() { _fid = 0; }

// meta (opcional): { fromId, rule, kind, raiz } — de que linea salio, con que
// regla, y de que premisa (R1, R2...) viene en ultima instancia
function labelFormula(formula, origin, meta) {
  return Object.assign({ id: ++_fid, formula, origin, applied: false }, meta || {});
}

// simbolo de la regla que se aplica, para mostrarlo en la interfaz
const RULE_SYMBOL = {
  "alpha-and": "∧", "alpha-notor": "¬∨", "alpha-notimp": "¬→", "alpha-notnot": "¬¬",
  "beta-or": "∨", "beta-imp": "→", "beta-iff": "↔", "beta-notand": "¬∧", "beta-notiff": "¬↔",
};

// decide que tipo de regla aplica (alfa o beta) segun el conector principal
function classify(f) {
  if (f.type === "and") return "alpha-and";
  if (f.type === "or") return "beta-or";
  if (f.type === "imp") return "beta-imp";
  if (f.type === "iff") return "beta-iff";
  if (f.type === "not") {
    const a = f.arg;
    if (a.type === "atom") return "literal";
    if (a.type === "not") return "alpha-notnot";
    if (a.type === "and") return "beta-notand";
    if (a.type === "or") return "alpha-notor";
    if (a.type === "imp") return "alpha-notimp";
    if (a.type === "iff") return "beta-notiff";
  }
  if (f.type === "atom") return "literal";
  return "unknown";
}

// aplica la regla correspondiente: regresa las formulas nuevas (alfa) o las ramas nuevas (beta)
function applyRule(f) {
  switch (classify(f)) {
    case "alpha-and":    return { kind: "alpha", formulas: f.args };
    case "alpha-notor":  return { kind: "alpha", formulas: f.arg.args.map((x) => Not(x)) };
    case "alpha-notimp": return { kind: "alpha", formulas: [f.arg.left, Not(f.arg.right)] };
    case "alpha-notnot": return { kind: "alpha", formulas: [f.arg.arg] };
    case "beta-or":      return { kind: "beta", branches: f.args.map((x) => [x]) };
    case "beta-imp":     return { kind: "beta", branches: [[Not(f.left)], [f.right]] };
    case "beta-notand":  return { kind: "beta", branches: f.arg.args.map((x) => [Not(x)]) };
    case "beta-iff":     return { kind: "beta", branches: [[f.left, f.right], [Not(f.left), Not(f.right)]] };
    // ojo: f es ¬(A ↔ B), asi que A y B estan en f.arg, no en f
    case "beta-notiff":  return { kind: "beta", branches: [[f.arg.left, Not(f.arg.right)], [Not(f.arg.left), f.arg.right]] };
    default: return null; // literal: ya no se expande
  }
}

function literalKeyAndSign(f) {
  if (f.type === "atom") return { key: f.entry.key, letter: f.entry.letter, sign: true };
  if (f.type === "not" && f.arg.type === "atom") return { key: f.arg.entry.key, letter: f.arg.entry.letter, sign: false };
  return null;
}

// El arbol crece exponencialmente: 50 reglas "A o B" independientes darian 2^50
// ramas. Pasado este numero de lineas se deja de construir y se marca como
// truncado (la interfaz decide la consistencia con buscarModelo).
const MAX_LINEAS_ARBOL = 2000;

// construye el arbol completo a partir de las formulas iniciales (ya etiquetadas con labelFormula)
function buildTableau(labeledInitialFormulas) {
  let creadas = labeledInitialFormulas.length;
  let truncado = false;
  for (const l of labeledInitialFormulas) l.raiz = l.origin;

  // ademas del atomo, recuerda QUE lineas chocan, para poder decir de que regla viene cada una
  function closureCheck(allLines) {
    const pos = new Map();
    const neg = new Map();
    for (const line of allLines) {
      const lit = literalKeyAndSign(line.formula);
      if (!lit) continue;
      (lit.sign ? pos : neg).set(lit.key, { letter: lit.letter, line });
    }
    for (const [key, p] of pos) {
      if (neg.has(key)) return { key, letter: p.letter, pos: p.line, neg: neg.get(key).line };
    }
    return null;
  }

  function buildModel(allLines) {
    const model = new Map();
    for (const line of allLines) {
      const lit = literalKeyAndSign(line.formula);
      if (!lit) continue;
      model.set(lit.letter, lit.sign ? "V" : "F");
    }
    return Array.from(model.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  // procesa en orden (FIFO), agrupando pasos alfa en el mismo nodo, y
  // abriendo un nodo nuevo (rama) cada vez que toca una regla beta
  function grow(lines, queue, seedLines) {
    const nodeLines = (seedLines || []).slice(); // lo que se muestra EN este nodo
    let currentLines = lines.slice();
    let currentQueue = queue.slice();

    while (true) {
      if (creadas > MAX_LINEAS_ARBOL) truncado = true;
      if (truncado) return { lines: nodeLines, closed: false, open: false, cortado: true, children: [] };
      const closure = closureCheck(currentLines);
      if (closure) {
        return { lines: nodeLines, closed: true, closedInfo: closure, open: false, children: [] };
      }
      if (currentQueue.length === 0) {
        return { lines: nodeLines, closed: false, open: true, model: buildModel(currentLines), children: [] };
      }

      const line = currentQueue.shift();
      const result = applyRule(line.formula);
      line.applied = true;
      if (!result) continue;

      if (result.kind === "alpha") {
        const meta = { fromId: line.id, rule: RULE_SYMBOL[classify(line.formula)], kind: "α", raiz: line.raiz };
        const newLines = result.formulas.map((f) => labelFormula(f, "α de L" + line.id, meta));
        creadas += newLines.length;
        for (const nl of newLines) {
          nodeLines.push(nl);
          currentLines.push(nl);
          if (!isLiteral(nl.formula)) currentQueue.push(nl);
        }
        continue; // sigue en el mismo tronco, no ramifica
      }

      if (result.kind === "beta") {
        const children = result.branches.map((branchFormulas) => {
          const meta = { fromId: line.id, rule: RULE_SYMBOL[classify(line.formula)], kind: "β", raiz: line.raiz };
          const newLines = branchFormulas.map((f) => labelFormula(f, "β de L" + line.id, meta));
          creadas += newLines.length;
          const childLines = currentLines.concat(newLines);
          const childQueue = currentQueue.slice().concat(newLines.filter((nl) => !isLiteral(nl.formula)));
          return grow(childLines, childQueue, newLines);
        });
        return { lines: nodeLines, closed: false, open: false, branching: true, children };
      }
    }
  }

  const initialQueue = labeledInitialFormulas.filter((l) => !isLiteral(l.formula));
  let tree;
  try {
    tree = grow(labeledInitialFormulas.slice(), initialQueue, labeledInitialFormulas.slice());
  } catch (e) {
    if (!(e instanceof RangeError)) throw e; // pila agotada en una rama muy profunda
    truncado = true;
    tree = { lines: labeledInitialFormulas.slice(), closed: false, open: false, children: [] };
  }
  tree.truncado = truncado;
  return tree;
}

function collectOpenBranches(node, acc) {
  acc = acc || [];
  if (node.open) acc.push(node.model);
  for (const c of (node.children || [])) collectOpenBranches(c, acc);
  return acc;
}

function allClosed(node) {
  if (node.open || node.cortado || node.truncado) return false; // una rama cortada no se sabe como acaba
  if (node.closed) return true;
  return (node.children || []).every(allClosed);
}
