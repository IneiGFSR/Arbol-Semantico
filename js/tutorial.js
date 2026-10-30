/* =====================================================================
   tutorial.js — el recorrido animado (tutorial.html)
   Separado de la herramienta: aqui no se escribe nada, los pasos se
   ejecutan solos. Las escenas salen del calculo real de motor.js, asi
   que el tutorial nunca se desincroniza de lo que hace el motor.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const EJEMPLOS = [
    { nombre: "Ejemplo del video", texto: "Si es de día, entonces voy a trabajar\nSi llueve, entonces no voy a trabajar\nEs de día" },
    { nombre: "Una contradicción", texto: "Si llueve, entonces me mojo\nLlueve\nNo me mojo" },
    { nombre: "Una bicondicional", texto: "Apruebo si y solo si estudio\nNo estudio" },
  ];

  const $ = (sel) => document.querySelector(sel);
  const narracion = $("#tutNarracion");
  const escenaTexto = $("#escenaTexto");
  const escenaArbol = $("#escenaArbol");
  const arbol = $("#tutArbol");
  const btnPlay = $("#tutPlay");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  iniciarTema($("#btnTema"));

  const CAPITULOS = ["Frases", "Átomos", "Fórmulas", "Árbol", "Resultado"];
  let datos = null;     // { rules, atoms, tree, vista }
  let escenas = [];     // [{ cap, texto, ms, mostrar }]
  let actual = 0;
  let timer = null;
  let velocidad = 1;
  let ejemploActual = 0;

  // ---------- pantallas de texto ----------
  const verTexto = (html) => () => {
    escenaArbol.hidden = true;
    escenaTexto.hidden = false;
    escenaTexto.innerHTML = html;
  };
  function frasesHtml(conResaltado, conFormula) {
    return '<div class="tut-frases">' + datos.rules.map((r, i) =>
      '<div class="tut-frase" style="--i:' + i + '"><span class="rule-id">R' + (i + 1) + "</span>" +
      '<span class="rule-text">' + (conResaltado ? ruleTextHtml(r.text, datos.atoms) : escapeHtml(r.text)) + "</span>" +
      (conFormula ? fHtml(r.formula) : "<span></span>") + "</div>"
    ).join("") + "</div>";
  }
  function finalHtml() {
    const cerrado = allClosed(datos.tree);
    const { open, closed } = contarHojas(datos.tree);
    const modelos = collectOpenBranches(datos.tree);
    return '<div class="tut-final ' + (cerrado ? "bad" : "ok") + '"><h2 class="v-title">' + (cerrado ? "Inconsistente." : "Consistente.") + "</h2>" +
      (cerrado
        ? "<p>Las " + closed + " ramas se cerraron: no hay ninguna forma de que todas las reglas sean verdaderas a la vez.</p>"
        : "<p>" + (open === 1 ? "Quedó una rama abierta" : "Quedaron " + open + " ramas abiertas") + ". Sus letras dicen qué valores hacen verdaderas todas las reglas:</p>" +
          '<div class="modelo"><span class="f">' + modelHtml(modelos[0], datos.atoms) + "</span></div>") + "</div>";
  }

  // ---------- pantalla del arbol ----------
  const verArbol = (k) => () => {
    escenaTexto.hidden = true;
    escenaArbol.hidden = false;
    ajustarArbol();
    const el = mostrarPasoArbol(datos.vista, k);
    const c = escenaArbol.getBoundingClientRect();
    if (el) {
      const r = el.getBoundingClientRect();
      escenaArbol.scrollBy({ left: r.left + r.width / 2 - (c.left + c.width / 2), top: r.top + r.height / 2 - (c.top + c.height / 2), behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      escenaArbol.scrollTo({ left: 0, top: 0, behavior: reduceMotion ? "auto" : "smooth" }); // al terminar, el arbol completo
    }
  };
  function ajustarArbol() {
    // el arbol completo a la vista, a lo ancho y a lo alto (44 = relleno de .tree)
    arbol.style.setProperty("--zoom", 1);
    const raiz = arbol.firstElementChild;
    if (!raiz || !escenaArbol.clientWidth) return;
    const escala = Math.min(1, (escenaArbol.clientWidth - 20) / raiz.offsetWidth, (escenaArbol.clientHeight - 8) / (raiz.offsetHeight + 44));
    arbol.style.setProperty("--zoom", Math.max(0.45, escala));
  }

  // ---------- el guion: cada escena dice que pantalla ver y que narrar ----------
  function prepararGuion(texto) {
    resetFormulaIds();
    const { rules, registry } = parseKnowledgeBase(texto);
    const labeled = rules.map((r, i) => labelFormula(r.formula, "R" + (i + 1)));
    const tree = buildTableau(labeled);
    datos = { rules, atoms: registry.list(), tree };
    datos.vista = construirArbol(arbol, tree, datos.atoms);

    const n = plural(rules.length, "regla", "reglas");
    escenas = [
      { cap: 0, ms: 4500, mostrar: verTexto(frasesHtml(false, false)),
        texto: "Todo empieza con " + n + " en español. A esto le llamamos <b>base de conocimiento</b>." },
      { cap: 1, ms: 5000, mostrar: verTexto(frasesHtml(true, false)),
        texto: "Primero separamos las <b>proposiciones simples</b>: ideas que pueden ser verdaderas o falsas. Las palabras en rojo son los conectivos." },
      { cap: 1, ms: 4500, mostrar: verTexto('<div class="atoms">' + datos.atoms.map(atomoCardHtml).join("") + "</div>"),
        texto: "A cada proposición le toca una letra. Si la misma idea se repite, conserva su letra." },
      { cap: 2, ms: 5000, mostrar: verTexto(frasesHtml(true, true)),
        texto: "Con las letras y los conectivos, cada regla se convierte en una <b>fórmula</b>." },
      { cap: 3, ms: 4000, mostrar: verArbol(0),
        texto: "Ahora suponemos que <b>todas las reglas son verdaderas</b> al mismo tiempo, y buscamos si eso es posible." },
    ];
    datos.vista.steps.forEach((s, i) => {
      escenas.push({
        cap: 3,
        ms: s.kind === "leaf" ? 4000 : 3000,
        mostrar: verArbol(i + 1),
        texto: textoPasoArbol(datos.vista, i + 1),
      });
    });
    escenas.push({ cap: 3, ms: 3500, mostrar: verArbol(datos.vista.steps.length), texto: textoPasoArbol(datos.vista, datos.vista.steps.length) });
    escenas.push({ cap: 4, ms: 6000, mostrar: verTexto(finalHtml()),
      texto: allClosed(tree)
        ? "Si <b>todas</b> las ramas se cierran, las reglas se contradicen entre sí."
        : "Con <b>una</b> rama abierta basta: las reglas pueden cumplirse todas a la vez." });

    $("#tutProbar").href = "index.html?kb=" + encodeURIComponent(texto) + "#editor";
    pintarCapitulos();
  }

  function pintarCapitulos() {
    $("#tutCapitulos").innerHTML = CAPITULOS.map((c, i) =>
      '<li><button type="button" data-cap="' + i + '">' + c + "</button></li>").join("");
  }

  function irA(i) {
    actual = Math.max(0, Math.min(i, escenas.length - 1));
    const e = escenas[actual];
    e.mostrar();
    narracion.classList.remove("cambio");
    void narracion.offsetWidth; // reinicia la animacion de entrada del texto
    narracion.classList.add("cambio");
    narracion.innerHTML = e.texto;
    document.querySelectorAll("#tutCapitulos button").forEach((b) => {
      const on = Number(b.dataset.cap) === e.cap;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    $("#tutBarra").style.width = ((actual + 1) / escenas.length) * 100 + "%";
    $("#tutPrev").disabled = actual === 0;
    $("#tutNext").disabled = actual === escenas.length - 1;
  }

  // ---------- reproduccion ----------
  function programar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (actual >= escenas.length - 1) return pausar();
      irA(actual + 1);
      programar();
    }, escenas[actual].ms * velocidad);
  }
  function reproducir() {
    if (actual >= escenas.length - 1) irA(0);
    btnPlay.classList.add("playing");
    btnPlay.setAttribute("aria-label", "Pausar");
    narracion.setAttribute("aria-live", "off"); // el lector no debe atropellarse con el avance automatico
    programar();
  }
  function pausar() {
    clearTimeout(timer); timer = null;
    btnPlay.classList.remove("playing");
    btnPlay.setAttribute("aria-label", "Reproducir");
    narracion.setAttribute("aria-live", "polite");
  }
  const reproduciendo = () => btnPlay.classList.contains("playing");

  btnPlay.addEventListener("click", () => (reproduciendo() ? pausar() : reproducir()));
  $("#tutPrev").addEventListener("click", () => { pausar(); irA(actual - 1); });
  $("#tutNext").addEventListener("click", () => { pausar(); irA(actual + 1); });
  $("#tutReiniciar").addEventListener("click", () => { irA(0); if (!reduceMotion) reproducir(); });

  $("#tutCapitulos").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const i = escenas.findIndex((x) => x.cap === Number(b.dataset.cap));
    irA(i);
    if (reproduciendo()) programar();
  });

  document.querySelector(".tut-velocidad").addEventListener("click", (e) => {
    const b = e.target.closest("[data-vel]");
    if (!b) return;
    velocidad = Number(b.dataset.vel);
    document.querySelectorAll("[data-vel]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (reproduciendo()) programar();
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowRight") { e.preventDefault(); pausar(); irA(actual + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); pausar(); irA(actual - 1); }
    else if (e.key === " " && !e.target.closest("button, a")) { e.preventDefault(); reproduciendo() ? pausar() : reproducir(); }
  });

  // ---------- ejemplos ----------
  function cargarEjemplo(i) {
    pausar();
    ejemploActual = i;
    document.querySelectorAll("#tutEjemplos .chip").forEach((c) => c.classList.toggle("on", Number(c.dataset.i) === i));
    prepararGuion(EJEMPLOS[i].texto);
    irA(0);
    if (!reduceMotion) reproducir();
  }
  $("#tutEjemplos").innerHTML = EJEMPLOS.map((e, i) => '<button class="chip" type="button" data-i="' + i + '">' + e.nombre + "</button>").join("");
  $("#tutEjemplos").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (c) cargarEjemplo(Number(c.dataset.i));
  });

  // misma onda al tocar que en la herramienta
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn, .chip, .pill-btn, .icon-btn");
    if (!btn || btn.disabled || reduceMotion) return;
    const r = btn.getBoundingClientRect();
    const wave = document.createElement("span");
    wave.className = "ripple";
    wave.style.setProperty("--x", e.clientX - r.left + "px");
    wave.style.setProperty("--y", e.clientY - r.top + "px");
    wave.style.setProperty("--s", Math.hypot(r.width, r.height) * 2 + "px");
    btn.appendChild(wave);
    wave.addEventListener("animationend", () => wave.remove(), { once: true });
  }, { passive: true });

  window.addEventListener("resize", ajustarArbol);
  cargarEjemplo(0);
});
