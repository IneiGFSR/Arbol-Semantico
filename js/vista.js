/* =====================================================================
   vista.js — lo que comparten la herramienta y el tutorial
   Convierte lo que calcula motor.js en HTML: formulas con estilo, el
   arbol con sus pasos, su version en texto y su version en imagen.
   Se carga despues de motor.js y antes de interfaz.js / tutorial.js.
   ===================================================================== */

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
// el aria-label hace que un lector de pantalla lea "p implica no q", no los simbolos
function fHtml(formula) {
  return '<span class="f" role="img" aria-label="' + escapeHtml(formulaHablada(formula)) + '">' +
    formulaToTokens(formula).map(tokenHtml).join("") + "</span>";
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
const CONECTORES_TEXTO = "es condici[oó]n necesaria y suficiente para|es condici[oó]n suficiente para|es condici[oó]n necesaria para|" +
  "si y solo si|s[oó]lo si|[uú]nicamente si|siempre y cuando|siempre que|a menos que|a no ser que|salvo que|salvo si|" +
  "excepto que|excepto si|excepto cuando|no es cierto que|no es verdad que|es falso que|" +
  "basta que|es necesario que|para que|equivale a|implica|sin embargo|no obstante|aunque|o bien|" +
  "cuando|si|entonces|no|ni|pero|y|o";

function ruleTextHtml(text, atoms) {
  const conTexto = atoms.filter((e) => !e.directa && e.text);
  const byKey = new Map(conTexto.map((e) => [e.key, e]));
  // cada vocal acepta su version con o sin tilde, igual que atomKey en el motor
  const VOCAL = { a: "[aáàä]", e: "[eéèë]", i: "[iíìï]", o: "[oóòö]", u: "[uúùü]" };
  const sinTilde = (s) => s.normalize("NFD").replace(/[̀́̈]/g, "").normalize("NFC");
  const alts = conTexto.slice().sort((a, b) => b.text.length - a.text.length)
    .map((e) => escapeRe(sinTilde(e.text)).replace(/[aeiou]/gi, (v) => VOCAL[v.toLowerCase()]).replace(/\s+/g, "\\s+")).join("|");
  const re = new RegExp("(?<![\\p{L}\\p{N}])(?:(" + (alts || "(?!)") + ")|(" + CONECTORES_TEXTO + "))(?![\\p{L}\\p{N}])", "giu");
  let out = "", last = 0, m;
  while ((m = re.exec(text))) {
    if (!m[0]) { re.lastIndex++; continue; } // un resultado vacio no debe dejar el ciclo girando
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

// una tarjeta de la tabla de atomos
function atomoCardHtml(e, i) {
  return '<div class="atom-card" style="--i:' + Math.min(i, 12) + ";--c:var(--a" + (e.index % 8) + ')" data-atom="' + escapeHtml(e.key) + '">' +
    atomHtml(e) +
    '<div class="meaning">' + (e.directa ? "Letra escrita directamente" : escapeHtml(cap(e.text))) +
    "<small>Proposición simple</small></div></div>";
}

function contarHojas(node, acc) {
  acc = acc || { open: 0, closed: 0 };
  if (node.open) acc.open++;
  else if (node.closed) acc.closed++;
  for (const c of (node.children || [])) contarHojas(c, acc);
  return acc;
}

function modelHtml(model, atoms) {
  return model.length
    ? model.map(([l, v]) => {
        const e = atoms.find((a) => a.letter === l);
        return (v === "V" ? "" : '<span class="tok op not">¬</span>') + (e ? atomHtml(e) : l);
      }).join('<span class="tok op sep">,</span>')
    : "cualquier valor";
}

// "L3 (R3)" o, si las dos lineas vienen de la misma regla, se dice una sola vez
function trazaCierre(info) {
  const { pos, neg } = info;
  return pos.raiz === neg.raiz
    ? "L" + pos.id + " y L" + neg.id + " · ambas de " + pos.raiz
    : "L" + pos.id + " (" + pos.raiz + ") y L" + neg.id + " (" + neg.raiz + ")";
}

/* ---------------------------------------------------------------------
   Arbol con pasos. construirArbol llena el <ul> y regresa una "vista" con
   los pasos en orden; mostrarPasoArbol enseña solo los k primeros.
   --------------------------------------------------------------------- */
function construirArbol(ul, tree, atoms) {
  const v = { ul, tree, atoms, steps: [], nodeLis: [], checks: [] };
  let abiertas = 0;

  function nodoLi(node, parentMax) {
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
      else v.checks.push({ el: ck, id: line.id, at: Infinity });
      box.appendChild(row);
      v.steps.push({ kind: "line", order: line.id, el: row, line });
      maxId = Math.max(maxId, line.id);
    }
    li.appendChild(box);
    v.nodeLis.push({ li, first: node.lines.length ? node.lines[0].id : parentMax });

    if (node.closed || node.open) {
      const leaf = document.createElement("div");
      if (node.closed) {
        const e = atoms.find((a) => a.letter === node.closedInfo.letter);
        const a = e ? atomHtml(e) : node.closedInfo.letter;
        leaf.className = "leaf closed";
        leaf.innerHTML = '<span class="mark">✗</span>Rama cerrada<span class="sub"><span class="f">' + a +
          '<span class="tok op word">y</span><span class="tok op not">¬</span>' + a + "</span></span>" +
          '<span class="traza">' + escapeHtml(trazaCierre(node.closedInfo)) + "</span>";
      } else {
        node.num = ++abiertas;
        leaf.className = "leaf open";
        leaf.innerHTML = '<span class="mark">✓</span>Rama abierta ' + node.num +
          '<span class="sub"><span class="f">' + modelHtml(node.model, atoms) + "</span></span>";
      }
      li.appendChild(leaf);
      v.steps.push({ kind: "leaf", order: maxId + 0.5, el: leaf, node });
    } else if (node.children && node.children.length) {
      const hijos = document.createElement("ul");
      for (const child of node.children) hijos.appendChild(nodoLi(child, maxId));
      li.appendChild(hijos);
    }
    return li;
  }

  ul.innerHTML = "";
  ul.appendChild(nodoLi(tree, 0));
  v.steps.sort((a, b) => a.order - b.order);
  // cuando se usa por primera vez cada formula (para su palomita)
  const checkById = new Map(v.checks.map((c) => [c.id, c]));
  for (const s of v.steps) {
    if (s.kind !== "line" || !s.line.fromId) continue;
    const c = checkById.get(s.line.fromId);
    if (c) c.at = Math.min(c.at, s.order);
  }
  return v;
}

// enseña los k primeros pasos; regresa el elemento del paso actual (o null)
function mostrarPasoArbol(v, k) {
  const cur = k > 0 ? v.steps[k - 1].order : 0;
  for (const s of v.steps) {
    s.el.classList.toggle("pend", s.order > cur);
    s.el.classList.remove("current", "source", "conflict");
  }
  for (const n of v.nodeLis) n.li.classList.toggle("pend", n.first > cur);
  // el conector vertical hacia las ramas solo aparece cuando sale la primera rama
  v.ul.querySelectorAll("ul").forEach((ul) => ul.classList.toggle("pend", ul.firstElementChild.classList.contains("pend")));
  for (const c of v.checks) c.el.classList.toggle("pend", c.at > cur);
  v.ul.querySelectorAll(".conflict, .source").forEach((el) => el.classList.remove("conflict", "source"));

  if (k === 0 || k >= v.steps.length) return null;
  const s = v.steps[k - 1];
  s.el.classList.add("current");
  const marcar = (id, cls) => {
    const el = v.ul.querySelector('.fline[data-id="' + id + '"]');
    if (el) el.classList.add(cls);
  };
  if (s.kind === "line" && s.line.fromId) marcar(s.line.fromId, "source");
  if (s.kind === "leaf" && s.node.closed) { // al cerrar, se iluminan las dos lineas que chocan
    marcar(s.node.closedInfo.pos.id, "conflict");
    marcar(s.node.closedInfo.neg.id, "conflict");
  }
  return s.el;
}

// la explicacion del paso k, en HTML
function textoPasoArbol(v, k) {
  const total = v.steps.length;
  const num = '<span class="step-n">' + k + " / " + total + "</span>";
  const texto = (html) => num + '<span class="step-text">' + html + "</span>";
  if (k === 0) return texto("Presiona reproducir para construir el árbol desde el tronco.");
  if (k >= total) {
    const { open, closed } = contarHojas(v.tree);
    return texto("Árbol terminado: " + '<b class="good">' + plural(open, "rama abierta", "ramas abiertas") + "</b> y " +
      '<b class="bad">' + plural(closed, "cerrada", "cerradas") + "</b>.");
  }
  const s = v.steps[k - 1];
  if (s.kind === "leaf") {
    if (s.node.open) return texto('<b class="good">✓ Rama abierta ' + s.node.num + "</b>: solo quedan letras sin contradicción.");
    const { pos, neg } = s.node.closedInfo;
    return texto('<b class="bad">✗ Se cierra la rama</b>: ' + fHtml(pos.formula) + " en L" + pos.id + " (viene de " + escapeHtml(pos.raiz) +
      ") contradice a " + fHtml(neg.formula) + " en L" + neg.id + " (viene de " + escapeHtml(neg.raiz) + ").");
  }
  const l = s.line;
  if (!l.fromId) return texto("Premisa <b>" + escapeHtml(l.origin) + "</b>, se supone verdadera: " + fHtml(l.formula));
  return texto("Regla <b>" + l.kind + " (" + l.rule + ")</b> sobre L" + l.fromId +
    (l.kind === "β" ? ", abre una rama: " : ", se agrega a la rama: ") + fHtml(l.formula));
}

/* ---------------------------------------------------------------------
   El mismo arbol en texto plano, para lectores de pantalla o para copiarlo
   --------------------------------------------------------------------- */
function arbolEnTextoHtml(tree, atoms) {
  const leyenda = atoms.map((e) => "<li>" + escapeHtml(e.letter) + ": " + (e.directa ? "letra escrita directamente" : escapeHtml(e.text)) + "</li>").join("");
  function linea(l) {
    const origen = l.fromId ? "regla " + l.kind + " " + l.rule + " sobre L" + l.fromId : "premisa " + l.origin;
    return "<li>L" + l.id + ": " + escapeHtml(formulaHablada(l.formula)) + ' <span class="plano" aria-hidden="true">(' + escapeHtml(formulaToString(l.formula)) + ")</span>, " +
      escapeHtml(origen) + (l.applied ? ", ya aplicada" : "") + ".</li>";
  }
  function nodo(n, ruta) {
    let html = "<li><b>" + ruta + "</b><ul>" + n.lines.map(linea).join("") + "</ul>";
    if (n.closed) {
      html += "<p>Rama cerrada: " + escapeHtml(n.closedInfo.letter) + " y no " + escapeHtml(n.closedInfo.letter) + ". Chocan " + escapeHtml(trazaCierre(n.closedInfo)) + ".</p>";
    } else if (n.open) {
      html += "<p>Rama abierta " + n.num + ": " + (n.model.map(([l, v]) => l + " = " + (v === "V" ? "verdadero" : "falso")).join(", ") || "cualquier valor") + ".</p>";
    } else if (n.children && n.children.length) {
      html += "<p>Aquí el árbol se parte en " + n.children.length + " ramas:</p><ol>" +
        n.children.map((c, i) => nodo(c, ruta + "." + (i + 1))).join("") + "</ol>";
    }
    return html + "</li>";
  }
  return "<p>Átomos:</p><ul>" + leyenda + "</ul><ol>" + nodo(tree, "Tronco 1") + "</ol>";
}

/* ---------------------------------------------------------------------
   El arbol como imagen PNG. Se dibuja en un canvas con su propio acomodo,
   no copiando la pantalla: asi sale completo aunque este a medio reproducir
   y siempre sobre blanco, que es lo que se pega en un reporte.
   --------------------------------------------------------------------- */
async function arbolAImagen(tree, atoms) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const C = {
    fondo: "#ffffff", caja: "#f5f5f7", borde: "#d2d2d7", linea: "#a1a1a6", texto: "#1d1d1f", tenue: "#6e6e73",
    no: "#b22222", abierta: "#1d8a3c", cerrada: "#b22222",
    atomos: ["#0066cc", "#b35900", "#8e44ad", "#0077a3", "#8a6a00", "#7d5f3c", "#4b47c4", "#0f7f78"],
  };
  const F = {
    atomo: 'italic 600 20px "STIX Two Text", "Cambria Math", "Times New Roman", serif',
    op: '500 21px "STIX Two Text", "Cambria Math", "Times New Roman", serif',
    chico: '12px -apple-system, "SF Pro Text", Inter, "Segoe UI", sans-serif',
    fuerte: '600 14px -apple-system, "SF Pro Text", Inter, "Segoe UI", sans-serif',
  };
  const FILA = 34, PAD = 12, VENTANA = 18, SEP_H = 28, SEP_V = 40, HOJA = 62, MARGEN = 36;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d");
  const ancho = (t, f) => { g.font = f; return g.measureText(t).width; };

  function piezas(f) {
    return formulaToTokens(f).map((t) => {
      if (t.t === "atom") {
        return { t: t.entry.letter, f: F.atomo, c: C.atomos[t.entry.index % 8], izq: 6, der: 6, pill: true };
      }
      if (t.t === "paren") return { t: t.v, f: F.op, c: C.tenue, izq: 1, der: 1 };
      if (t.kind === "not") return { t: t.v, f: F.op, c: C.no, izq: 0, der: 2 };
      return { t: t.v, f: F.op, c: C.texto, izq: 7, der: 7 };
    });
  }
  function anchoPiezas(ps) { return ps.reduce((s, p) => s + p.izq + ancho(p.t, p.f) + p.der, 0); }

  function medir(n) {
    n._filas = n.lines.map((l) => {
      const ps = piezas(l.formula);
      const origen = l.fromId ? l.kind + " " + l.rule + " · L" + l.fromId : l.origin;
      return { l, ps, origen, w: 34 + anchoPiezas(ps) + (l.applied ? 22 : 0) + 16 + ancho(origen, F.chico) };
    });
    n._w = Math.max(120, ...n._filas.map((x) => x.w)) + PAD * 2;
    n._h = n._filas.length * FILA + PAD;
    if (n.closed) { n._t1 = "✗ Rama cerrada"; n._t2 = n.closedInfo.letter + " y ¬" + n.closedInfo.letter + " · " + trazaCierre(n.closedInfo); }
    if (n.open) { n._t1 = "✓ Rama abierta " + n.num; n._t2 = n.model.map(([l, v]) => l + " = " + v).join(", ") || "cualquier valor"; }
    const hoja = n._t1 ? Math.max(ancho(n._t1, F.fuerte), ancho(n._t2, F.chico)) : 0;
    const hijos = n.children || [];
    hijos.forEach(medir);
    const anchoHijos = hijos.reduce((s, c) => s + c._subW, 0) + SEP_H * Math.max(0, hijos.length - 1);
    n._subW = Math.max(n._w, hoja, anchoHijos);
    n._subH = n._h + (n._t1 ? HOJA : 0) + (hijos.length ? SEP_V + Math.max(...hijos.map((c) => c._subH)) : 0);
  }

  function dibujarPiezas(ps, x, y) {
    for (const p of ps) {
      const w = ancho(p.t, p.f);
      if (p.pill) {
        g.fillStyle = p.c; g.globalAlpha = 0.13;
        g.beginPath(); g.roundRect(x, y - 13, w + 12, 26, 7); g.fill();
        g.globalAlpha = 1;
      }
      g.font = p.f; g.fillStyle = p.c; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(p.t, x + p.izq, y + 1);
      x += p.izq + w + p.der;
    }
  }

  function dibujar(n, x, y) {
    const cx = x + n._subW / 2, bx = cx - n._w / 2;
    g.fillStyle = C.caja; g.strokeStyle = C.borde; g.lineWidth = 1;
    g.beginPath(); g.roundRect(bx, y, n._w, n._h, 14); g.fill(); g.stroke();
    n._filas.forEach((fila, i) => {
      const fy = y + PAD / 2 + FILA * i + FILA / 2;
      g.textBaseline = "middle"; g.textAlign = "left"; g.font = F.chico; g.fillStyle = C.tenue;
      g.fillText("L" + fila.l.id, bx + PAD, fy);
      dibujarPiezas(fila.ps, bx + PAD + 34, fy);
      if (fila.l.applied) {
        g.font = F.chico; g.fillStyle = C.no;
        g.fillText("✓", bx + PAD + 34 + anchoPiezas(fila.ps) + 6, fy);
      }
      g.textAlign = "right"; g.font = F.chico; g.fillStyle = C.tenue;
      g.fillText(fila.origen, bx + n._w - PAD, fy);
    });
    let abajo = y + n._h;
    if (n._t1) {
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = F.fuerte; g.fillStyle = n.closed ? C.cerrada : C.abierta;
      g.fillText(n._t1, cx, abajo + 22);
      g.font = F.chico; g.fillStyle = C.tenue;
      g.fillText(n._t2, cx, abajo + 42);
      abajo += HOJA;
    }
    const hijos = n.children || [];
    if (hijos.length) {
      const yBarra = abajo + SEP_V / 2, yHijos = abajo + SEP_V;
      let hx = x + (n._subW - (hijos.reduce((s, c) => s + c._subW, 0) + SEP_H * (hijos.length - 1))) / 2;
      g.strokeStyle = C.linea; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, abajo); g.lineTo(cx, yBarra); g.stroke();
      for (const c of hijos) {
        const ccx = hx + c._subW / 2;
        g.strokeStyle = C.linea; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(cx, yBarra); g.lineTo(ccx, yBarra); g.lineTo(ccx, yHijos); g.stroke();
        dibujar(c, hx, yHijos);
        hx += c._subW + SEP_H;
      }
    }
  }

  medir(tree);
  const W = tree._subW + MARGEN * 2, H = tree._subH + MARGEN * 2;
  // doble resolucion para que se vea nitido, salvo que el canvas no lo aguante
  const escala = Math.min(2, 16000 / Math.max(W, H), Math.sqrt(120e6 / (W * H)));
  canvas.width = Math.ceil(W * escala);
  canvas.height = Math.ceil(H * escala);
  g.scale(escala, escala);
  g.fillStyle = C.fondo; g.fillRect(0, 0, W, H);
  dibujar(tree, MARGEN, MARGEN);
  return canvas;
}

