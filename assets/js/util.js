// Utilidades compartidas: formato de números/fechas, tooltip y bus de eventos.

export const $ = (s, c = document) => c.querySelector(s);
export const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const nf0 = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const soles = (n) => "S/ " + nf2.format(n);
export const soles0 = (n) => "S/ " + nf0.format(n);
const nfDec = {};
export const numero = (n, dec = 2) =>
  (nfDec[dec] ||= new Intl.NumberFormat("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })).format(n);
export function solesCompacto(n) {
  if (Math.abs(n) >= 1e6) return "S/ " + (n / 1e6).toFixed(2) + " M";
  if (Math.abs(n) >= 1e3) return "S/ " + nf0.format(Math.round(n / 1e3)) + " mil";
  return soles0(n);
}
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export const fecha = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${String(d).padStart(2, "0")} ${MESES[m - 1]} ${y}`; };
export const mesCorto = (d) => MESES[d.getMonth()];
export const aFecha = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const DIA = 86400000;

// una sola descarga por archivo aunque varios módulos lo pidan (visor 3D y gestión comparten el cronograma)
const pedidos = new Map();
export function json(url) {
  if (!pedidos.has(url)) {
    pedidos.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${url} (${r.status})`);
      return r.json();
    }));
  }
  return pedidos.get(url);
}

// ---- tooltip único para toda la página (el contenido se arma con textContent)
let tip;
export function tooltip() {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tooltip";
    tip.setAttribute("role", "status");
    document.body.appendChild(tip);
  }
  return {
    mostrar(filas, x, y) {
      tip.replaceChildren();
      for (const f of filas) {
        const el = document.createElement(f.tipo === "valor" ? "strong" : "div");
        if (f.tipo === "fila") {
          el.className = "t-fila";
          const a = document.createElement("span"); a.className = "t-sec"; a.textContent = f.etiqueta;
          const b = document.createElement("span"); b.textContent = f.valor;
          el.append(a, b);
        } else {
          el.textContent = f.texto;
          if (f.tipo === "sec") el.className = "t-sec";
        }
        tip.appendChild(el);
      }
      const r = tip.getBoundingClientRect();
      const px = Math.min(window.innerWidth - r.width - 12, x + 14);
      const py = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
      tip.style.left = Math.max(8, px) + "px";
      tip.style.top = Math.max(8, py) + "px";
      tip.classList.add("visible");
    },
    ocultar() { tip.classList.remove("visible"); },
  };
}

// ---- bus simple para sincronizar el avance 4D entre el visor, el Gantt y la curva S
export const bus = new EventTarget();
export const emitir = (tipo, detalle) => bus.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));
export const escuchar = (tipo, fn) => bus.addEventListener(tipo, (e) => fn(e.detail));

// respeta «reducir movimiento» del sistema; con localStorage animar=1 (clase .animar) se ve la versión completa
export const reducirMovimiento = () =>
  !document.documentElement.classList.contains("animar") && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function webglDisponible() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}
