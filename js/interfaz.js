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

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

  // ---------- formulas con estilo ----------
  // "p2" -> p con subindice 2
  function letterHtml(letter) {
    const m = letter.match(/^([a-z])(\d+)$/);
    return m ? m[1] + "<sub>" + m[2] + "</sub>" : letter;
  }
  function atomHtml(entry) {
    return '<span class="tok atom c' + (entry.index % 8) + '" data-atom="' + escapeHtml(entry.key) +
      '" title="' + escapeHtml(entry.letter + " = " + cap(entry.text)) + '">' + letterHtml(entry.letter) + "</span>";
  }
  function tokenHtml(tok) {
    if (tok.t === "atom") return atomHtml(tok.entry);
    if (tok.t === "paren") return '<span class="tok paren">' + tok.v + "</span>";
    return '<span class="tok op ' + tok.kind + '">' + tok.v + "</span>";
  }
  function fHtml(formula) {
    return '<span class="f">' + formulaToTokens(formula).map(tokenHtml).join("") + "</span>";
  }

  // formulas de referencia escritas a mano ("¬(A ∨ B)"), para la seccion "Cómo funciona"
  const OP_KIND = { "∧": "and", "∨": "or", "→": "imp", "↔": "iff", "¬": "not" };
  function metaHtml(str) {
    let out = "";
    for (const ch of str) {
      if (ch === " ") continue;
      if (OP_KIND[ch]) out += '<span class="tok op ' + OP_KIND[ch] + '">' + ch + "</span>";
      else if (ch === "(" || ch === ")") out += '<span class="tok paren">' + ch + "</span>";
      else if ("pqr".includes(ch)) out += '<span class="tok atom c' + "pqr".indexOf(ch) + '">' + ch + "</span>";
      else out += '<span class="tok atom meta">' + ch + "</span>";
    }
    return '<span class="f">' + out + "</span>";
  }

  // ---------- texto de la regla con cada proposicion resaltada en su color ----------
  function ruleTextHtml(text, atoms) {
    const byKey = new Map(atoms.map((e) => [e.key, e]));
    // cada vocal acepta su version con o sin tilde, igual que atomKey en el motor
    const VOCAL = { a: "[aáàä]", e: "[eéèë]", i: "[iíìï]", o: "[oóòö]", u: "[uúùü]" };
    const sinTilde = (s) => s.normalize("NFD").replace(/[̀́̈]/g, "").normalize("NFC");
    const alts = atoms.slice().sort((a, b) => b.text.length - a.text.length)
      .map((e) => escapeRe(sinTilde(e.text)).replace(/[aeiou]/gi, (v) => VOCAL[v.toLowerCase()]).replace(/\s+/g, "\\s+")).join("|");
    const conectores = "es condici[oó]n necesaria y suficiente para|es condici[oó]n suficiente para|es condici[oó]n necesaria para|" +
      "si y solo si|s[oó]lo si|[uú]nicamente si|siempre que|a menos que|no es cierto que|no es verdad que|es falso que|" +
      "basta que|es necesario que|para que|equivale a|implica|sin embargo|no obstante|aunque|o bien|" +
      "cuando|si|entonces|no|ni|pero|y|o";
    const re = new RegExp("(?<![\\p{L}\\p{N}])(?:(" + alts + ")|(" + conectores + "))(?![\\p{L}\\p{N}])", "giu");
    let out = "", last = 0, m;
    while ((m = re.exec(text))) {
      out += escapeHtml(text.slice(last, m.index));
      if (m[1]) {
        const e = byKey.get(atomKey(m[1]));
        out += e
          ? '<span class="ph" style="--c:var(--a' + (e.index % 8) + ')" data-atom="' + escapeHtml(e.key) + '">' + escapeHtml(m[1]) + "</span>"
          : escapeHtml(m[1]);
      } else {
        out += '<span class="kw">' + escapeHtml(m[2]) + "</span>";
      }
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  }

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
    $("#tbodyAtomos").innerHTML = registry.list().map((e, i) =>
      '<div class="atom-card" style="--i:' + i + ";--c:var(--a" + (e.index % 8) + ')" data-atom="' + escapeHtml(e.key) + '">' +
        atomHtml(e) +
        '<div class="meaning">' + escapeHtml(cap(e.text)) + "<small>Proposición simple</small></div>" +
      "</div>"
    ).join("");
  }

  // ---------- Pieza 1: reglas y formulas ----------
  function renderReglas(rules, registry) {
    const atoms = registry.list();
    $("#listaReglas").innerHTML = rules.map((r, i) =>
      '<div class="rule" style="--i:' + i + '">' +
        '<span class="rule-id">R' + (i + 1) + "</span>" +
        '<span class="rule-text">' + ruleTextHtml(r.text, atoms) + "</span>" +
        '<span class="rule-formula"><span class="arrow" aria-hidden="true">→</span>' + fHtml(r.formula) + "</span>" +
      "</div>"
    ).join("");
  }

  // ---------- Pieza 3: veredicto y numeros ----------
  function countLeaves(node, acc) {
    acc = acc || { open: 0, closed: 0 };
    if (node.open) acc.open++;
    else if (node.closed) acc.closed++;
    for (const c of (node.children || [])) countLeaves(c, acc);
    return acc;
  }

  let lastVerdict = null;
  function renderVeredicto(tree, rules, registry) {
    const el = $("#veredicto");
    const cerrado = allClosed(tree);
    const { open, closed } = countLeaves(tree);
    const n = rules.length;
    el.className = "verdict reveal in " + (cerrado ? "bad" : "ok");
    el.innerHTML = cerrado
      ? '<div class="v-icon">✗</div><p class="v-kicker">La base de conocimiento es</p><h3 class="v-title">Inconsistente.</h3>' +
        '<p class="v-text">' + (closed === 1 ? "La única rama se cierra" : "Las " + closed + " ramas se cierran") +
        ": no existe ninguna asignación de valores que haga verdaderas las " + plural(n, "regla", "reglas") + " a la vez.</p>"
      : '<div class="v-icon">✓</div><p class="v-kicker">La base de conocimiento es</p><h3 class="v-title">Consistente.</h3>' +
        '<p class="v-text">' + (open === 1 ? "Queda una rama abierta" : "Quedan " + open + " ramas abiertas") +
        ": existe al menos una asignación de valores que hace verdaderas las " + plural(n, "regla", "reglas") + ".</p>";
    const key = cerrado ? "bad" : "ok";
    if (key !== lastVerdict) { el.classList.add("pop"); lastVerdict = key; }

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
    countTo(stats.querySelector('[data-k="abiertas"]'), open);
    countTo(stats.querySelector('[data-k="cerradas"]'), closed);
  }

  // ---------- Pieza 3: dibujo del arbol + reproduccion paso a paso ----------
  let steps = [];       // en orden: lineas (por id) y hojas (despues de la ultima linea de su rama)
  let nodeLis = [];     // { li, first } para ocultar cada rama hasta que aparece su primera linea
  let checks = [];      // { el, at } la palomita de "aplicada" sale cuando se usa por primera vez
  let stepIndex = 0;
  let openCounter = 0;

  function modelHtml(model) {
    return model.length
      ? model.map(([l, v]) => {
          const e = currentAtoms.find((a) => a.letter === l);
          return (v === "V" ? "" : '<span class="tok op not">¬</span>') + (e ? atomHtml(e) : l);
        }).join('<span class="tok op sep">,</span>')
      : "cualquier valor";
  }

  function renderNodeLi(node, parentMax) {
    const li = document.createElement("li");
    const box = document.createElement("div");
    box.className = "node-box";
    let maxId = parentMax;
    for (const line of node.lines) {
      const row = document.createElement("div");
      row.className = "fline";
      row.dataset.id = line.id;
      const origin = line.fromId
        ? '<span class="k">' + line.kind + "</span> " + line.rule + " · L" + line.fromId
        : '<span class="k">' + escapeHtml(line.origin) + "</span>";
      row.innerHTML =
        '<span class="fid">L' + line.id + "</span>" + fHtml(line.formula) +
        '<span class="fcheck" title="Fórmula ya aplicada">✓</span>' +
        '<span class="forigin">' + origin + "</span>";
      const ck = row.querySelector(".fcheck");
      if (!line.applied) ck.remove();
      else checks.push({ el: ck, id: line.id, at: Infinity });
      box.appendChild(row);
      steps.push({ kind: "line", order: line.id, el: row, line });
      maxId = Math.max(maxId, line.id);
    }
    li.appendChild(box);
    nodeLis.push({ li, first: node.lines.length ? node.lines[0].id : parentMax });

    if (node.closed || node.open) {
      const leaf = document.createElement("div");
      if (node.closed) {
        const e = currentAtoms.find((a) => a.letter === node.closedInfo.letter);
        const a = e ? atomHtml(e) : node.closedInfo.letter;
        leaf.className = "leaf closed";
        leaf.innerHTML = '<span class="mark">✗</span>Rama cerrada<span class="sub"><span class="f">' + a +
          '<span class="tok op word">y</span><span class="tok op not">¬</span>' + a + "</span></span>";
      } else {
        node.num = ++openCounter;
        leaf.className = "leaf open";
        leaf.innerHTML = '<span class="mark">✓</span>Rama abierta ' + node.num +
          '<span class="sub"><span class="f">' + modelHtml(node.model) + "</span></span>";
      }
      li.appendChild(leaf);
      steps.push({ kind: "leaf", order: maxId + 0.5, el: leaf, node });
    } else if (node.children && node.children.length) {
      const ul = document.createElement("ul");
      for (const child of node.children) ul.appendChild(renderNodeLi(child, maxId));
      li.appendChild(ul);
    }
    return li;
  }

  function renderArbol(tree) {
    steps = []; nodeLis = []; checks = []; openCounter = 0;
    arbol.innerHTML = "";
    arbol.appendChild(renderNodeLi(tree, 0));
    steps.sort((a, b) => a.order - b.order);
    // cuando se usa por primera vez cada formula (para su palomita)
    const checkById = new Map(checks.map((c) => [c.id, c]));
    for (const s of steps) {
      if (s.kind !== "line" || !s.line.fromId) continue;
      const c = checkById.get(s.line.fromId);
      if (c) c.at = Math.min(c.at, s.order);
    }
    pause();
    showStep(steps.length);
    fitTree();
  }

  function captionFor(k) {
    const total = steps.length;
    if (k === 0) return '<span class="step-n">0 / ' + total + "</span> Presiona reproducir para construir el árbol desde el tronco.";
    if (k === total) {
      const { open, closed } = countLeaves(currentTree);
      return '<span class="step-n">' + total + " / " + total + "</span> Árbol terminado: " +
        '<b class="good">' + plural(open, "rama abierta", "ramas abiertas") + "</b> y " +
        '<b class="bad">' + plural(closed, "cerrada", "cerradas") + "</b>.";
    }
    const s = steps[k - 1];
    const n = '<span class="step-n">' + k + " / " + total + "</span> ";
    if (s.kind === "leaf") {
      return s.node.closed
        ? n + '<b class="bad">✗ Se cierra la rama</b>: contiene un átomo y su negación.'
        : n + '<b class="good">✓ Rama abierta ' + s.node.num + "</b>: solo quedan letras sin contradicción.";
    }
    const l = s.line;
    if (!l.fromId) return n + "Premisa <b>" + escapeHtml(l.origin) + "</b>, se supone verdadera: " + fHtml(l.formula);
    return n + "Regla <b>" + l.kind + " (" + l.rule + ")</b> sobre L" + l.fromId +
      (l.kind === "β" ? ", abre una rama: " : ", se agrega a la rama: ") + fHtml(l.formula);
  }

  function showStep(k) {
    stepIndex = Math.max(0, Math.min(k, steps.length));
    const cur = stepIndex > 0 ? steps[stepIndex - 1].order : 0;
    const playingView = stepIndex < steps.length;
    for (const s of steps) {
      s.el.classList.toggle("pend", s.order > cur);
      s.el.classList.remove("current", "source");
    }
    for (const n of nodeLis) n.li.classList.toggle("pend", n.first > cur);
    // el conector vertical hacia las ramas solo aparece cuando sale la primera rama
    arbol.querySelectorAll("ul").forEach((ul) => ul.classList.toggle("pend", ul.firstElementChild.classList.contains("pend")));
    for (const c of checks) c.el.classList.toggle("pend", c.at > cur);

    if (playingView && stepIndex > 0) {
      const s = steps[stepIndex - 1];
      s.el.classList.add("current");
      if (s.kind === "line" && s.line.fromId) {
        const src = arbol.querySelector('.fline[data-id="' + s.line.fromId + '"]');
        if (src) src.classList.add("source");
      }
      scrollTreeTo(s.el);
    }
    // el numero de paso queda aparte; el resto va junto para que se acomode como un solo texto
    $("#stepCaption").innerHTML = captionFor(stepIndex).replace(/^(<span class="step-n">[^<]*<\/span>) ?(.*)$/s, '$1<span class="step-text">$2</span>');
    $("#progressBar").style.width = (steps.length ? (stepIndex / steps.length) * 100 : 0) + "%";
    $("#btnPrev").disabled = stepIndex === 0;
    $("#btnNext").disabled = stepIndex === steps.length;
  }

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
    if (stepIndex >= steps.length) showStep(0);
    btnPlay.classList.add("playing");
    btnPlay.setAttribute("aria-label", "Pausar");
    clearInterval(timer);
    timer = setInterval(() => {
      showStep(stepIndex + 1);
      if (stepIndex >= steps.length) pause(); // al llegar al final el boton vuelve a "reproducir" de inmediato
    }, speed || 950);
  }
  function pause() {
    clearInterval(timer); timer = null;
    btnPlay.classList.remove("playing");
    btnPlay.setAttribute("aria-label", "Reproducir");
  }
  btnPlay.addEventListener("click", () => (timer ? pause() : play()));
  $("#btnPrev").addEventListener("click", () => { pause(); showStep(stepIndex - 1); });
  $("#btnNext").addEventListener("click", () => { pause(); showStep(stepIndex + 1); });
  $("#btnTodo").addEventListener("click", () => { pause(); showStep(steps.length); });

  // atajos de teclado mientras el arbol esta en pantalla: ← → pasos, espacio reproduce
  let treeVisible = false;
  new IntersectionObserver((en) => { treeVisible = en[0].isIntersecting; }, { threshold: 0.25 }).observe($(".tree-card"));
  document.addEventListener("keydown", (e) => {
    if (!treeVisible || e.ctrlKey || e.metaKey || e.altKey || !steps.length) return;
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
    (function walk(n) { if (n.open) leaves.push(n); (n.children || []).forEach(walk); })(tree);

    if (!leaves.length) {
      cont.innerHTML =
        '<div class="model model-empty"><div class="v-icon" style="margin:0 auto 14px;background:var(--bad-soft);color:var(--bad);box-shadow:inset 0 0 0 1.5px var(--bad-border)">✗</div>' +
        "<h3>Ninguna rama queda abierta.</h3><p>Todas las ramas se cierran, así que la base de conocimiento es " +
        '<b style="color:var(--bad)">inconsistente</b>: no hay forma de que todas las reglas sean verdaderas al mismo tiempo.</p></div>';
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
      return '<div class="model" style="--i:' + i + '">' +
        '<div class="model-head"><h3>Rama abierta ' + leaf.num + '</h3><span class="badge good">' + escapeHtml(plain) + "</span></div>" +
        '<div class="assign">' + tiles + "</div>" +
        '<div class="checks">' + ok + "</div>" +
      "</div>";
    }).join("");
  }

  // ---------- editor: numeros de regla en el margen ----------
  function updateGutter() {
    let n = 0;
    gutter.innerHTML = entrada.value.split("\n").map((l) =>
      l.trim() ? '<div class="r">R' + (++n) + "</div>" : "<div></div>"
    ).join("");
    gutter.scrollTop = entrada.scrollTop;
  }
  entrada.addEventListener("scroll", () => { gutter.scrollTop = entrada.scrollTop; });

  // ---------- orquesta todo ----------
  let currentTree = null;
  let currentAtoms = [];
  function mostrarVacio(msg) {
    resultados.classList.remove("show");
    vacio.hidden = false;
    vacio.textContent = msg;
    editorMeta.textContent = "";
    arbol.innerHTML = "";
    steps = [];
    showStep(0);
    $("#stepCaption").textContent = "Aquí aparecerá el árbol semántico.";
    $("#modelos").innerHTML = "";
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
    let cp = 0;
    while (cp < u.length && cp < v.length && u[cp] === v[cp]) cp++;
    return cp >= 4 && cp >= Math.min(u.length, v.length) - 3;
  }
  function renderAvisos(rules, registry) {
    const lista = [];
    rules.forEach((r, i) => {
      const t = r.text.trim();
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
    avisos.innerHTML = lista.map((a) => '<div class="warn"><span>' + a + "</span></div>").join("");
    avisos.hidden = !lista.length;
  }

  function analizar() {
    updateGutter();
    const texto = entrada.value;
    if (!texto.trim()) return mostrarVacio("Escribe tu base de conocimiento arriba para ver el análisis.");

    const { rules, registry } = parseKnowledgeBase(texto);
    if (!rules.length) return mostrarVacio("No se reconoció ninguna regla válida en el texto.");
    vacio.hidden = true;

    resetFormulaIds();
    const labeled = rules.map((r, i) => labelFormula(r.formula, "R" + (i + 1)));
    const tree = buildTableau(labeled);
    currentTree = tree;
    currentAtoms = registry.list();

    editorMeta.textContent = plural(rules.length, "regla", "reglas") + " · " + plural(currentAtoms.length, "átomo", "átomos");
    resultados.classList.add("show");
    renderVeredicto(tree, rules, registry);
    renderAtomos(registry);
    renderReglas(rules, registry);
    renderArbol(tree);
    renderModelos(tree, rules, registry);
    renderAvisos(rules, registry);
    hlKey = null;

    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", EJEMPLOS[c.dataset.i].texto === texto));
  }

  // ejemplos
  $("#ejemplos").innerHTML = EJEMPLOS.map((e, i) => '<button class="chip" type="button" data-i="' + i + '">' + e.nombre + "</button>").join("");
  $("#ejemplos").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    entrada.value = EJEMPLOS[chip.dataset.i].texto;
    analizar();
  });

  let inputT;
  entrada.addEventListener("input", () => { updateGutter(); clearTimeout(inputT); inputT = setTimeout(analizar, 220); });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); irAResultado(); }
  });
  function irAResultado() { analizar(); $("#resultado").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); }
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
    ["A <b>a menos que</b> B", "¬B → A"], ["A<b>, entonces</b> B", "A → B"],
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
    if (entries[0].isIntersecting && !autoplayed && steps.length && !reduceMotion) {
      autoplayed = true;
      io.disconnect();
      setTimeout(() => play(650), 500);
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

  // ---------- tema claro / oscuro ----------
  // El <head> ya puso data-theme antes de pintar; aqui solo se cambia y se recuerda.
  const raiz = document.documentElement;
  const btnTema = $("#btnTema");
  // el tema elegido se guarda aqui al instante: la animacion aplica el cambio un
  // momento despues, y si se pulsa dos veces seguidas la segunda debe partir de
  // lo que ya se eligio, no de lo que todavia se ve
  let tema = raiz.dataset.theme === "light" ? "light" : "dark";
  let transicion = null;
  // pinta siempre el ultimo tema elegido (aunque la llamada llegue tarde)
  function pintarTema() {
    raiz.dataset.theme = tema;
    $("#themeColor").content = tema === "light" ? "#fbfbfd" : "#000000";
    btnTema.setAttribute("aria-label", tema === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
  }
  function aplicarTema(t) { tema = t; pintarTema(); }
  pintarTema();
  btnTema.addEventListener("click", () => {
    const sig = tema === "light" ? "dark" : "light";
    tema = sig;
    try { localStorage.setItem("tema", sig); } catch (err) {}
    // si todavia va la animacion anterior, se termina y el cambio se aplica directo
    if (transicion) { transicion.skipTransition(); pintarTema(); return; }
    // el nuevo tema aparece como un circulo que crece desde el boton
    const r = btnTema.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    raiz.style.setProperty("--tx", x + "px");
    raiz.style.setProperty("--ty", y + "px");
    raiz.style.setProperty("--tr", Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + "px");
    if (document.startViewTransition && !reduceMotion && !document.hidden) {
      const vt = document.startViewTransition(pintarTema);
      transicion = vt;
      // si la animacion se cancela (otro clic, pestaña oculta) el tema igual se
      // aplica; ese aviso del navegador se ignora en lugar de salir como error
      // (pintarTema se puede llamar de mas sin problema: siempre pinta el mismo tema)
      vt.ready.catch(pintarTema);
      vt.updateCallbackDone.catch(pintarTema);
      vt.finished.catch(pintarTema).then(() => { pintarTema(); if (transicion === vt) transicion = null; });
      // red de seguridad: si el navegador no llega a pintar (pestaña en segundo
      // plano, equipo muy lento), a los 400 ms se omite la animacion y se aplica
      setTimeout(() => {
        if (raiz.dataset.theme !== tema) { vt.skipTransition(); pintarTema(); }
      }, 400);
    } else aplicarTema(sig);
  });
  // si la persona nunca eligio, se sigue al sistema cuando este cambia
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    let elegido = null;
    try { elegido = localStorage.getItem("tema"); } catch (err) {}
    if (!elegido) aplicarTema(e.matches ? "light" : "dark");
  });

  // ---------- imprimir / PDF: el arbol completo y a lo ancho de la hoja ----------
  let zoomPantalla = 1;
  window.addEventListener("beforeprint", () => {
    pause();
    showStep(steps.length);
    zoomPantalla = zoom;
    arbol.style.setProperty("--zoom", 1);
    const w = arbol.firstElementChild ? arbol.firstElementChild.offsetWidth : 0;
    setZoom(w > 680 ? 680 / w : 1);
  });
  window.addEventListener("afterprint", () => setZoom(zoomPantalla));
  $("#btnImprimir").addEventListener("click", () => window.print());

  // estado inicial: lo que venga en la URL, o el ejemplo de la profesora ya resuelto
  const kb = new URLSearchParams(location.search).get("kb");
  entrada.value = kb || EJEMPLOS[0].texto;
  analizar();
});
