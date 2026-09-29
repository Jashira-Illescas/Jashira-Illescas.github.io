// Punto de entrada de todas las páginas. Lo pesado (Three.js) se carga solo cuando hace falta.
import { $, $$, webglDisponible, reducirMovimiento } from "./util.js?v=10";

// ---------------------------------------------------------------- paneles emergentes
// Un botón con data-abre="id" abre el panel #id. El panel se cierra al tocar fuera, con Esc,
// al elegir una opción o (los de la navegación) al desplazarse. Solo uno abierto a la vez.
let abierto = null;
function abrirPanel(boton, panel) {
  if (abierto && abierto.panel !== panel) cerrarPanel();
  panel.classList.add("abierto");
  boton.setAttribute("aria-expanded", "true");
  abierto = { boton, panel, y: window.scrollY };
  const primero = panel.querySelector('[aria-current="true"], [aria-current="page"], a, button, input');
  if (boton.dataset.foco !== "no" && primero && matchMedia("(pointer: fine)").matches) primero.focus({ preventScroll: true });
  alReposo();
}
function cerrarPanel(devolverFoco = false) {
  if (!abierto) return;
  const { boton, panel } = abierto;
  panel.classList.remove("abierto");
  boton.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton.focus({ preventScroll: true });
  abierto = null;
  alReposo();
}
// las opciones de cada panel entran una tras otra (el retraso sale de --i)
for (const p of $$(".emergente")) [...$$("li", p), ...$$(".emergente__pie", p)].forEach((el, i) => el.style.setProperty("--i", i));
document.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-abre]");
  if (boton) {
    const panel = document.getElementById(boton.dataset.abre);
    if (!panel) return;
    e.preventDefault();
    if (abierto?.panel === panel) cerrarPanel(); else abrirPanel(boton, panel);
    return;
  }
  if (abierto && e.target.closest("a[href], [data-cierra]") && abierto.panel.contains(e.target)) cerrarPanel();
});
document.addEventListener("pointerdown", (e) => {
  if (!abierto) return;
  if (abierto.panel.contains(e.target) || abierto.boton.contains(e.target)) return;
  cerrarPanel();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && abierto) cerrarPanel(true); });

let fijarIsla = 0;

// ---------------------------------------------------------------- enlaces dentro de la página
// Se desplaza con suavidad y reemplaza el #ancla en vez de apilarla en el historial:
// así el botón «Atrás» del navegador sale de la página en lugar de recorrer secciones.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const id = decodeURIComponent(a.getAttribute("href").slice(1));
  const destino = id && document.getElementById(id);
  if (!destino) return;
  e.preventDefault();
  fijarIsla = Date.now() + 1600;          // la isla queda a la vista mientras llega a la sección
  destino.scrollIntoView({ behavior: reducirMovimiento() ? "auto" : "smooth", block: "start" });
  history.replaceState(history.state, "", "#" + id);
  if (!destino.hasAttribute("tabindex")) destino.setAttribute("tabindex", "-1");
  destino.focus({ preventScroll: true });
});

// ---------------------------------------------------------------- isla: se esconde al bajar, vuelve al subir,
// marca la sección en la que estás y el avance de la lectura. Una luz de vidrio se desliza entre sus botones:
// sigue al puntero y descansa en la sección activa (inicio) o en el botón cuyo panel está abierto.
const isla = $("[data-isla]");
let luz = null, reposoLuz = null, sobreIsla = false;
function moverLuz(el) {
  if (!luz) return;
  if (!el || !el.offsetWidth) { luz.classList.remove("visible"); return; }
  const ri = isla.getBoundingClientRect(), r = el.getBoundingClientRect();
  luz.classList.toggle("sin-transicion", !luz.classList.contains("visible"));   // la primera vez aparece en su sitio
  luz.style.setProperty("--x", `${r.left - ri.left}px`);
  luz.style.setProperty("--w", `${r.width}px`);
  luz.classList.add("visible");
}
function alReposo() {
  if (sobreIsla) return;
  moverLuz(abierto && isla?.contains(abierto.boton) ? abierto.boton : reposoLuz);
}
if (isla) {
  luz = document.createElement("span");
  luz.className = "isla__luz";
  luz.setAttribute("aria-hidden", "true");
  isla.prepend(luz);
  isla.classList.add("con-luz");
  for (const el of $$(".isla__marca, .isla__enlaces a, .isla__boton:not(.isla__boton--menu)", isla)) {
    el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") moverLuz(el); });
    el.addEventListener("focus", () => moverLuz(el));
    el.addEventListener("blur", alReposo);
  }
  isla.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") sobreIsla = true; });
  isla.addEventListener("pointerleave", () => { sobreIsla = false; alReposo(); });
}