/* ---------------------------------------------------------------------
   Historial: las ultimas bases escritas. Si el texto nuevo es continuacion
   del mas reciente, lo reemplaza: al escribir no debe llenarse de versiones
   a medias de la misma base.
   --------------------------------------------------------------------- */
const HISTORIAL_MAX = 5;
function agregarAHistorial(lista, texto) {
  const t = texto.trim();
  if (!t) return lista;
  const resto = lista.filter((x) => x !== t);
  if (resto.length && (t.startsWith(resto[0]) || resto[0].startsWith(t))) resto.shift();
  return [t].concat(resto).slice(0, HISTORIAL_MAX);
}

/* ---------------------------------------------------------------------
   Tema claro / oscuro. El <head> ya puso data-theme antes de pintar; aqui
   solo se cambia y se recuerda.
   --------------------------------------------------------------------- */
function iniciarTema(btnTema) {
  const raiz = document.documentElement;
  const themeColor = document.querySelector("#themeColor");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // el tema elegido se guarda aqui al instante: la animacion aplica el cambio un
  // momento despues, y si se pulsa dos veces seguidas la segunda debe partir de
  // lo que ya se eligio, no de lo que todavia se ve
  let tema = raiz.dataset.theme === "light" ? "light" : "dark";
  let transicion = null;
  // pinta siempre el ultimo tema elegido (aunque la llamada llegue tarde)
  function pintarTema() {
    raiz.dataset.theme = tema;
    if (themeColor) themeColor.content = tema === "light" ? "#fbfbfd" : "#000000";
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
}
