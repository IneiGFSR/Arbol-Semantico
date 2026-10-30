/* =====================================================================
   pruebas.js — verificacion del motor contra la rubrica de la mision
   Usa las mismas funciones de js/motor.js que la pagina. Cada grupo es un
   punto de la rubrica; al final hay una prueba masiva (formulas al azar
   comparadas contra la tabla de verdad) y una prueba de la pagina real.
   ===================================================================== */

(function () {

  // ---------- mini marco de pruebas ----------
  let grupos = [];
  let actual = null;
  function grupo(nombre, requisito) { actual = { nombre, requisito, casos: [] }; grupos.push(actual); }
  async function caso(desc, fn) {
    const g = actual;
    try {
      const r = await fn();
      g.casos.push({ desc, ok: r === true || !!(r && r.ok), omitida: !!(r && r.omitida), detalle: r && r.detalle });
    } catch (e) {
      g.casos.push({ desc, ok: false, detalle: "Error: " + e.message });
    }
  }
  const fmt = (x) => (typeof x === "string" ? x : JSON.stringify(x));
  function igual(obtenido, esperado) {
    const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
    return { ok, detalle: ok ? "→ " + fmt(obtenido) : "esperaba " + fmt(esperado) + "\nobtuve    " + fmt(obtenido) };
  }
  function cierto(cond, detalleOk, detalleMal) { return { ok: !!cond, detalle: cond ? detalleOk : (detalleMal || detalleOk) }; }

  // ---------- ayudas sobre el motor ----------
  function analizarKB(texto) {
    resetFormulaIds();
    const { rules, registry } = parseKnowledgeBase(texto);
    const labeled = rules.map((r, i) => labelFormula(r.formula, "R" + (i + 1)));
    const tree = buildTableau(labeled);
    return { rules, registry, tree, labeled };
  }
  const formulas = (t) => analizarKB(t).rules.map((r) => formulaToString(r.formula));
  const atomos = (t) => analizarKB(t).registry.list().map((e) => e.letter + " = " + e.text.toLowerCase());
  function hojas(tree) {
    let abiertas = 0, cerradas = 0;
    (function w(n) { if (n.open) abiertas++; else if (n.closed) cerradas++; (n.children || []).forEach(w); })(tree);
    return { abiertas, cerradas };
  }
  // cada rama completa (de la raiz a una hoja) como lista de lineas
  function ramas(tree) {
    const out = [];
    (function w(n, camino) {
      const c = camino.concat(n.lines);
      if (n.open || n.closed) out.push({ hoja: n, lineas: c });
      (n.children || []).forEach((h) => w(h, c));
    })(tree, []);
    return out;
  }
  function literal(f) { return f.type === "atom" || (f.type === "not" && f.arg.type === "atom"); }

  // primer paso de expansion de una sola formula: misma rama o dos ramas
  function expandir(f) {
    resetFormulaIds();
    const tree = buildTableau([labelFormula(f, "R1")]);
    const s = (l) => formulaToString(l.formula);
    if (tree.children && tree.children.length) return { ramas: tree.children.map((c) => c.lines.map(s)) };
    return { misma: tree.lines.slice(1).map(s) };
  }

  // ---------- generador de formulas al azar (para la prueba masiva) ----------
  const reg = createAtomRegistry();
  const ATOMOS = ["a", "b", "c", "d"].map((t) => reg.getOrCreate(t)); // letras p, q, r, s
  function azar(n) { return Math.floor(Math.random() * n); }
  function formulaAzar(prof) {
    if (prof <= 0 || Math.random() < 0.25) {
      const a = Atom(ATOMOS[azar(ATOMOS.length)]);
      return Math.random() < 0.3 ? Not(a) : a;
    }
    const k = azar(6);
    if (k === 0) return Not(formulaAzar(prof - 1));
    if (k === 1) return And([formulaAzar(prof - 1), formulaAzar(prof - 1)]);
    if (k === 2) return Or([formulaAzar(prof - 1), formulaAzar(prof - 1)]);
    if (k === 3 || k === 4) return Imp(formulaAzar(prof - 1), formulaAzar(prof - 1));
    return Iff(formulaAzar(prof - 1), formulaAzar(prof - 1));
  }
  // ¿existe alguna asignacion que haga verdaderas todas? (tabla de verdad completa)
  function satisfacible(fs) {
    const letras = ATOMOS.map((e) => e.letter);
    for (let m = 0; m < 1 << letras.length; m++) {
      const asg = new Map(letras.map((l, i) => [l, !!(m & (1 << i))]));
      if (fs.every((f) => evaluate(f, asg))) return true;
    }
    return false;
  }

  // lector estricto de formulas escritas (para comprobar que son bien formadas):
  // rechaza mezclar conectores sin parentesis, como "p ∧ q ∨ r" o "p → q → r"
  function leerFBF(s) {
    const toks = s.replace(/\s+/g, "").match(/[a-z]\d*|[¬∧∨→↔()]/g) || [];
    if (toks.join("") !== s.replace(/\s+/g, "")) throw new Error("símbolo desconocido");
    let i = 0;
    const tipo = { "∧": "and", "∨": "or", "→": "imp", "↔": "iff" };
    function unaria() {
      const t = toks[i++];
      if (t === "¬") return { type: "not", arg: unaria() };
      if (t === "(") { const e = expr(); if (toks[i++] !== ")") throw new Error("falta «)»"); return e; }
      if (/^[a-z]/.test(t || "")) return { type: "atom", entry: { letter: t } };
      throw new Error("se esperaba una letra y llegó «" + t + "»");
    }
    function expr() {
      const izq = unaria();
      const op = tipo[toks[i]];
      if (!op) return izq;
      const args = [izq];
      while (tipo[toks[i]]) {
        if (tipo[toks[i]] !== op) throw new Error("conectores mezclados sin paréntesis");
        i++; args.push(unaria());
        if ((op === "imp" || op === "iff") && tipo[toks[i]]) throw new Error("«" + toks[i] + "» encadenado sin paréntesis");
      }
      if (op === "imp") return { type: "imp", left: args[0], right: args[1] };
      if (op === "iff") return { type: "iff", left: args[0], right: args[1] };
      return { type: op, args };
    }
    const e = expr();
    if (i !== toks.length) throw new Error("sobran símbolos");
    return e;
  }

  const EJEMPLO = "Si es de día, entonces voy a trabajar\nSi llueve, entonces no voy a trabajar\nEs de día";

  // =================================================================
  async function correr() {
    grupos = [];

    grupo("1. Varias reglas a la vez", "Acepta varias reglas a la vez: la base de conocimiento, no solo una frase.");
    await caso("Tres reglas en tres líneas", () => igual(formulas(EJEMPLO).length, 3));
    await caso("Ignora líneas vacías y espacios de sobra", () => igual(formulas("\n  Llueve  \n\n\nSalgo\n").length, 2));

    grupo("2. Hechos simples", "Acepta hechos simples, como «es de día».");
    await caso("«Es de día» es una fórmula atómica", () => igual(formulas("Es de día"), ["p"]));
    await caso("El hecho conserva su significado", () => igual(atomos("Es de día."), ["p = es de día"]));

    grupo("3. Proposiciones simples", "Detecta correctamente cada proposición simple.");
    await caso("Separa las tres proposiciones de una regla compuesta",
      () => igual(atomos("Si llueve y hace frío, entonces no salgo"), ["p = llueve", "q = hace frío", "r = salgo"]));
    await caso("Separa las del ejemplo del video",
      () => igual(atomos(EJEMPLO), ["p = es de día", "q = voy a trabajar", "r = llueve"]));

    grupo("4. Misma idea, mismo átomo", "La misma idea escrita igual es el mismo átomo: «voy a trabajar» en dos reglas es siempre q.");
    await caso("«voy a trabajar» es q en R1 y en R2", () => igual(formulas(EJEMPLO), ["p → q", "r → ¬q", "p"]));
    await caso("No le afectan mayúsculas ni el punto final", () => igual(formulas("Llueve.\nllueve\nLLUEVE"), ["p", "p", "p"]));
    await caso("Se reutiliza la letra en lugar de crear otra", () => igual(analizarKB(EJEMPLO + "\nVoy a trabajar").registry.list().length, 3));

    grupo("5. Negación", "«no voy a trabajar» se representa como ¬q, no como un átomo nuevo.");
    await caso("«no voy a trabajar» → ¬q", () => igual(formulas(EJEMPLO)[1], "r → ¬q"));
    await caso("La negación no crea un átomo «no …»",
      () => cierto(!analizarKB(EJEMPLO).registry.list().some((e) => /^no\s/i.test(e.text)), "ningún átomo empieza con «no»"));
    await caso("«No llueve» → ¬p", () => igual(formulas("No llueve"), ["¬p"]));
    await caso("Doble negación «no no llueve» → ¬¬p", () => igual(formulas("No no llueve"), ["¬¬p"]));

    grupo("6. Tabla de átomos", "Muestra la tabla de átomos (letra y significado).");
    await caso("Letras en orden de aparición con su significado",
      () => igual(atomos(EJEMPLO), ["p = es de día", "q = voy a trabajar", "r = llueve"]));
    await caso("Si se acaban las letras sigue con p2, q2…", () => {
      const txt = Array.from({ length: 27 }, (_, i) => "hecho " + i).join("\n");
      return igual(analizarKB(txt).registry.list().map((e) => e.letter).slice(-2), ["o", "p2"]);
    });

    grupo("7. Los cinco conectivos", "«y» ∧ · «o» ∨ · «no» ¬ · «si… entonces» → · «si y solo si» ↔");
    await caso("«y» → ∧", () => igual(formulas("Llueve y hace frío"), ["p ∧ q"]));
    await caso("«o» → ∨", () => igual(formulas("Llueve o hace frío"), ["p ∨ q"]));
    await caso("«no» → ¬", () => igual(formulas("No salgo"), ["¬p"]));
    await caso("«si…, entonces…» → →", () => igual(formulas("Si llueve, entonces salgo"), ["p → q"]));
    await caso("«si… entonces…» sin coma", () => igual(formulas("Si llueve entonces salgo"), ["p → q"]));
    await caso("«si…, …» sin «entonces»", () => igual(formulas("Si llueve, salgo"), ["p → q"]));
    await caso("«si y solo si» → ↔", () => igual(formulas("Apruebo si y solo si estudio"), ["p ↔ q"]));
    await caso("«pero» → ∧ (extra)", () => igual(formulas("Llueve pero salgo"), ["p ∧ q"]));
    await caso("Conectores en mayúscula («O»)", () => igual(formulas("Llueve O nieva"), ["p ∨ q"]));

    grupo("8. Fórmulas bien formadas", "Genera fórmulas bien formadas, con paréntesis cuando hace falta.");
    await caso("Antecedente compuesto", () => igual(formulas("Si llueve y hace frío, entonces no salgo"), ["(p ∧ q) → ¬r"]));
    await caso("Antecedente y consecuente compuestos",
      () => igual(formulas("Si llueve o hace frío, entonces no salgo y me quedo"), ["(p ∨ q) → (¬r ∧ s)"]));
    await caso("«y» dentro de «o»", () => igual(formulas("Es de día o llueve y hace frío"), ["p ∨ (q ∧ r)"]));
    await caso("Bicondicional con lado compuesto", () => igual(formulas("Apruebo si y solo si estudio y asisto"), ["p ↔ (q ∧ r)"]));
    await caso("«si y solo si» dentro del antecedente de un «si… entonces»",
      () => igual(formulas("Si apruebo si y solo si estudio, entonces festejo"), ["(p ↔ q) → r"]));
    await caso("«si y solo si» dentro del consecuente",
      () => igual(formulas("Si llueve, entonces salgo si y solo si hace sol"), ["p → (q ↔ r)"]));
    await caso("Cadena del mismo conector sin paréntesis de sobra", () => igual(formulas("Llueve y hace frío y hay viento"), ["p ∧ q ∧ r"]));
    await caso("Negación de una compuesta lleva paréntesis", () => {
      const r = createAtomRegistry(); const p = Atom(r.getOrCreate("a")), q = Atom(r.getOrCreate("b"));
      return igual([Not(And([p, q])), Not(Imp(p, q)), Imp(Imp(p, q), p)].map((f) => formulaToString(f)), ["¬(p ∧ q)", "¬(p → q)", "(p → q) → p"]);
    });

    grupo("9. Regla junto a su fórmula", "Muestra cada regla junto a su fórmula (R1: p → q…).");
    await caso("Cada regla guarda su texto y su fórmula", () => {
      const { rules } = analizarKB(EJEMPLO);
      return igual(rules.map((r, i) => "R" + (i + 1) + ": " + formulaToString(r.formula)), ["R1: p → q", "R2: r → ¬q", "R3: p"]);
    });

    grupo("10. Todas las reglas son verdaderas", "Parte suponiendo que todas las reglas son verdaderas.");
    await caso("El tronco del árbol contiene todas las reglas como premisas", () => {
      const { tree } = analizarKB(EJEMPLO);
      return igual(tree.lines.slice(0, 3).map((l) => l.origin + ": " + formulaToString(l.formula)), ["R1: p → q", "R2: r → ¬q", "R3: p"]);
    });

    grupo("11. Reglas de expansión", "α: ∧, ¬∨, ¬→, ¬¬ (misma rama) · β: ∨, →, ↔, ¬∧, ¬↔ (se ramifica).");
    {
      const r = createAtomRegistry(); const p = Atom(r.getOrCreate("a")), q = Atom(r.getOrCreate("b"));
      await caso("α  p ∧ q  ⟹  p, q", () => igual(expandir(And([p, q])), { misma: ["p", "q"] }));
      await caso("α  ¬(p ∨ q)  ⟹  ¬p, ¬q", () => igual(expandir(Not(Or([p, q]))), { misma: ["¬p", "¬q"] }));
      await caso("α  ¬(p → q)  ⟹  p, ¬q", () => igual(expandir(Not(Imp(p, q))), { misma: ["p", "¬q"] }));
      await caso("α  ¬¬p  ⟹  p", () => igual(expandir(Not(Not(p))), { misma: ["p"] }));
      await caso("β  p ∨ q  ⟹  p | q", () => igual(expandir(Or([p, q])), { ramas: [["p"], ["q"]] }));
      await caso("β  p → q  ⟹  ¬p | q", () => igual(expandir(Imp(p, q)), { ramas: [["¬p"], ["q"]] }));
      await caso("β  p ↔ q  ⟹  p, q | ¬p, ¬q", () => igual(expandir(Iff(p, q)), { ramas: [["p", "q"], ["¬p", "¬q"]] }));
      await caso("β  ¬(p ∧ q)  ⟹  ¬p | ¬q", () => igual(expandir(Not(And([p, q]))), { ramas: [["¬p"], ["¬q"]] }));
      await caso("β  ¬(p ↔ q)  ⟹  p, ¬q | ¬p, q", () => igual(expandir(Not(Iff(p, q))), { ramas: [["p", "¬q"], ["¬p", "q"]] }));
    }

    grupo("12. Desarrollo del árbol", "Desarrolla cada fórmula en las ramas de abajo, marca las aplicadas, cierra con átomo y negación (✗) y termina en literales.");
    await caso("Una fórmula se desarrolla en TODAS las ramas que tiene debajo", () => {
      const { tree } = analizarKB("Llueve o nieva\nSalgo o me quedo");
      const rs = ramas(tree);
      const ok = rs.length === 4 && rs.every((b) => b.lineas.some((l) => ["r", "s"].includes(formulaToString(l.formula))));
      return cierto(ok, "4 ramas y cada una desarrolló «Salgo o me quedo»", "ramas: " + rs.length);
    });
    await caso("Las fórmulas compuestas quedan marcadas como aplicadas", () => {
      const { tree } = analizarKB(EJEMPLO);
      const compuestas = tree.lines.filter((l) => !literal(l.formula));
      return cierto(compuestas.every((l) => l.applied), compuestas.length + " de " + compuestas.length + " marcadas ✓");
    });
    await caso("Cada rama cerrada contiene un átomo y su negación", () => {
      const rs = ramas(analizarKB(EJEMPLO).tree).filter((b) => b.hoja.closed);
      const ok = rs.every((b) => {
        const L = b.hoja.closedInfo.letter, fs = b.lineas.map((l) => formulaToString(l.formula));
        return fs.includes(L) && fs.includes("¬" + L);
      });
      return cierto(ok, rs.map((b) => b.hoja.closedInfo.letter + " y ¬" + b.hoja.closedInfo.letter).join(" · "));
    });
    await caso("Las ramas abiertas terminan solo en letras o letras negadas", () => {
      const rs = ramas(analizarKB(EJEMPLO).tree).filter((b) => b.hoja.open);
      const ok = rs.every((b) => b.lineas.every((l) => literal(l.formula) || l.applied));
      return cierto(ok, "nada quedó sin desarrollar");
    });
    await caso("Regla ¬↔ escrita en español (antes hacía fallar el árbol)", () => {
      const t = "Si apruebo si y solo si estudio, entonces festejo\nNo festejo";
      const { rules, tree } = analizarKB(t);
      const fs = rules.map((r) => r.formula);
      const ms = collectOpenBranches(tree);
      const ok = !allClosed(tree) && ms.length > 0 &&
        ms.every((m) => { const a = new Map(m.map(([l, v]) => [l, v === "V"])); return fs.every((f) => evaluate(f, a)); });
      return cierto(ok, "consistente; modelos: " + ms.map((m) => m.map(([l, v]) => l + "=" + v).join(" ")).join(" | "));
    });
    await caso("Una rama se cierra en cuanto aparece la contradicción", () => {
      const { tree } = analizarKB("Llueve\nNo llueve\nSi salgo, entonces me mojo");
      return cierto(tree.closed && !tree.children.length, "se cerró sin desarrollar la tercera regla");
    });

    grupo("13. Ramas abiertas como asignaciones", "Lista las ramas abiertas como asignaciones de valores (p = V, q = V, r = F).");
    await caso("Modelo del ejemplo del video", () => {
      const m = collectOpenBranches(analizarKB(EJEMPLO).tree);
      return igual(m.map((x) => x.map(([l, v]) => l + " = " + v).join(", ")), ["p = V, q = V, r = F"]);
    });
    await caso("Con varias ramas abiertas da un modelo por rama", () => igual(collectOpenBranches(analizarKB("Llueve o nieva").tree).length, 2));

    grupo("14. Base inconsistente", "Si todas las ramas se cierran, informa que la base de conocimiento es inconsistente.");
    await caso("«Llueve» y «No llueve»", () => igual(allClosed(analizarKB("Llueve\nNo llueve").tree), true));
    await caso("Modus ponens contradicho", () => igual(allClosed(analizarKB("Si llueve, entonces salgo\nLlueve\nNo salgo").tree), true));
    await caso("Sin modelos cuando es inconsistente", () => igual(collectOpenBranches(analizarKB("Llueve\nNo llueve").tree).length, 0));
    await caso("Una base consistente no se marca como inconsistente", () => igual(allClosed(analizarKB(EJEMPLO).tree), false));

    grupo("15. Caso de prueba mínimo (el del video)", "«Si es de día, entonces voy a trabajar», «Si llueve, entonces no voy a trabajar», «Es de día» → dos ramas cerradas y una abierta.");
    await caso("Dos ramas cerradas y una abierta", () => igual(hojas(analizarKB(EJEMPLO).tree), { abiertas: 1, cerradas: 2 }));
    await caso("Modelo p = V, q = V, r = F", () => igual(collectOpenBranches(analizarKB(EJEMPLO).tree)[0], [["p", "V"], ["q", "V"], ["r", "F"]]));

    grupo("15b. Frases como las escribiría una persona", "Otras formas comunes de decir lo mismo en español, además de las de la rúbrica.");
    const NATURALES = [
      ["Cuando llueve, no salgo", "p → ¬q"],
      ["Siempre que llueve, me mojo", "p → q"],
      ["Salgo si hace sol  (= si hace sol, salgo)", "q → p", "Salgo si hace sol"],
      ["Salgo cuando hace sol", "q → p"],
      ["Apruebo solo si estudio", "p → q"],
      ["Apruebo sólo si estudio", "p → q"],
      ["Salgo a menos que llueva  (= si no llueve, salgo)", "¬q → p", "Salgo a menos que llueva"],
      ["Llueve, entonces salgo", "p → q"],
      ["No es cierto que llueva", "¬p"],
      ["Es falso que haga frío", "¬p"],
      ["Ni llueve ni hace frío", "¬p ∧ ¬q"],
      ["No llueve ni hace frío", "¬p ∧ ¬q"],
      ["Llueve, hace frío y hay viento", "p ∧ q ∧ r"],
      ["Llueve, nieva o graniza", "p ∨ q ∨ r"],
      ["O llueve o hace sol", "p ∨ q"],
      ["Juan no va a la fiesta  (negación a media frase)", "¬p", "Juan no va a la fiesta"],
      ["Si llueve, entonces salgo si hace sol", "p → (r → q)"],
      ["Si no estudio, entonces no apruebo", "¬p → ¬q"],
    ];
    for (const [desc, esperado, texto] of NATURALES) await caso(desc, () => igual(formulas(texto || desc)[0], esperado));

    grupo("15c. Lenguaje de clase, negaciones y reglas pegadas", "Condición necesaria y suficiente, negar toda una frase, otros conectores y listas numeradas.");
    const CLASE = [
      ["Estudiar es condición suficiente para aprobar", "p → q"],
      ["Estudiar es condición necesaria para aprobar", "q → p"],
      ["Estudiar es condición necesaria y suficiente para aprobar", "p ↔ q"],
      ["Basta que llueva para que me moje", "p → q"],
      ["Es necesario que estudie para que apruebe", "q → p"],
      ["Para que apruebe, es necesario que estudie", "p → q"],
      ["Para que me moje, basta que llueva", "q → p"],
      ["Llueve implica que me mojo", "p → q"],
      ["Aprobar equivale a estudiar", "p ↔ q"],
      ["Si y solo si estudio, apruebo", "p ↔ q"],
      ["No es cierto que llueva y haga frío  (niega toda la frase)", "¬(p ∧ q)", "No es cierto que llueva y haga frío"],
      ["No llueve y hace frío  («no» solo niega lo que sigue)", "¬p ∧ q", "No llueve y hace frío"],
      ["Es falso que si llueve, salgo", "¬(p → q)"],
      ["No es verdad que llueve o nieva", "¬(p ∨ q)"],
      ["Hace frío aunque hay sol", "p ∧ q"],
      ["Aunque hace frío, hay sol", "p ∧ q"],
      ["Hace frío, sin embargo hay sol", "p ∧ q"],
      ["Hace frío; no obstante, hay sol", "p ∧ q"],
      ["O bien llueve o bien hace sol", "p ∨ q"],
      ["Llueve y además hace frío", "p ∧ q"],
      ["Cuando no llueve, si hace sol, salgo", "¬p → (q → r)"],
      ["Si llueve, entonces no es cierto que salga", "p → ¬q"],
    ];
    for (const [desc, esperado, texto] of CLASE) await caso(desc, () => igual(formulas(texto || desc)[0], esperado));
    await caso("Quita numeración, viñetas, comillas y puntuación final",
      () => igual(analizarKB('1. Si llueve, entonces salgo\n2) Llueve\nR3: No salgo\n- Hace frío\n• Hace sol\n"Nieva"\n¿Graniza?\nTruena;')
        .rules.map((r) => r.text + " = " + formulaToString(r.formula)),
        ["Si llueve, entonces salgo = p → q", "Llueve = p", "No salgo = ¬q", "Hace frío = r", "Hace sol = s", "Nieva = t", "¿Graniza? = u", "Truena = v"]));
    await caso("Una lista numerada sigue reconociendo el mismo átomo", () => igual(formulas("1. Si llueve, salgo\n2. Llueve\n3. No salgo"), ["p → q", "p", "¬q"]));
    await caso("«Juan no va a la fiesta» es la negación de «Juan va a la fiesta»", () => igual(formulas("Juan va a la fiesta\nJuan no va a la fiesta"), ["p", "¬p"]));
    await caso("Los acentos no cambian el átomo («Es de día» = «es de dia»)", () => igual(formulas("Es de día\nes de dia"), ["p", "p"]));
    await caso("…pero la ñ sí («año» ≠ «ano»)", () => igual(formulas("El año pasado\nEl ano pasado"), ["p", "q"]));

    grupo("16. Prueba masiva contra la tabla de verdad", "1000 bases de conocimiento al azar (1 a 4 fórmulas, 4 átomos, hasta 3 niveles). El árbol debe coincidir con la tabla de verdad.");
    {
      let consistencia = 0, modelos = 0, fbf = 0, N = 1000, primerFallo = null;
      for (let n = 0; n < N; n++) {
        const fs = Array.from({ length: 1 + azar(4) }, () => formulaAzar(3));
        resetFormulaIds();
        const tree = buildTableau(fs.map((f, i) => labelFormula(f, "R" + (i + 1))));
        // a) el arbol dice "inconsistente" exactamente cuando la tabla de verdad no tiene ninguna fila verdadera
        if (allClosed(tree) === !satisfacible(fs)) consistencia++;
        else if (!primerFallo) primerFallo = fs.map((f) => formulaToString(f)).join(" ; ");
        // b) cada rama abierta es de verdad un modelo de todas las formulas
        const ms = collectOpenBranches(tree);
        if (ms.every((m) => { const a = new Map(m.map(([l, v]) => [l, v === "V"])); return fs.every((f) => evaluate(f, a)); })) modelos++;
        // c) lo que se escribe es una formula bien formada y se lee igual de vuelta
        if (fs.every((f) => { const s = formulaToString(f); try { return formulaToString(leerFBF(s)) === s; } catch (e) { return false; } })) fbf++;
      }
      await caso("Consistente / inconsistente coincide con la tabla de verdad",
        () => cierto(consistencia === N, consistencia + " de " + N, consistencia + " de " + N + "\nprimer fallo: " + primerFallo));
      await caso("Cada rama abierta hace verdaderas todas las fórmulas", () => cierto(modelos === N, modelos + " de " + N));
      await caso("Todas las fórmulas escritas son bien formadas", () => cierto(fbf === N, fbf + " de " + N));
    }

    grupo("17. La página real", "Abre index.html con el caso del video y revisa lo que se ve en pantalla.");
    await pruebasInterfaz();

    pintar();
  }

  // ---------- pruebas sobre la pagina real (en un iframe oculto) ----------
  function cargarPagina(kb) {
    return new Promise((res, rej) => {
      const fr = document.createElement("iframe");
      fr.className = "ui";
      fr.setAttribute("aria-hidden", "true");
      fr.src = "../index.html?kb=" + encodeURIComponent(kb);
      fr.onload = () => setTimeout(() => {
        try { fr.contentDocument.body; res(fr); } catch (e) { rej(new Error("no se pudo leer la página (abre las pruebas desde un servidor, no como archivo)")); }
      }, 400);
      document.body.appendChild(fr);
    });
  }
  async function pruebasInterfaz() {
    // abierta como archivo (doble clic) el navegador no deja revisar otra pagina:
    // no es un fallo del motor, asi que el grupo se marca como omitido
    if (location.protocol === "file:") {
      await caso("Revisar index.html", () => ({ omitida: true,
        detalle: "Omitida: abriste las pruebas como archivo. Ábrelas desde la URL pública o un servidor local para incluir este grupo." }));
      return;
    }
    let fr;
    try { fr = await cargarPagina(EJEMPLO); } catch (e) { await caso("Cargar index.html", () => { throw e; }); return; }
    const d = fr.contentDocument;
    const txt = (sel) => Array.from(d.querySelectorAll(sel)).map((e) => e.textContent.replace(/\s+/g, " ").trim());
    await caso("Veredicto: consistente", () => igual(txt(".v-title")[0], "Consistente."));
    await caso("Tabla de átomos con letra y significado", () => igual(Array.from(d.querySelectorAll(".atom-card")).map((c) =>
      c.querySelector(".tok.atom").textContent + " = " + c.querySelector(".meaning").firstChild.textContent), ["p = Es de día", "q = Voy a trabajar", "r = Llueve"]));
    await caso("Cada regla aparece con su fórmula", () => igual(Array.from(d.querySelectorAll(".rule")).map((r) =>
      r.querySelector(".rule-id").textContent + ": " + r.querySelector(".rule-formula .f").textContent.replace(/\s+/g, "")), ["R1: p→q", "R2: r→¬q", "R3: p"]));
    await caso("El árbol muestra 2 ramas cerradas (✗) y 1 abierta", () => igual({ cerradas: d.querySelectorAll(".leaf.closed").length, abiertas: d.querySelectorAll(".leaf.open").length }, { cerradas: 2, abiertas: 1 }));
    await caso("Las fórmulas aplicadas llevan su marca ✓", () => cierto(d.querySelectorAll(".fline .fcheck").length >= 2, d.querySelectorAll(".fline .fcheck").length + " marcas"));
    await caso("La rama abierta se lista como asignación", () => igual(txt(".model .badge")[0], "p = V, q = V, r = F"));
    await caso("Se comprueba que el modelo satisface R1, R2 y R3", () => igual(txt(".model .checks span"), ["R1 ✓", "R2 ✓", "R3 ✓"]));

    // cambiar de tema dos veces muy rapido no debe dejar errores
    const w = fr.contentWindow;
    const errores = [];
    w.addEventListener("error", (e) => errores.push(e.message));
    w.addEventListener("unhandledrejection", (e) => errores.push(String(e.reason)));
    const tema0 = d.documentElement.dataset.theme;
    d.querySelector("#btnTema").click();
    await new Promise((r) => setTimeout(r, 900));
    await caso("Un clic en el botón de tema cambia el tema", () =>
      cierto(d.documentElement.dataset.theme !== tema0, tema0 + " → " + d.documentElement.dataset.theme, "se quedó en " + tema0));
    d.querySelector("#btnTema").click();
    await new Promise((r) => setTimeout(r, 900));
    d.querySelector("#btnTema").click();
    d.querySelector("#btnTema").click();
    await new Promise((r) => setTimeout(r, 900));
    await caso("Cambiar de tema dos veces seguidas no deja errores", () =>
      igual({ tema: d.documentElement.dataset.theme === tema0, errores }, { tema: true, errores: [] }));

    // escribir en el editor una base inconsistente y ver que la pagina reacciona
    const ta = d.querySelector("#entrada");
    ta.value = "Llueve\nNo llueve";
    ta.dispatchEvent(new w.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 450));
    await caso("Al escribir una contradicción la página dice «Inconsistente»", () => igual(txt(".v-title")[0], "Inconsistente."));
    await caso("…sin ramas abiertas y con aviso de que ninguna queda abierta", () =>
      igual({ abiertas: d.querySelectorAll(".leaf.open").length, aviso: !!d.querySelector(".model-empty") }, { abiertas: 0, aviso: true }));

    // avisos de cosas que probablemente se escribieron distinto sin querer
    async function avisosDe(texto) {
      ta.value = texto;
      ta.dispatchEvent(new w.Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 450));
      const av = d.querySelector("#avisos");
      return av.hidden ? "" : av.textContent;
    }
    let av = await avisosDe("Si llueve, me mojo\nLlueva");
    await caso("Avisa si la misma palabra aparece en otra forma («llueve» / «llueva»)", () => cierto(/otra forma/.test(av), av || "sin aviso"));
    av = await avisosDe("Si llueve, me mojo\nLlueve");
    await caso("…y no avisa cuando está bien escrito", () => cierto(av === "", "sin avisos", av));
    av = await avisosDe("Hace frío\nHace sol");
    await caso("…ni confunde ideas distintas («hace frío» / «hace sol»)", () => cierto(av === "", "sin avisos", av));
    av = await avisosDe("Si llueve\nSalgo");
    await caso("Avisa de un «si» sin consecuencia", () => cierto(/empieza con «si»/.test(av), av || "sin aviso"));
    fr.remove();
  }

  // ---------- reporte ----------
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function pintar() {
    let total = 0, bien = 0, omitidas = 0;
    const estado = (c) => (c.omitida ? "skip" : c.ok ? "ok" : "bad");
    document.querySelector("#grupos").innerHTML = grupos.map((g) => {
      const corridas = g.casos.filter((c) => !c.omitida);
      const ok = corridas.filter((c) => c.ok).length;
      total += corridas.length; bien += ok; omitidas += g.casos.length - corridas.length;
      const cls = !corridas.length ? "skip" : ok === corridas.length ? "ok" : "bad";
      return '<section class="group ' + cls + '"><h2>' + esc(g.nombre) +
        '<span class="n">' + (corridas.length ? ok + " / " + corridas.length : "omitido") + "</span></h2>" +
        '<p class="req">' + esc(g.requisito) + "</p>" +
        g.casos.map((c) => '<div class="case ' + estado(c) + '"><i>' + ({ ok: "✓", bad: "✗", skip: "–" }[estado(c)]) + "</i><span>" + esc(c.desc) + "</span>" +
          (c.detalle ? '<span class="d">' + esc(c.detalle) + "</span>" : "") + "</div>").join("") +
        "</section>";
    }).join("");
    const r = document.querySelector("#resumen");
    r.className = "summary " + (bien === total ? "ok" : "bad");
    r.innerHTML = "<b>" + bien + " / " + total + "</b><span>" +
      (bien === total ? "Todas las pruebas pasaron." : (total - bien) + " prueba(s) fallaron. Revisa los grupos en rojo.") +
      (omitidas ? " (" + omitidas + " omitida: ábrelas desde un servidor para incluirla.)" : "") + "</span>";
    window.resultadoPruebas = { total, bien, omitidas, fallos: grupos.flatMap((g) => g.casos.filter((c) => !c.ok && !c.omitida).map((c) => g.nombre + " › " + c.desc + " :: " + c.detalle)) };
  }

  document.querySelector("#btnCorrer").addEventListener("click", () => {
    document.querySelector("#resumen").innerHTML = "<b>…</b><span>Corriendo pruebas</span>";
    setTimeout(correr, 30);
  });
  correr();
})();