const espia = [];                           // pares enlace ↔ sección
for (const a of $$("[data-espia], #secciones .lista-secciones a")) {
  const s = document.getElementById(a.getAttribute("href").slice(1));
  if (s) espia.push([a, s]);
}
const rotuloSeccion = $("[data-seccion-actual]");
let actualEspia = -2;
function espiar() {
  const linea = window.innerHeight * 0.35;
  let actual = -1;
  espia.forEach(([, s], i) => { if (s.getBoundingClientRect().top <= linea) actual = i; });
  if (espia.length && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) actual = espia.length - 1;
  if (actual === actualEspia) return;
  actualEspia = actual;
  espia.forEach(([a], i) => { if (i === actual) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  if (rotuloSeccion) {
    const nuevo = actual < 0 ? "Secciones" : (espia[actual][0].querySelector("span")?.textContent || espia[actual][0].textContent);
    if (rotuloSeccion.textContent !== nuevo) {
      rotuloSeccion.textContent = nuevo;            // el rótulo entra desde abajo cuando cambias de sección
      rotuloSeccion.classList.remove("cambia");
      void rotuloSeccion.offsetWidth;
      rotuloSeccion.classList.add("cambia");
    }
  }
  const enlace = espia[actual]?.[0];
  reposoLuz = enlace && isla?.contains(enlace) ? enlace : null;
  requestAnimationFrame(alReposo);
}
if (isla) {
  let ultimo = window.scrollY, acumulado = 0, pedido = false;
  const alDesplazar = () => {
    pedido = false;
    const y = window.scrollY, d = y - ultimo;
    ultimo = y;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    isla.style.setProperty("--avance", max > 0 ? Math.min(1, y / max).toFixed(4) : "0");
    espiar();
    if (abierto?.panel.classList.contains("emergente") && Math.abs(y - abierto.y) > 60) cerrarPanel();
    if (Date.now() < fijarIsla) { isla.classList.remove("oculta"); acumulado = 0; return; }
    if (abierto?.panel.classList.contains("emergente") || isla.contains(document.activeElement)) return;
    acumulado = Math.sign(d) === Math.sign(acumulado) ? acumulado + d : d;
    if (y < 120 || acumulado < -24) isla.classList.remove("oculta");
    else if (acumulado > 36) isla.classList.add("oculta");
  };
  window.addEventListener("scroll", () => { if (!pedido) { pedido = true; requestAnimationFrame(alDesplazar); } }, { passive: true });
  window.addEventListener("resize", () => { actualEspia = -2; alDesplazar(); }, { passive: true });
  isla.addEventListener("focusin", () => isla.classList.remove("oculta"));
  alDesplazar();
}

document.fonts?.ready.then(() => { actualEspia = -2; espiar(); });

// ---------------------------------------------------------------- transición entre páginas: la foto viaja
// El fundido lo hace el navegador (@view-transition en styles.css). Al salir, la imagen de la tarjeta o miniatura
// en la que hiciste clic (o la portada, si está a la vista) recibe el nombre «foto». En la página nueva, el script
// del <head> se lo da a su portada: así la foto viaja de una a otra.
const enPantalla = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; };
let imagenDelClic = null;
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  imagenDelClic = a && !a.hasAttribute("download") && !a.getAttribute("href").startsWith("#") ? a.querySelector("img") : null;
}, true);
window.addEventListener("pageswap", (e) => {
  if (!e.viewTransition || reducirMovimiento()) return;
  let img = imagenDelClic && enPantalla(imagenDelClic) ? imagenDelClic : null;
  if (!img) { const portada = $(".cubierta__img img"); if (portada && enPantalla(portada)) img = portada; }
  if (!img) return;
  img.style.viewTransitionName = "foto";
  e.viewTransition.finished.finally(() => { img.style.viewTransitionName = ""; });
});

