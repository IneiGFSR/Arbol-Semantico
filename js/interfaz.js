/* =====================================================================
   interfaz.js — Pieza 4 (parte logica)
   Conecta motor.js con la pantalla: lee el textarea, llama al motor,
   y pinta la tabla de atomos, la lista de reglas, el arbol (con
   reproduccion paso a paso) y los modelos de las ramas abiertas.
   Las funciones que usa (parseKnowledgeBase, buildTableau, etc.) vienen
   de motor.js, que se carga ANTES que este archivo en index.html.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const EJEMPLOS = [
    { nombre: "Ejemplo del video", texto: "Si es de día, entonces voy a trabajar\nSi llueve, entonces no voy a trabajar\nEs de día" },
    { nombre: "Contradicción", texto: "Llueve\nNo llueve" },
    { nombre: "Átomo repetido", texto: "Si llueve, entonces voy a trabajar\nSi hace frío, entonces voy a trabajar\nLlueve" },
    { nombre: "Conjunción", texto: "Si llueve y hace frío, entonces no salgo\nLlueve\nHace frío" },
    { nombre: "Bicondicional", texto: "Apruebo si y solo si estudio\nEstudio" },
    { nombre: "Disyunción", texto: "Es de día o llueve\nNo es de día" },
    { nombre: "Fórmula pura", texto: "(p ^ q) <-> (r v s)\np\n~r" },
  ];

  const $ = (sel) => document.querySelector(sel);
  const entrada = $("#entrada");
  const gutter = $("#gutter");
  const editorMeta = $("#editorMeta");
  const vacio = $("#vacio");
  const resultados = $("#resultados");
  const arbol = $("#arbol");
  const treeScroll = $("#treeScroll");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;


  // ---------- resaltado de un atomo en toda la pagina ----------
  let hlKey = null;
  function setHighlight(key) {
    if (key === hlKey) return;
    document.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
    hlKey = key;
    if (!key) return;
    document.querySelectorAll("[data-atom]").forEach((el) => {
      if (el.dataset.atom === key) el.classList.add("hl");
    });
  }
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-atom]");
    setHighlight(el ? el.dataset.atom : null);
  });
  document.addEventListener("click", (e) => { // en pantallas tactiles, tocar alterna el resaltado
    const el = e.target.closest("[data-atom]");
    if (el) setHighlight(hlKey === el.dataset.atom ? null : el.dataset.atom);
  });

  // ---------- contador animado ----------
  function countTo(el, to) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (reduceMotion || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 700;
    (function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  // ---------- Pieza 2: tabla de atomos ----------
  function renderAtomos(registry) {
    $("#tbodyAtomos").innerHTML = registry.list().map(atomoCardHtml).join("");
  }

  // ---------- Pieza 1: reglas y formulas ----------
  function renderReglas(rules, registry) {
    const atoms = registry.list();
    $("#listaReglas").innerHTML = rules.map((r, i) =>
      '<div class="rule" style="--i:' + Math.min(i, 12) + '">' +
        '<span class="rule-id">R' + (i + 1) + "</span>" +
        '<span class="rule-text">' + (r.esFormula ? '<span class="plano">' + escapeHtml(r.text) + "</span>" : ruleTextHtml(r.text, atoms)) + "</span>" +
        '<span class="rule-formula"><span class="arrow" aria-hidden="true">→</span>' + fHtml(r.formula) + "</span>" +
      "</div>"
    ).join("");
  }

  // ---------- Pieza 3: veredicto y numeros ----------
  // estado: "ok", "bad" o "duda". Normalmente lo decide el arbol; si salio
  // demasiado grande, lo decide buscarModelo (ver modeloGrande en analizar)
  function estadoDe(tree) {
    if (!tree.truncado) return allClosed(tree) ? "bad" : "ok";
    return modeloGrande === undefined ? "duda" : modeloGrande === null ? "bad" : "ok";
  }

  let lastVerdict = null;
  function renderVeredicto(tree, rules, registry) {
    const el = $("#veredicto");
    const estado = estadoDe(tree);
    const { open, closed } = contarHojas(tree);
    const n = rules.length;
    const reglas = plural(n, "regla", "reglas");
    const texto = tree.truncado
      ? { ok: "Se encontró una asignación de valores que hace verdaderas las " + reglas + ".",
          bad: "Se revisaron las combinaciones posibles y ninguna hace verdaderas las " + reglas + " a la vez.",
          duda: "Hay demasiadas combinaciones para revisarlas. Prueba con menos reglas." }[estado]
      : estado === "bad"
        ? (closed === 1 ? "La única rama se cierra" : "Las " + closed + " ramas se cierran") +
          ": no existe ninguna asignación de valores que haga verdaderas las " + reglas + " a la vez."
        : (open === 1 ? "Queda una rama abierta" : "Quedan " + open + " ramas abiertas") +
          ": existe al menos una asignación de valores que hace verdaderas las " + reglas + ".";
    const titulo = { ok: "Consistente.", bad: "Inconsistente.", duda: "Sin decidir." }[estado];
    el.className = "verdict reveal in " + estado;
    el.innerHTML = '<div class="v-icon">' + { ok: "✓", bad: "✗", duda: "?" }[estado] + "</div>" +
      '<p class="v-kicker">La base de conocimiento es</p><h3 class="v-title">' + titulo + "</h3>" +
      '<p class="v-text">' + texto + "</p>";
    if (estado !== lastVerdict) { el.classList.add("pop"); lastVerdict = estado; }

    const stats = $("#stats");
    if (!stats.children.length) {
      stats.innerHTML =
        '<div class="stat"><b data-k="reglas">0</b><span>Reglas</span></div>' +
        '<div class="stat"><b data-k="atomos">0</b><span>Átomos</span></div>' +
        '<div class="stat good"><b data-k="abiertas">0</b><span>Ramas abiertas</span></div>' +
        '<div class="stat bad"><b data-k="cerradas">0</b><span>Ramas cerradas</span></div>';
    }
    countTo(stats.querySelector('[data-k="reglas"]'), n);
    countTo(stats.querySelector('[data-k="atomos"]'), registry.list().length);
    for (const [k, valor] of [["abiertas", open], ["cerradas", closed]]) {
      const b = stats.querySelector('[data-k="' + k + '"]');
      if (tree.truncado) { b.dataset.v = 0; b.textContent = "—"; } // sin arbol no hay ramas que contar
      else countTo(b, valor);
    }
  }

  // ---------- Pieza 3: dibujo del arbol + reproduccion paso a paso ----------
  let vistaArbol = null;  // lo que arma construirArbol (ver vista.js); null si no hay arbol que dibujar
  let stepIndex = 0;
  const totalPasos = () => (vistaArbol ? vistaArbol.steps.length : 0);
  const BOTONES_ARBOL = ["#btnTextoArbol", "#btnImagen", "#btnCopiarImagen"];

  function renderArbol(tree) {
    pause();
    const hay = !tree.truncado;
    treeScroll.hidden = !hay;
    BOTONES_ARBOL.forEach((id) => { $(id).disabled = !hay; });
    if (!hay) {
      vistaArbol = null;
      arbol.innerHTML = "";
      showStep(0);
      $("#stepCaption").textContent = "Este árbol pasaría de " + MAX_LINEAS_ARBOL.toLocaleString("es-MX") +
        " líneas: ya no se podría leer ni dibujar. El resultado de arriba se calculó con una búsqueda directa de valores.";
      cerrarTextoArbol();
      return;
    }
    vistaArbol = construirArbol(arbol, tree, currentAtoms);
    showStep(totalPasos());
    fitTree();
    if (!$("#arbolTexto").hidden) $("#arbolTexto").innerHTML = arbolEnTextoHtml(tree, currentAtoms);
  }

  function showStep(k) {
    stepIndex = Math.max(0, Math.min(k, totalPasos()));
    const actual = vistaArbol ? mostrarPasoArbol(vistaArbol, stepIndex) : null;
    if (actual) scrollTreeTo(actual);
    $("#stepCaption").innerHTML = vistaArbol ? textoPasoArbol(vistaArbol, stepIndex) : "";
    $("#progressBar").style.width = (totalPasos() ? (stepIndex / totalPasos()) * 100 : 0) + "%";
    $("#btnPrev").disabled = stepIndex === 0;
    $("#btnNext").disabled = stepIndex === totalPasos();
  }

  // version en texto del arbol, para lectores de pantalla o para copiarla
  function cerrarTextoArbol() {
    $("#arbolTexto").hidden = true;
    $("#btnTextoArbol").setAttribute("aria-expanded", "false");
    $("#btnTextoArbol").textContent = "Ver como texto";
  }
  $("#btnTextoArbol").addEventListener("click", () => {
    const panel = $("#arbolTexto");
    if (!panel.hidden) return cerrarTextoArbol();
    panel.innerHTML = arbolEnTextoHtml(currentTree, currentAtoms);
    panel.hidden = false;
    $("#btnTextoArbol").setAttribute("aria-expanded", "true");
    $("#btnTextoArbol").textContent = "Ocultar texto";
  });

  // el arbol como imagen: para bajarla o pegarla directo en un reporte
  const imagenArbol = () => arbolAImagen(currentTree, currentAtoms)
    .then((canvas) => new Promise((res) => canvas.toBlob(res, "image/png")));
  $("#btnImagen").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const blob = await imagenArbol();
    if (!blob) return avisar("El árbol es demasiado grande para convertirlo en imagen");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "arbol-semantico.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    confirmarBoton(btn, "Descargada");
  });
  $("#btnCopiarImagen").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": imagenArbol() })]);
      confirmarBoton(btn, "Copiada");
    } catch (err) {
      avisar("Este navegador no dejó copiar la imagen. Usa «Descargar imagen».");
    }
  });

  // mueve el scroll del contenedor (no de la pagina) para que se vea el paso actual
  function scrollTreeTo(el) {
    const c = treeScroll.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - (c.left + c.width / 2);
    const dy = r.top + r.height / 2 - (c.top + c.height / 2);
    treeScroll.scrollBy({ left: dx, top: dy, behavior: reduceMotion ? "auto" : "smooth" });
  }

  let timer = null;
  const btnPlay = $("#btnPlay");
  function play(speed) {
    if (!totalPasos()) return;
    if (stepIndex >= totalPasos()) showStep(0);
    btnPlay.classList.add("playing");
    btnPlay.setAttribute("aria-label", "Pausar");
    $("#stepCaption").setAttribute("aria-live", "off"); // no leer cada paso en voz alta mientras corre
    clearInterval(timer);
    timer = setInterval(() => {
      showStep(stepIndex + 1);
      if (stepIndex >= totalPasos()) pause(); // al llegar al final el boton vuelve a "reproducir" de inmediato
    }, speed || Math.max(90, Math.min(950, 30000 / totalPasos()))); // los arboles grandes van mas rapido
  }
  function pause() {
    clearInterval(timer); timer = null;
    btnPlay.classList.remove("playing");
    btnPlay.setAttribute("aria-label", "Reproducir");
    $("#stepCaption").setAttribute("aria-live", "polite");
  }
  btnPlay.addEventListener("click", () => (timer ? pause() : play()));
  $("#btnPrev").addEventListener("click", () => { pause(); showStep(stepIndex - 1); });
  $("#btnNext").addEventListener("click", () => { pause(); showStep(stepIndex + 1); });
  $("#btnTodo").addEventListener("click", () => { pause(); showStep(totalPasos()); });

  // atajos de teclado mientras el arbol esta en pantalla: ← → pasos, espacio reproduce
  let treeVisible = false;
  new IntersectionObserver((en) => { treeVisible = en[0].isIntersecting; }, { threshold: 0.25 }).observe($(".tree-card"));
  document.addEventListener("keydown", (e) => {
    if (!treeVisible || e.ctrlKey || e.metaKey || e.altKey || !totalPasos()) return;
    const t = e.target;
    if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable) return;
    if (e.key === "ArrowRight") { e.preventDefault(); pause(); showStep(stepIndex + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); pause(); showStep(stepIndex - 1); }
    else if (e.key === " " && !t.closest("button, a")) { e.preventDefault(); timer ? pause() : play(); }
  });

  // zoom del arbol
  let zoom = 1;
  function setZoom(z) {
    zoom = Math.round(Math.max(0.4, Math.min(1.6, z)) * 100) / 100;
    arbol.style.setProperty("--zoom", zoom);
    $("#zoomVal").textContent = Math.round(zoom * 100) + "%";
  }
  function fitTree() {
    arbol.style.setProperty("--zoom", 1);
    const w = arbol.firstElementChild ? arbol.firstElementChild.offsetWidth : 0;
    const avail = treeScroll.clientWidth - 20;
    setZoom(w > avail ? avail / w : 1);
  }
  $("#btnZoomIn").addEventListener("click", () => setZoom(zoom + 0.1));
  $("#btnZoomOut").addEventListener("click", () => setZoom(zoom - 0.1));
  $("#btnAjustar").addEventListener("click", fitTree);
  let resizeT;
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(fitTree, 200); });

  // ---------- Paso 4: modelos de las ramas abiertas ----------
  function renderModelos(tree, rules, registry) {
    const cont = $("#modelos");
    const leaves = [];
    if (tree.truncado) {
      // sin arbol no hay ramas: se muestra la asignacion que encontro la busqueda
      if (modeloGrande) {
        leaves.push({ titulo: "Una asignación que funciona", model: Array.from(modeloGrande.entries())
          .map(([l, v]) => [l, v ? "V" : "F"]).sort((a, b) => a[0].localeCompare(b[0])) });
      }
    } else {
      (function walk(n) { if (n.open) leaves.push(n); (n.children || []).forEach(walk); })(tree);
    }

    if (!leaves.length) {
      const duda = estadoDe(tree) === "duda";
      cont.innerHTML =
        '<div class="model model-empty"><div class="v-icon" style="margin:0 auto 14px;background:var(--bad-soft);color:var(--bad);box-shadow:inset 0 0 0 1.5px var(--bad-border)">' + (duda ? "?" : "✗") + "</div>" +
        (duda
          ? "<h3>No se pudo decidir.</h3><p>Esta base tiene demasiadas combinaciones para revisarlas todas en el navegador.</p></div>"
          : tree.truncado
            ? "<h3>Ninguna asignación funciona.</h3><p>La base de conocimiento es " + '<b style="color:var(--bad)">inconsistente</b>: no hay forma de que todas las reglas sean verdaderas al mismo tiempo.</p></div>'
            : "<h3>Ninguna rama queda abierta.</h3><p>Todas las ramas se cierran, así que la base de conocimiento es " +
              '<b style="color:var(--bad)">inconsistente</b>: no hay forma de que todas las reglas sean verdaderas al mismo tiempo.</p></div>');
      return;
    }

    cont.innerHTML = leaves.map((leaf, i) => {
      const asg = new Map(leaf.model.map(([l, v]) => [l, v === "V"]));
      const tiles = registry.list().map((e) => {
        const has = asg.has(e.letter);
        const v = asg.get(e.letter);
        const cls = !has ? "any" : v ? "v" : "fa";
        const val = !has ? "V/F" : v ? "V" : "F";
        const sub = !has ? "cualquiera" : v ? "verdadero" : "falso";
        return '<div class="asg ' + cls + '">' + atomHtml(e) + '<span class="val">' + val + "<small>" + sub + "</small></span></div>";
      }).join("");
      // comprobacion: con este modelo (lo que no aparece se toma como F) cada regla es verdadera
      const ok = rules.map((r, j) => '<span>R' + (j + 1) + " <b>" + (evaluate(r.formula, asg) ? "✓" : "✗") + "</b></span>").join("");
      const plain = leaf.model.map(([l, v]) => l + " = " + v).join(", ") || "sin restricciones";
      return '<div class="model" style="--i:' + Math.min(i, 12) + '">' +
        '<div class="model-head"><h3>' + (leaf.titulo || "Rama abierta " + leaf.num) + '</h3><span class="badge good">' + escapeHtml(plain) + "</span></div>" +
        '<div class="assign">' + tiles + "</div>" +
        '<div class="checks">' + ok + "</div>" +
      "</div>";
    }).join("");
  }

  // ---------- tabla de verdad: verifica el arbol por un camino independiente ----------
  function renderTabla(tree, rules) {
    const caja = $("#tablaVerdad");
    const letras = currentAtoms.map((e) => e.letter);
    const t = tablaDeVerdad(rules.map((r) => r.formula), letras);
    if (!t) {
      const filas = letras.length <= 20 ? Math.pow(2, letras.length).toLocaleString("es-MX") : "2<sup>" + letras.length + "</sup>";
      caja.innerHTML = '<p class="tt-nota">Con ' + letras.length + " átomos serían " + filas +
        " filas, demasiadas para leerlas. La tabla se muestra hasta con " + TABLA_MAX_ATOMOS + " átomos.</p>";
      return;
    }
    const coincide = (t.modelos > 0) === (estadoDe(tree) === "ok");
    const encabezado = currentAtoms.map((e) => '<th scope="col">' + atomHtml(e) + "</th>").join("") +
      rules.map((r, i) => '<th scope="col" class="tt-regla"><span>R' + (i + 1) + "</span>" + fHtml(r.formula) + "</th>").join("") +
      '<th scope="col">Todas</th>';
    const celda = (v) => '<td class="' + (v ? "v" : "fa") + '">' + (v ? "V" : "F") + "</td>";
    const filas = t.filas.map((f) => '<tr' + (f.todas ? ' class="si"' : "") + ">" +
      f.valores.map(celda).join("") + f.reglas.map(celda).join("") + celda(f.todas) + "</tr>").join("");
    caja.innerHTML =
      '<p class="tt-nota"><b>' + plural(t.modelos, "fila hace", "filas hacen") + "</b> verdaderas todas las reglas, de " + t.filas.length + ". " +
      (coincide
        ? '<span class="good">✓ Coincide con el árbol.</span>'
        : '<span class="bad">✗ No coincide con el árbol: esto sería un error del motor.</span>') + "</p>" +
      '<div class="tt-scroll" tabindex="0" role="region" aria-label="Tabla de verdad"><table class="tt"><thead><tr>' + encabezado + "</tr></thead><tbody>" + filas + "</tbody></table></div>";
  }

  // ---------- editor: numeros de regla en el margen ----------
  function updateGutter() {
    let n = 0;
    gutter.innerHTML = entrada.value.split("\n").map((l) =>
      tieneTexto(limpiarRegla(l)) ? '<div class="r">R' + (++n) + "</div>" : "<div></div>"
    ).join("");
    gutter.scrollTop = entrada.scrollTop;
  }
  entrada.addEventListener("scroll", () => { gutter.scrollTop = entrada.scrollTop; });

  // ---------- orquesta todo ----------
  let currentTree = null;
  let currentAtoms = [];
  let modeloGrande = null; // resultado de buscarModelo cuando el arbol sale truncado
  function mostrarVacio(msg) {
    resultados.classList.remove("show");
    vacio.hidden = false;
    vacio.textContent = msg;
    editorMeta.textContent = "";
    arbol.innerHTML = "";
    vistaArbol = null;
    showStep(0);
    $("#stepCaption").textContent = "Aquí aparecerá el árbol semántico.";
    $("#modelos").innerHTML = "";
    $("#tablaVerdad").innerHTML = "";
    BOTONES_ARBOL.forEach((id) => { $(id).disabled = true; });
    cerrarTextoArbol();
    avisos.hidden = true;
  }

  // ---------- avisos: cosas que probablemente no se escribieron como se queria ----------
  const avisos = $("#avisos");
  function sinAcentos(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^(el|la|los|las|que)\s+/, "");
  }
  // dos textos que solo difieren en UNA palabra, y esa palabra comparte su raiz
  // (al menos 4 letras iguales al inicio, y solo cambia el final): "me mojo" / "me moje"
  function pareceOtraForma(x, y) {
    const A = x.split(" "), B = y.split(" ");
    if (A.length !== B.length || x === y) return false;
    const distintas = A.map((w, i) => [w, B[i]]).filter(([u, v]) => u !== v);
    if (distintas.length !== 1) return false;
    const [u, v] = distintas[0];
    if (/\d/.test(u) || /\d/.test(v)) return false; // "paso1" y "paso2" son cosas distintas, no otra forma
    let cp = 0;
    while (cp < u.length && cp < v.length && u[cp] === v[cp]) cp++;
    return cp >= 4 && cp >= Math.min(u.length, v.length) - 3;
  }
  function renderAvisos(rules, registry, ignoradas) {
    const lista = [];
    if (ignoradas) lista.push(plural(ignoradas, "línea no tiene", "líneas no tienen") + " ninguna palabra y no se tomó en cuenta.");
    rules.forEach((r, i) => {
      const t = r.text.trim();
      if (r.formulaMal) {
        lista.push("<b>R" + (i + 1) + "</b> parece una fórmula, pero no se pudo leer. Revisa los paréntesis y que cada operador tenga sus dos lados.");
      }
      const inicio = t.match(/^(si|cuando|siempre que)\s/i);
      if (inicio && r.formula.type !== "imp" && r.formula.type !== "iff") {
        lista.push("<b>R" + (i + 1) + "</b> empieza con «" + inicio[1].toLowerCase() + "», pero no encontré qué pasa entonces, así que se tomó como un hecho. " +
          "Separa las dos partes con una coma o con «entonces»: <q>" + escapeHtml(cap(inicio[1].toLowerCase())) + " …, entonces …</q>.");
      }
    });
    const vistos = new Map();
    for (const e of registry.list()) {
      if (/\bentonces\b/i.test(e.text)) {
        lista.push("<q>" + escapeHtml(e.text) + "</q> parece una condicional. Para que se lea así, empieza la regla con «si».");
      }
      const k = sinAcentos(e.text);
      const otro = vistos.get(k);
      if (otro) {
        lista.push("<q>" + escapeHtml(otro.text) + "</q> (" + letterHtml(otro.letter) + ") y <q>" + escapeHtml(e.text) + "</q> (" + letterHtml(e.letter) +
          ") casi son iguales, pero cuentan como átomos distintos. Escríbelos igual para que compartan letra.");
      } else vistos.set(k, e);
    }
    // la misma palabra en otra forma ("llueve" / "llueva", "estudiar" / "estudie"):
    // el motor compara palabras, no significados, asi que solo se avisa
    const atomosLista = registry.list();
    for (let i = 0; i < atomosLista.length; i++) {
      for (let j = i + 1; j < atomosLista.length; j++) {
        const a = atomosLista[i], b = atomosLista[j];
        if (pareceOtraForma(sinAcentos(a.text), sinAcentos(b.text))) {
          lista.push("<q>" + escapeHtml(a.text) + "</q> (" + letterHtml(a.letter) + ") y <q>" + escapeHtml(b.text) + "</q> (" + letterHtml(b.letter) +
            ") parecen la misma idea escrita en otra forma, pero el motor las toma como átomos distintos. Si son la misma, escríbelas igual.");
        }
      }
    }
    // pocos a la vez: una lista larga de avisos estorba mas de lo que ayuda
    const MAX_AVISOS = 4;
    const visibles = lista.slice(0, MAX_AVISOS);
    if (lista.length > MAX_AVISOS) visibles.push("Y " + plural(lista.length - MAX_AVISOS, "aviso más", "avisos más") + " parecidos.");
    avisos.innerHTML = visibles.map((a) => '<div class="warn"><span>' + a + "</span></div>").join("");
    avisos.hidden = !lista.length;
  }

  function analizar() {
    updateGutter();
    const texto = entrada.value;
    if (!texto.trim()) return mostrarVacio("Escribe tu base de conocimiento arriba para ver el análisis.");

    const { rules, registry, ignoradas } = parseKnowledgeBase(texto);
    if (!rules.length) return mostrarVacio("No se reconoció ninguna regla válida en el texto.");
    vacio.hidden = true;

    resetFormulaIds();
    const labeled = rules.map((r, i) => labelFormula(r.formula, "R" + (i + 1)));
    const tree = buildTableau(labeled);
    currentTree = tree;
    currentAtoms = registry.list();
    modeloGrande = tree.truncado ? buscarModelo(rules.map((r) => r.formula), currentAtoms.map((e) => e.letter)) : null;

    editorMeta.textContent = plural(rules.length, "regla", "reglas") + " · " + plural(currentAtoms.length, "átomo", "átomos");
    resultados.classList.add("show");
    renderVeredicto(tree, rules, registry);
    renderAtomos(registry);
    renderReglas(rules, registry);
    renderArbol(tree);
    renderModelos(tree, rules, registry);
    renderTabla(tree, rules);
    renderAvisos(rules, registry, ignoradas);
    hlKey = null;

    document.querySelectorAll("#ejemplos .chip").forEach((c) => c.classList.toggle("on", EJEMPLOS[c.dataset.i].texto === texto));
  }

  // ejemplos
  $("#ejemplos").innerHTML = EJEMPLOS.map((e, i) => '<button class="chip" type="button" data-i="' + i + '">' + e.nombre + "</button>").join("");
  $("#ejemplos").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    entrada.value = EJEMPLOS[chip.dataset.i].texto;
    analizar();
  });

  // ---------- historial: las ultimas bases escritas, para no perderlas al recargar ----------
  const CLAVE_HISTORIAL = "historial";
  const enMarco = window.self !== window.top; // las pruebas abren la pagina en un iframe: no deben ensuciarlo
  function leerHistorial() {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch (err) { return []; }
  }
  function escribirHistorial(lista) {
    try { localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(lista)); } catch (err) {}
    pintarHistorial(lista);
  }
  function pintarHistorial(lista) {
    const cont = $("#historial");
    cont.hidden = !lista.length;
    if (!lista.length) { cont.innerHTML = ""; return; }
    cont.innerHTML = '<span class="hist-etq">Recientes</span>' + lista.map((t, i) => {
      const lineas = t.split("\n").filter(tieneTexto);
      const primera = lineas[0].length > 30 ? lineas[0].slice(0, 30) + "…" : lineas[0];
      return '<button class="chip" type="button" data-n="' + i + '" title="' + escapeHtml(t) + '">' + escapeHtml(primera) +
        (lineas.length > 1 ? ' <span class="hist-n">+' + (lineas.length - 1) + "</span>" : "") + "</button>";
    }).join("") + '<button class="hist-borrar" type="button">Borrar</button>';
  }
  function recordar() {
    if (enMarco) return;
    const t = entrada.value.trim();
    if (!t || EJEMPLOS.some((e) => e.texto === t) || !parseKnowledgeBase(t).rules.length) return;
    escribirHistorial(agregarAHistorial(leerHistorial(), t));
  }
  $("#historial").addEventListener("click", (e) => {
    if (e.target.closest(".hist-borrar")) return escribirHistorial([]);
    const chip = e.target.closest(".chip");
    if (!chip) return;
    entrada.value = leerHistorial()[chip.dataset.n] || "";
    analizar();
  });
  window.addEventListener("pagehide", recordar); // si se recarga antes de que pase el tiempo de espera

  let inputT, recordarT;
  entrada.addEventListener("input", () => {
    updateGutter();
    clearTimeout(inputT); inputT = setTimeout(analizar, 220);
    clearTimeout(recordarT); recordarT = setTimeout(recordar, 1500);
  });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); irAResultado(); }
  });
  function irAResultado() { analizar(); recordar(); $("#resultado").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); }
  $("#btnAnalizar").addEventListener("click", irAResultado);
  $("#btnLimpiar").addEventListener("click", () => { entrada.value = ""; analizar(); entrada.focus(); });

  // compartir: la base de conocimiento viaja en la URL (?kb=...)
  const toast = $("#toast");
  let toastT;
  function avisar(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  // confirma en el propio boton (✓ + texto) y regresa a su texto original
  function confirmarBoton(btn, texto) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = "✓ " + texto;
    btn.classList.add("done");
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; btn.classList.remove("done"); }, 1600);
  }

  $("#btnCompartir").addEventListener("click", async (e) => {
    const url = new URL(location.href);
    url.hash = "";
    url.search = entrada.value.trim() ? "?kb=" + encodeURIComponent(entrada.value.trim()) : "";
    try {
      await navigator.clipboard.writeText(url.toString());
      confirmarBoton(e.currentTarget, "Copiado");
      avisar("Enlace copiado al portapapeles");
    } catch (err) {
      // sin permiso de portapapeles: se deja el enlace en la barra de direcciones para copiarlo a mano
      history.replaceState(null, "", url.toString());
      avisar("Copia el enlace desde la barra de direcciones");
    }
  });

  // onda que sale desde el punto donde se toca cualquier boton
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn, .chip, .pill-btn, .icon-btn, .nav-cta");
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

  // ---------- seccion "Cómo funciona" ----------
  const CONECTIVOS = [
    { sym: "∧", word: "«y» · «pero»", name: "Conjunción", ex: "p ∧ q" },
    { sym: "∨", word: "«o»", name: "Disyunción", ex: "p ∨ q" },
    { sym: "¬", word: "«no»", name: "Negación", ex: "¬p", not: true },
    { sym: "→", word: "«si… entonces»", name: "Condicional", ex: "p → q" },
    { sym: "↔", word: "«si y solo si»", name: "Bicondicional", ex: "p ↔ q" },
  ];
  $("#conectivos").innerHTML = CONECTIVOS.map((c, i) =>
    '<div class="conn reveal" style="--rd:' + (i * 0.07) + 's"><span class="sym' + (c.not ? " not" : "") + '">' + c.sym + "</span>" +
    '<div class="word">' + c.word + '</div><div class="name">' + c.name + '</div><div class="ex">' + metaHtml(c.ex) + "</div></div>"
  ).join("");

  // otras formas de decirlo que el parser tambien reconoce (ver motor.js)
  const TAMBIEN = [
    ["<b>Cuando</b> A, B", "A → B"], ["<b>Siempre que</b> A, B", "A → B"],
    ["A <b>si</b> B", "B → A"], ["A <b>solo si</b> B", "A → B"],
    ["A <b>a menos que</b> B", "¬B → A"], ["A <b>salvo que</b> B · <b>excepto si</b>", "¬B → A"],
    ["A<b>, entonces</b> B", "A → B"], ["A<b>;</b> B<b>;</b> C", "A ∧ B ∧ C"],
    ["<b>Ni</b> A <b>ni</b> B", "¬A ∧ ¬B"], ["<b>No es cierto que</b> A", "¬A"],
    ["A<b>,</b> B <b>y</b> C", "A ∧ B ∧ C"], ["<b>O</b> A <b>o</b> B", "A ∨ B"],
    ["A <b>es condición suficiente para</b> B", "A → B"], ["A <b>es condición necesaria para</b> B", "B → A"],
    ["<b>Basta que</b> A <b>para que</b> B", "A → B"], ["<b>Es necesario que</b> A <b>para que</b> B", "B → A"],
    ["A <b>implica</b> B", "A → B"], ["A <b>equivale a</b> B", "A ↔ B"],
    ["A <b>aunque</b> B · <b>sin embargo</b>", "A ∧ B"], ["<b>No es cierto que</b> A <b>y</b> B", "¬(A ∧ B)"],
  ];
  $("#tambien").innerHTML = TAMBIEN.map(([frase, f]) =>
    '<div class="also-item"><span class="frase">' + frase + "</span>" + metaHtml(f) + "</div>"
  ).join("");

  const ALFA = [["A ∧ B", ["A", "B"]], ["¬(A ∨ B)", ["¬A", "¬B"]], ["¬(A → B)", ["A", "¬B"]], ["¬¬A", ["A"]]];
  const BETA = [
    ["A ∨ B", [["A"], ["B"]]], ["A → B", [["¬A"], ["B"]]], ["A ↔ B", [["A", "B"], ["¬A", "¬B"]]],
    ["¬(A ∧ B)", [["¬A"], ["¬B"]]], ["¬(A ↔ B)", [["A", "¬B"], ["¬A", "B"]]],
  ];
  $("#refAlpha").innerHTML = ALFA.map(([from, to]) =>
    '<div class="ref"><span class="from">' + metaHtml(from) + '</span><span class="yields">⟹</span><span class="to">' +
    to.map(metaHtml).join('<span class="split">,</span>') + "</span></div>"
  ).join("");
  $("#refBeta").innerHTML = BETA.map(([from, ramas]) =>
    '<div class="ref"><span class="from">' + metaHtml(from) + '</span><span class="yields">⟹</span><span class="to">' +
    ramas.map((r) => '<span class="box">' + r.map(metaHtml).join('<span class="tok op sep">,</span>') + "</span>").join('<span class="split">|</span>') + "</span></div>"
  ).join("");

  // ---------- animaciones de scroll ----------
  const revealIO = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { en.target.classList.add("in"); revealIO.unobserve(en.target); }
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".reveal").forEach((el) => revealIO.observe(el));

  // el arbol se reproduce solo la primera vez que entra en pantalla
  let autoplayed = false;
  new IntersectionObserver((entries, io) => {
    if (entries[0].isIntersecting && !autoplayed && totalPasos() && !reduceMotion) {
      autoplayed = true;
      io.disconnect();
      if (totalPasos() <= 120) setTimeout(() => play(650), 500); // uno enorme tardaria minutos: se deja completo
    }
  }, { threshold: 0.35 }).observe($(".tree-card"));

  // barra de navegacion: borde al hacer scroll y enlace activo segun la seccion visible
  const nav = $("#nav");
  const links = Array.from(document.querySelectorAll(".nav-links a"));
  const navIO = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((a) => { const s = document.querySelector(a.getAttribute("href")); if (s) navIO.observe(s); });

  // portada: el texto se aleja suavemente al bajar (parallax); y la barra de progreso de lectura
  const heroContent = $("#heroContent");
  const scrollProgress = $("#scrollProgress");
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress.style.setProperty("--p", max > 0 ? Math.min(1, y / max) : 0);
      nav.classList.toggle("scrolled", y > 8);
      if (!reduceMotion && y < window.innerHeight) {
        const k = y / window.innerHeight;
        heroContent.style.transform = "translateY(" + (y * 0.3) + "px) scale(" + (1 - k * 0.06) + ")";
        heroContent.style.opacity = String(Math.max(0, 1 - k * 1.4));
      }
      ticking = false;
    });
  }, { passive: true });

  iniciarTema($("#btnTema"));

  // ---------- imprimir / PDF: el arbol completo y a lo ancho de la hoja ----------
  let zoomPantalla = 1;
  window.addEventListener("beforeprint", () => {
    pause();
    showStep(totalPasos());
    zoomPantalla = zoom;
    arbol.style.setProperty("--zoom", 1);
    const w = arbol.firstElementChild ? arbol.firstElementChild.offsetWidth : 0;
    setZoom(w > 680 ? 680 / w : 1);
  });
  window.addEventListener("afterprint", () => setZoom(zoomPantalla));
  $("#btnImprimir").addEventListener("click", () => window.print());

  // estado inicial: lo que venga en la URL, lo ultimo que se escribio, o el ejemplo
  const kb = new URLSearchParams(location.search).get("kb");
  const recientes = leerHistorial();
  pintarHistorial(recientes);
  entrada.value = kb || recientes[0] || EJEMPLOS[0].texto;
  analizar();
});
