// Gestión de la obra: indicadores, cronograma (Gantt), curva S y presupuesto con estructura S10.
// Reglas: marcas finas, un solo color por serie (el del proyecto), ejes discretos, tooltip + tabla equivalente.
import { $, json, soles, soles0, solesCompacto, numero, fecha, aFecha, mesCorto, DIA, tooltip, emitir, escuchar } from "./util.js?v=10";

const SVG = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, padre) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (padre) padre.appendChild(n);
  return n;
};
const html = (tag, props = {}, padre) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  if (padre) padre.appendChild(n);
  return n;
};

export async function iniciar(raiz) {
  const [PR, CR] = await Promise.all([json(raiz.dataset.presupuesto), json(raiz.dataset.cronograma)]);
  const acento = getComputedStyle(raiz).getPropertyValue("--acento").trim() || "#00776a";
  const rgba = (hex, a) => { const n = parseInt(hex.replace("#", ""), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const V = {
    serie: acento,
    suave: /^#[0-9a-f]{6}$/i.test(acento) ? rgba(acento, 0.1) : "rgba(0,119,106,.1)",
    gris: "#c9ccc8", grilla: "#ecebe7", eje: "#c7c5bf", tinta: "#17171a", tinta2: "#4d4d55", fondoFila: "#fafaf8", mesPar: "#f6f6f3",
  };
  const tip = tooltip();
  const g = (k) => $(`[data-g="${k}"]`, raiz);
  const inicio = aFecha(CR.inicio);
  const fechaSemana = (s) => new Date(inicio.getTime() + (7 * s - 1) * DIA);
  const iso = (d) => d.toISOString().slice(0, 10);

  // ================================================================ indicadores
  const kpis = g("kpis");
  if (kpis) {
    const criticas = CR.tareas.filter((t) => t.critica && !t.hito).length;
    const datos = [
      ["Presupuesto total", solesCompacto(PR.total), "con gastos generales, utilidad e IGV"],
      ["Costo directo", solesCompacto(PR.costo_directo), `S/ ${numero(PR.cd_m2, 0)} por m² de local (${numero(PR.area_local, 0)} m²)`],
      ["Plazo de obra", `${CR.dias_laborables} días`, `${CR.semanas} semanas de lunes a sábado`],
      ["Ruta crítica", `${criticas} tareas`, "tarrajeo, pinturas, revestimientos y mobiliario"],
    ];
    for (const [a, b, c] of datos) {
      const d = html("div", { className: "kpi" }, kpis);
      html("span", { className: "kpi__etq", textContent: a }, d);
      html("span", { className: "kpi__valor", textContent: b }, d);
      html("span", { className: "kpi__det", textContent: c }, d);
    }
  }

  // ================================================================ control de semana (sincronizado con el visor 4D)
  const rango = $("[data-g-semana]", raiz), salida = $("[data-g-semana-texto]", raiz);
  let semana = CR.semanas;
  const pintores = [];
  function fijarSemana(s, origen = "gestion") {
    semana = Math.max(0, Math.min(CR.semanas, Math.round(s)));
    if (rango) rango.value = semana;
    const acum = semana === 0 ? 0 : CR.curva_s[semana - 1].pct;
    if (salida) salida.textContent = semana === 0 ? "Semana 0 · local recibido"
      : `Semana ${semana} de ${CR.semanas} · al ${fecha(iso(fechaSemana(semana)))} · ${numero(acum, 1)} % del costo directo ejecutado`;
    pintores.forEach((f) => f(semana));
    if (origen !== "bus") emitir("avance", { semana, origen: "gestion" });
  }
  if (rango) { rango.max = CR.semanas; rango.addEventListener("input", () => fijarSemana(+rango.value)); }
  escuchar("avance", (d) => { if (d.origen !== "gestion") fijarSemana(d.semana, "bus"); });

  // ================================================================ GANTT
  const cajaGantt = g("gantt");
  if (cajaGantt) {
    const dibujarGantt = () => {
      cajaGantt.replaceChildren();
      const ancho = Math.max(780, cajaGantt.clientWidth);
      const angosto = cajaGantt.clientWidth < 700;
      const LW = angosto ? 220 : 360, FILA = 24, CAB = 40;
      const tareas = CR.tareas;
      const alto = CAB + tareas.length * FILA + 10;
      const t0 = aFecha(CR.inicio).getTime() - 2 * DIA, t1 = aFecha(CR.fin).getTime() + 4 * DIA;
      const x = (d) => LW + 8 + ((d - t0) / (t1 - t0)) * (ancho - LW - 22);
      const svg = el("svg", { class: "gantt", viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto, role: "img",
        "aria-label": `Cronograma de obra de ${CR.semanas} semanas con ${tareas.length} filas; la tabla equivalente está debajo.` }, cajaGantt);
      const m = new Date(aFecha(CR.inicio).getFullYear(), aFecha(CR.inicio).getMonth(), 1);
      let par = false;
      while (m.getTime() < t1) {
        const sig = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        const a = Math.max(x(m.getTime()), LW + 8), b = Math.min(x(sig.getTime()), ancho - 14);
        if (b > a) {
          if (par) el("rect", { x: a, y: CAB - 8, width: b - a, height: alto - CAB + 8, fill: V.mesPar }, svg);
          const t = el("text", { x: a + 5, y: 16, class: "g-mes" }, svg);
          t.textContent = `${mesCorto(m)} ${String(m.getFullYear()).slice(2)}`;
        }
        par = !par;
        m.setMonth(m.getMonth() + 1);
      }
      el("line", { x1: LW + 8, x2: ancho - 14, y1: CAB - 8, y2: CAB - 8, stroke: V.eje }, svg);
      tareas.forEach((t, i) => {
        const y = CAB + i * FILA;
        if (i % 2 === 0) el("rect", { x: 0, y, width: LW, height: FILA, fill: V.fondoFila }, svg);
        const etq = el("text", { x: t.nivel === 1 ? 10 : 24, y: y + 16, class: t.resumen ? "g-resumen" : "" }, svg);
        const max = angosto ? 30 : 52;
        etq.textContent = t.nombre.length > max ? t.nombre.slice(0, max - 1) + "…" : t.nombre;
        if (t.resumen) etq.setAttribute("font-weight", "600");
        const xa = x(aFecha(t.inicio).getTime()), xb = x(aFecha(t.fin).getTime() + DIA);
        const grupo = el("g", { class: "g-barra", tabindex: "0", role: "img",
          "aria-label": `${t.nombre}: ${fecha(t.inicio)} a ${fecha(t.fin)}, ${t.dias} días${t.critica ? ", ruta crítica" : ""}` }, svg);
        if (t.hito) {
          const cx = x(aFecha(t.inicio).getTime()), cy = y + FILA / 2;
          el("rect", { x: cx - 6, y: cy - 6, width: 12, height: 12, fill: V.tinta, transform: `rotate(45 ${cx} ${cy})` }, grupo);
        } else if (t.resumen) {
          el("rect", { x: xa, y: y + 10, width: Math.max(2, xb - xa), height: 4, fill: V.tinta, rx: 1 }, grupo);
          el("rect", { x: xa, y: y + 10, width: 2, height: 9, fill: V.tinta }, grupo);
          el("rect", { x: xb - 2, y: y + 10, width: 2, height: 9, fill: V.tinta }, grupo);
        } else {
          el("rect", { x: xa, y: y + 6, width: Math.max(3, xb - xa), height: 12, rx: 3, fill: t.critica ? V.serie : V.gris }, grupo);
        }
        el("rect", { x: Math.min(xa, xb) - 6, y, width: Math.max(24, xb - xa + 12), height: FILA, fill: "transparent" }, grupo);
        const filas = [{ tipo: "valor", texto: t.nombre },
          { tipo: "fila", etiqueta: "Fechas", valor: `${fecha(t.inicio)} → ${fecha(t.fin)}` },
          { tipo: "fila", etiqueta: "Duración", valor: t.hito ? "hito" : `${t.dias} días laborables` }];
        if (!t.resumen && !t.hito) {
          filas.push({ tipo: "fila", etiqueta: "Costo directo", valor: soles0(t.costo) });
          filas.push({ tipo: "fila", etiqueta: "Holgura", valor: t.critica ? "0 días · ruta crítica" : `${t.holgura} días` });
        }
        grupo.addEventListener("pointermove", (e) => tip.mostrar(filas, e.clientX, e.clientY));
        grupo.addEventListener("pointerleave", () => tip.ocultar());
        grupo.addEventListener("focus", () => { const r = grupo.getBoundingClientRect(); tip.mostrar(filas, r.left + r.width / 2, r.bottom); });
        grupo.addEventListener("blur", () => tip.ocultar());
      });
      const cursor = el("g", {}, svg);
      const linea = el("line", { y1: CAB - 8, y2: alto - 4, stroke: V.tinta, "stroke-width": 1.2, "stroke-dasharray": "3 3" }, cursor);
      const rot = el("text", { y: CAB - 12, "text-anchor": "middle", fill: V.tinta, "font-size": 10, "font-weight": 600 }, cursor);
      const pintar = (s) => {
        cursor.style.display = s === 0 ? "none" : "";
        const xx = x(fechaSemana(s).getTime() + DIA);
        linea.setAttribute("x1", xx); linea.setAttribute("x2", xx);
        rot.setAttribute("x", Math.min(ancho - 20, xx)); rot.textContent = `S${s}`;
      };
      pintar(semana);
      return pintar;
    };
    let pintarGantt = null;
    const dibujarSiVisible = () => { if (cajaGantt.clientWidth) pintarGantt = dibujarGantt(); };
    dibujarSiVisible();
    pintores.push((s) => pintarGantt?.(s));
    let ancho0 = cajaGantt.clientWidth;
    new ResizeObserver(() => { if (Math.abs(cajaGantt.clientWidth - ancho0) > 40 || !pintarGantt) { ancho0 = cajaGantt.clientWidth; dibujarSiVisible(); } }).observe(cajaGantt);
    const tb = g("tabla-gantt");
    if (tb) {
      const t = html("table", { className: "tabla" }, tb);
      const cab = html("tr", {}, html("thead", {}, t));
      ["Id", "Tarea", "Inicio", "Fin", "Días", "Costo directo", "Holgura"].forEach((h, i) => html("th", { textContent: h, className: i >= 4 ? "n" : "" }, cab));
      const cuerpo = html("tbody", {}, t);
      for (const x of CR.tareas) {
        const f = html("tr", { className: x.resumen ? "fila-titulo" : "" }, cuerpo);
        html("td", { textContent: x.id, className: "item" }, f);
        html("td", { textContent: x.nombre }, f);
        html("td", { textContent: fecha(x.inicio) }, f);
        html("td", { textContent: fecha(x.fin) }, f);
        html("td", { textContent: x.hito ? "hito" : x.dias, className: "n" }, f);
        html("td", { textContent: x.resumen || x.hito ? "" : soles0(x.costo), className: "n" }, f);
        html("td", { textContent: x.resumen || x.hito ? "" : x.critica ? "crítica" : `${x.holgura} d`, className: "n" }, f);
      }
    }
  }

  // ================================================================ CURVA S
  const cajaCurva = g("curva");
  if (cajaCurva) {
    const W = 760, H = 320, I = 58, D = 104, A = 18, B = 36;
    const n = CR.curva_s.length;
    const x = (s) => I + (s / n) * (W - I - D);
    const y = (p) => A + (1 - p / 100) * (H - A - B);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Curva S del costo directo acumulado: de 0 a 100 % en ${n} semanas; la tabla semanal está debajo.` }, cajaCurva);
    for (const p of [0, 25, 50, 75, 100]) {
      el("line", { x1: I, x2: W - D, y1: y(p), y2: y(p), stroke: p === 0 ? V.eje : V.grilla }, svg);
      const t = el("text", { x: I - 8, y: y(p) + 4, "text-anchor": "end" }, svg);
      t.textContent = `${p} %`;
    }
    for (let s = 0; s <= n; s += n > 20 ? 4 : 2) {
      const t = el("text", { x: x(s), y: H - B + 18, "text-anchor": "middle" }, svg);
      t.textContent = s === 0 ? "S0" : `S${s}`;
    }
    const pts = [[0, 0], ...CR.curva_s.map((w) => [w.semana, w.pct])];
    const d = pts.map(([s, p], i) => `${i ? "L" : "M"}${x(s).toFixed(1)},${y(p).toFixed(1)}`).join("");
    el("path", { d: `${d}L${x(n)},${y(0)}L${x(0)},${y(0)}Z`, fill: V.suave }, svg);
    el("path", { d, fill: "none", stroke: V.serie, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    for (const mk of CR.marcas_curva || []) {
      el("line", { x1: x(mk.semana), x2: x(mk.semana), y1: y(0), y2: y(100), stroke: V.grilla }, svg);
      const t = el("text", { x: x(mk.semana) + 4, y: y(100) + 12 + (mk === CR.marcas_curva[1] ? 14 : 0) }, svg);
      t.textContent = mk.texto;
    }
    el("circle", { cx: x(n), cy: y(100), r: 4, fill: V.serie, stroke: "#fff", "stroke-width": 2 }, svg);
    const fin = el("text", { x: x(n) + 8, y: y(100) + 4 }, svg);
    fin.textContent = `100 % · ${solesCompacto(CR.costo_directo)}`;
    const cursor = el("g", {}, svg);
    const cl = el("line", { y1: A, y2: H - B, stroke: V.tinta, "stroke-width": 1, "stroke-dasharray": "3 3" }, cursor);
    const cp = el("circle", { r: 4.5, fill: V.serie, stroke: "#fff", "stroke-width": 2 }, cursor);
    const pintar = (s) => {
      cursor.style.display = s === 0 ? "none" : "";
      const p = s === 0 ? 0 : CR.curva_s[s - 1].pct;
      cl.setAttribute("x1", x(s)); cl.setAttribute("x2", x(s));
      cp.setAttribute("cx", x(s)); cp.setAttribute("cy", y(p));
    };
    pintores.push(pintar);
    pintar(semana);
    const zona = el("rect", { x: I, y: A, width: W - I - D, height: H - A - B, fill: "transparent", tabindex: "0",
      "aria-label": "Recorre la curva semana a semana con el puntero o con las flechas" }, svg);
    const leer = (s) => {
      const w = CR.curva_s[s - 1];
      return [{ tipo: "valor", texto: `${numero(w.pct, 1)} % acumulado` },
        { tipo: "fila", etiqueta: `Semana ${w.semana}`, valor: fecha(w.inicio) },
        { tipo: "fila", etiqueta: "Costo de la semana", valor: soles0(w.costo) },
        { tipo: "fila", etiqueta: "Acumulado", valor: soles0(w.acumulado) }];
    };
    zona.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const s = Math.max(1, Math.min(n, Math.round(((e.clientX - r.left) * (W / r.width) - I) / ((W - I - D) / n))));
      fijarSemana(s);
      tip.mostrar(leer(s), e.clientX, e.clientY);
    });
    zona.addEventListener("pointerleave", () => tip.ocultar());
    zona.addEventListener("keydown", (e) => {
      const dlt = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!dlt) return;
      e.preventDefault();
      fijarSemana(Math.max(1, Math.min(n, (semana || 1) + dlt)));
      const r = cp.getBoundingClientRect();
      tip.mostrar(leer(semana), r.left, r.bottom);
    });
    zona.addEventListener("blur", () => tip.ocultar());
    const tc = g("tabla-curva");
    if (tc) {
      const t = html("table", { className: "tabla" }, tc);
      const cab = html("tr", {}, html("thead", {}, t));
      ["Semana", "Inicio", "Costo semanal", "Acumulado", "% acumulado"].forEach((h, i) => html("th", { textContent: h, className: i >= 2 ? "n" : "" }, cab));
      const cuerpo = html("tbody", {}, t);
      for (const w of CR.curva_s) {
        const f = html("tr", {}, cuerpo);
        html("td", { textContent: w.semana, className: "item" }, f);
        html("td", { textContent: fecha(w.inicio) }, f);
        html("td", { textContent: soles0(w.costo), className: "n" }, f);
        html("td", { textContent: soles0(w.acumulado), className: "n" }, f);
        html("td", { textContent: `${numero(w.pct, 1)} %`, className: "n" }, f);
      }
    }
  }

  // ================================================================ PRESUPUESTO
  const cajaBarras = g("barras");
  if (cajaBarras) {
    const orden = [...PR.especialidades].sort((a, b) => b.total - a.total);
    const max = orden[0].total;
    const lista = html("div", { className: "barras" }, cajaBarras);
    for (const e of orden) {
      const fila = html("div", { className: "barra", tabIndex: 0 }, lista);
      const nombre = e.desc.charAt(0) + e.desc.slice(1).toLowerCase().replace(/\(.*\)/, "").trim();
      html("span", { className: "barra__etq", textContent: nombre.replace("s.s.hh.", "SS.HH.") }, fila);
      const pista = html("span", { className: "barra__pista" }, fila);
      const pct = (e.total / max) * 100;
      const relleno = html("span", { className: "barra__relleno" }, pista);
      relleno.style.width = `calc(${pct}% * 0.66)`;
      const val = html("span", { className: "barra__valor", textContent: `${solesCompacto(e.total)} · ${numero((e.total / PR.costo_directo) * 100, 1)} %` }, pista);
      val.style.left = `calc(${pct}% * 0.66)`;
      const n = PR.partidas.filter((p) => !p.titulo && p.item.startsWith(e.item + ".")).length;
      const filas = [{ tipo: "valor", texto: soles(e.total) }, { tipo: "fila", etiqueta: nombre, valor: `${n} partidas` }];
      fila.addEventListener("pointermove", (ev) => tip.mostrar(filas, ev.clientX, ev.clientY));
      fila.addEventListener("pointerleave", () => tip.ocultar());
      fila.addEventListener("focus", () => { const r = fila.getBoundingClientRect(); tip.mostrar(filas, r.left + 40, r.bottom); });
      fila.addEventListener("blur", () => tip.ocultar());
    }
  }
  const cajaRes = g("resumen");
  if (cajaRes) {
    const t = html("table", { className: "tabla" }, cajaRes);
    const cuerpo = html("tbody", {}, t);
    const filas = [["Costo directo", PR.costo_directo], ["Gastos generales (10 %)", PR.gastos_generales], ["Utilidad (8 %)", PR.utilidad],
      ["Subtotal", PR.subtotal], ["IGV (18 %)", PR.igv], ["Presupuesto total", PR.total]];
    filas.forEach(([a, b], i) => {
      const f = html("tr", { className: i === 0 || i === 3 ? "fila-total" : i === 5 ? "fila-total fila-total--final" : "" }, cuerpo);
      html("td", { textContent: a }, f);
      html("td", { textContent: soles(b), className: "n" }, f);
    });
    const f1 = html("tr", {}, cuerpo);
    html("td", { textContent: `Costo directo por m² de local (${numero(PR.area_local, 0)} m²)` }, f1);
    html("td", { textContent: soles(PR.cd_m2), className: "n" }, f1);
    const f2 = html("tr", {}, cuerpo);
    html("td", { textContent: "Presupuesto total por m²" }, f2);
    html("td", { textContent: soles(PR.total_m2), className: "n" }, f2);
  }
  const cajaTabla = g("tabla-pres");
  if (cajaTabla) {
    const t = html("table", { className: "tabla" }, cajaTabla);
    const cab = html("tr", {}, html("thead", {}, t));
    ["Item", "Descripción", "Und.", "Metrado", "P.U. S/", "Parcial S/"].forEach((h, i) => html("th", { textContent: h, className: i >= 3 ? "n" : "" }, cab));
    const cuerpo = html("tbody", {}, t);
    const filasPorItem = new Map();
    const subtotal = (item) => PR.partidas.filter((p) => !p.titulo && p.item.startsWith(item + ".")).reduce((a, p) => a + p.parcial, 0);
    for (const p of PR.partidas) {
      const nivel = p.item.split(".").length;
      const f = html("tr", { className: p.titulo ? `fila-titulo fila-titulo--${nivel}` : "" }, cuerpo);
      html("td", { textContent: p.item, className: "item" }, f);
      const desc = html("td", {}, f);
      if (p.titulo) {
        const b = html("button", { className: "plegar", type: "button", textContent: p.desc }, desc);
        b.setAttribute("aria-expanded", "true");
        b.addEventListener("click", () => {
          const abrir = b.getAttribute("aria-expanded") !== "true";
          b.setAttribute("aria-expanded", String(abrir));
          for (const [item, fila] of filasPorItem) if (item.startsWith(p.item + ".")) fila.hidden = !abrir;
        });
        html("td", {}, f); html("td", {}, f); html("td", {}, f);
        html("td", { textContent: numero(subtotal(p.item)), className: "n" }, f);
      } else {
        desc.append(document.createTextNode(p.desc));
        if (p.apu) {
          const chip = html("button", { className: "chip-apu", type: "button", textContent: "APU" }, desc);
          chip.setAttribute("aria-label", `Ver análisis de precio unitario de ${p.desc}`);
          chip.addEventListener("click", () => abrirApu(PR.apu[p.apu], p));
        }
        html("span", { className: "fuente", textContent: `Metrado: ${p.fuente}` }, desc);
        html("td", { textContent: p.und }, f);
        html("td", { textContent: numero(p.metrado), className: "n" }, f);
        html("td", { textContent: numero(p.pu), className: "n" }, f);
        html("td", { textContent: numero(p.parcial), className: "n" }, f);
      }
      filasPorItem.set(p.item, f);
    }
    const pie = html("tfoot", {}, t);
    [["Costo directo", PR.costo_directo, "fila-total"], ["Gastos generales (10 %)", PR.gastos_generales, ""], ["Utilidad (8 %)", PR.utilidad, ""],
      ["Subtotal", PR.subtotal, "fila-total"], ["IGV (18 %)", PR.igv, ""], ["Presupuesto total", PR.total, "fila-total fila-total--final"]]
      .forEach(([a, b, c]) => {
        const f = html("tr", { className: c }, pie);
        html("td", {}, f);
        const td = html("td", { textContent: a }, f);
        td.colSpan = 4;
        html("td", { textContent: soles(b), className: "n" }, f);
      });
  }

  // análisis de precio unitario (ventana)
  let dlg;
  function abrirApu(a, partida) {
    if (!dlg) {
      dlg = html("dialog", { className: "apu" }, document.body);
      dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    }
    dlg.replaceChildren();
    const caja = html("div", { className: "panel" }, dlg);
    html("p", { className: "etiqueta", textContent: `Análisis de precio unitario · partida ${partida.item}` }, caja);
    html("h3", { textContent: a.partida }, caja);
    html("p", { className: "sub", textContent: `Rendimiento: ${numero(a.rend, 0)} ${a.und}/día · costo por ${a.und}` }, caja);
    const t = html("table", { className: "tabla" }, caja);
    const cuerpo = html("tbody", {}, t);
    for (const [k, v] of [["Mano de obra", a.mo], ["Materiales", a.mat], ["Equipos y herramientas", a.eq]]) {
      const f = html("tr", {}, cuerpo);
      html("td", { textContent: k }, f);
      html("td", { textContent: soles(v), className: "n" }, f);
    }
    const f = html("tr", { className: "fila-total fila-total--final" }, cuerpo);
    html("td", { textContent: "Precio unitario" }, f);
    html("td", { textContent: soles(a.total), className: "n" }, f);
    const nota = html("p", { className: "nota", textContent: "Cuadrillas, insumos y cantidades completos en la hoja APU del Excel descargable." }, caja);
    nota.style.marginTop = "1rem";
    const cerrar = html("button", { className: "boton boton--chico", type: "button", textContent: "Cerrar" }, caja);
    cerrar.addEventListener("click", () => dlg.close());
    dlg.showModal();
    cerrar.focus();
  }

  // al cambiar de pestaña, el Gantt oculto se dibuja con su ancho real
  raiz.addEventListener("cambio", () => requestAnimationFrame(() => { if (cajaGantt && cajaGantt.clientWidth) window.dispatchEvent(new Event("resize")); }));
  fijarSemana(CR.semanas, "bus");
}