// ---------------------------------------------------------------- reflejo del vidrio bajo el puntero
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest?.("[data-brillo]");
  if (!el || e.pointerType !== "mouse") return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}, { passive: true });

// ---------------------------------------------------------------- bordes difuminados de las tarjetas con foto
// Cada tarjeta lleva como máscara un SVG de su tamaño exacto: un rectángulo redondeado (radio 24, como las demás
// piezas) desenfocado, sin uniones. El difuminado mide lo mismo que el padding de la tarjeta (--pluma en styles.css).
// Sin JS queda la máscara de CSS, hecha por franjas.
const conFoto = $$(".destacada, .tarjeta, .fin__lista a");
if (conFoto.length && "ResizeObserver" in window) {
  const svg = (w, h, f) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
    + `<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(f / 4).toFixed(2)}"/></filter>`
    + `<rect x="${f / 2}" y="${f / 2}" width="${w - f}" height="${h - f}" rx="24" filter="url(#b)"/></svg>`;
  const ro = new ResizeObserver((entradas) => {
    for (const { target: el } of entradas) {
      const w = el.offsetWidth, h = el.offsetHeight, f = parseFloat(getComputedStyle(el).paddingLeft);
      if (w && h && f) el.style.setProperty("--mascara", `url("data:image/svg+xml,${encodeURIComponent(svg(w, h, f))}") 0 0 / 100% 100% no-repeat`);
    }
  });
  conFoto.forEach((el) => ro.observe(el));
}

// ---------------------------------------------------------------- aparición al hacer scroll
const revelar = $$(".revelar");
if ("IntersectionObserver" in window && revelar.length) {
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -6% 0px" });
  revelar.forEach((el) => io.observe(el));
} else revelar.forEach((el) => el.classList.add("visible"));

// ---------------------------------------------------------------- control segmentado (pestañas con luz deslizante)
export function segmentado(seg) {
  const opciones = $$('[role="tab"], [role="radio"]', seg);
  const attr = opciones[0]?.getAttribute("role") === "radio" ? "aria-checked" : "aria-selected";
  let luz = $(".segmentado__luz", seg);
  if (!luz) { luz = document.createElement("span"); luz.className = "segmentado__luz"; luz.setAttribute("aria-hidden", "true"); seg.prepend(luz); }
  const mover = (op) => {
    if (!op || !op.offsetWidth) return;
    luz.style.setProperty("--x", `${op.offsetLeft}px`);
    luz.style.setProperty("--w", `${op.offsetWidth}px`);
  };
  const activar = (op, foco = false, avisar = true) => {
    for (const o of opciones) {
      const sel = o === op;
      o.setAttribute(attr, String(sel));
      o.tabIndex = sel ? 0 : -1;
      const panel = o.getAttribute("aria-controls") && document.getElementById(o.getAttribute("aria-controls"));
      if (panel && attr === "aria-selected") {
        panel.hidden = !sel;
        if (sel) { panel.classList.remove("entrando"); void panel.offsetWidth; panel.classList.add("entrando"); }
      }
    }
    mover(op);
    if (foco) op.focus();
    if (seg.scrollWidth > seg.clientWidth) seg.scrollTo({ left: op.offsetLeft - 24, behavior: "smooth" });
    if (avisar) seg.dispatchEvent(new CustomEvent("cambio", { detail: op, bubbles: true }));
  };
  opciones.forEach((o, i) => {
    o.addEventListener("click", () => activar(o));
    o.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); activar(opciones[(i + d + opciones.length) % opciones.length], true); }
      if (e.key === "Home") { e.preventDefault(); activar(opciones[0], true); }
      if (e.key === "End") { e.preventDefault(); activar(opciones.at(-1), true); }
    });
  });
  const actual = () => opciones.find((o) => o.getAttribute(attr) === "true") || opciones[0];
  activar(actual(), false, false);
  // si las opciones no entran, el borde que sigue se desvanece: indica que hay más al deslizar
  const borde = () => {
    const resto = seg.scrollWidth - seg.clientWidth - seg.scrollLeft;
    seg.classList.toggle("sigue", resto > 4);
  };
  seg.addEventListener("scroll", borde, { passive: true });
  new ResizeObserver(() => { mover(actual()); borde(); }).observe(seg);
  document.fonts?.ready.then(() => mover(actual()));
  return { activar, actual };
}
$$("[data-segmentado]").forEach(segmentado);

// ---------------------------------------------------------------- proceso paso a paso (estrategia e implantación)
// Al entrar en pantalla recorre los pasos una sola vez y se queda en el último; si la persona
// elige un paso (clic, puntero o flechas), el recorrido se detiene.
for (const p of $$("[data-proceso]")) {
  const botones = $$(".proceso__pasos button", p);
  const imgs = $$(".proceso__escena img", p);
  // en pantallas angostas los pasos se ven como números: el texto del elegido va debajo
  const leyenda = document.createElement("p");
  leyenda.className = "proceso__leyenda";
  leyenda.setAttribute("aria-hidden", "true");          // los botones ya llevan el texto para lectores de pantalla
  p.append(leyenda);
  let actual = 1, tocado = false, reloj = null;
  const mostrar = (n, foco = false) => {
    actual = n;
    const b = botones[n - 1];
    const titulo = document.createElement("strong"), texto = document.createElement("span");
    titulo.textContent = `${n}. ${b.querySelector("strong").textContent}`;
    texto.textContent = b.querySelector("span").textContent;
    leyenda.replaceChildren(titulo, texto);
    botones.forEach((x) => x.setAttribute("aria-pressed", String(+x.dataset.paso === n)));
    imgs.forEach((im) => {
      const activa = +im.dataset.paso === n;
      im.classList.toggle("activo", activa);
      im.setAttribute("aria-hidden", String(!activa));
    });
    if (foco) botones[n - 1]?.focus();
  };
  const parar = () => { tocado = true; clearInterval(reloj); reloj = null; };
  botones.forEach((b, i) => {
    b.addEventListener("click", () => { parar(); mostrar(+b.dataset.paso); });
    b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { parar(); mostrar(+b.dataset.paso); } });
    b.addEventListener("keydown", (e) => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      parar();
      mostrar(((i + d + botones.length) % botones.length) + 1, true);
    });
  });
  mostrar(1);
  if (!reducirMovimiento() && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      if (tocado) return;
      reloj = setInterval(() => {
        if (tocado || actual >= botones.length) { clearInterval(reloj); return; }
        mostrar(actual + 1);
      }, 1700);
    }, { threshold: 0.55 });
    io.observe($(".proceso__escena", p));
  }
}

// ---------------------------------------------------------------- comparador (línea de corte entre dos renders)
for (const c of $$("[data-comparador]")) {
  const r = $('input[type="range"]', c);
  const fijar = () => c.style.setProperty("--pos", r.value + "%");
  r.addEventListener("input", fijar);
  fijar();
}

// ---------------------------------------------------------------- módulos 3D y de gestión (solo cuando se acercan a la pantalla)
function alAcercarse(el, fn, margen = "600px") {
  if (!("IntersectionObserver" in window)) return fn();
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margen });
  io.observe(el);
}
const ahorro = navigator.connection && navigator.connection.saveData;

const maqueta = $("#maqueta");
if (maqueta) {
  const portada = maqueta.closest(".portada");
  if (webglDisponible() && !ahorro) {
    import("./maqueta.js?v=10")
      .then((m) => m.iniciar(maqueta, $("#maqueta-etiquetas"), $("#maqueta-pista")))
      .then(() => portada.classList.add("con-3d"))
      .catch((err) => { console.warn("Maqueta 3D no disponible:", err); portada.classList.add("sin-3d"); });
  } else portada.classList.add("sin-3d");
}

const visor = $("#visor3d");
if (visor) {
  const aviso = $(".visor__cargando", visor);
  if (!webglDisponible()) aviso.textContent = "Tu navegador no permite ver modelos 3D (WebGL). Revisa los planos y renders.";
  else alAcercarse(visor, () => import("./visor3d.js?v=10").then((m) => m.iniciar(visor)).catch((err) => {
    console.warn(err);
    aviso.textContent = "No se pudo cargar el modelo 3D en este navegador.";
  }));
}

const gestion = $("#gestion-app");
if (gestion) alAcercarse(gestion, () => import("./gestion.js?v=10").then((m) => m.iniciar(gestion)).catch((err) => console.warn(err)));
