// Visor 3D de proyecto. Dos modelos:
//  · vivienda: la misma geometría que genera el modelo de Revit (muros con vanos, losas, escaleras, columnas)
//    con modos Modelo / Tipologías, niveles, separación de niveles y vista en planta.
//  · tienda: prismas leídos de los planos vectoriales de Huancayo, con la simulación de obra 4D
//    (cronograma de MS Project): primero lo existente, luego cada partida en su semana.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { $, $$, json, fecha, numero, emitir, escuchar, aFecha, DIA, reducirMovimiento } from "./util.js?v=12";

const CORTE = 1.2;                         // altura del plano de corte en la vista en planta
const OBRA = 0xf0a23a;                     // resaltado de lo que se está construyendo esa semana

export async function iniciar(raiz) {
  const tipo = raiz.dataset.tipo;
  const [D, CR] = await Promise.all([json(raiz.dataset.modelo), raiz.dataset.cronograma ? json(raiz.dataset.cronograma) : null]);
  const lienzo = $(".visor__lienzo", raiz);

  // ------------------------------------------------ escena común
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = false;
  lienzo.prepend(renderer.domElement);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", raiz.dataset.descripcion || "Modelo 3D del proyecto");

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 0.2, 600);
  escena.add(new THREE.HemisphereLight(0xffffff, 0xd6d3cc, 1.6));
  const sol = new THREE.DirectionalLight(0xfffaf2, 1.9);
  sol.position.set(-22, 40, 30);
  escena.add(sol);
  const contra = new THREE.DirectionalLight(0xffffff, 0.55);
  contra.position.set(30, 18, -25);
  escena.add(contra);

  const M = tipo === "tienda" ? construirTienda(D, escena) : construirVivienda(D, escena);

  // ------------------------------------------------ cámara y controles
  const controles = new OrbitControls(camara, renderer.domElement);
  Object.assign(controles, { enableDamping: true, dampingFactor: 0.09, enableZoom: false, minDistance: 6, maxDistance: 140, maxPolarAngle: 1.45 });
  renderer.domElement.style.touchAction = "pan-y";
  // la rueda solo acerca después de hacer clic en el modelo (no secuestra el scroll de la página)
  renderer.domElement.addEventListener("pointerdown", () => { controles.enableZoom = true; });
  renderer.domElement.addEventListener("pointerleave", () => { controles.enableZoom = false; });
  const asp0 = Math.max(0.4, lienzo.clientWidth / Math.max(1, lienzo.clientHeight));
  const VISTA = { pos: M.vista.pos.clone().multiplyScalar(asp0 < 1.1 ? Math.min(2.0, 1.1 / Math.pow(asp0, 0.8)) : 1), obj: M.vista.obj.clone() };
  camara.position.copy(VISTA.pos);
  controles.target.copy(VISTA.obj);

  let pedido = false;
  const dibujar = () => { pedido = false; if (controles.update()) pedir(); renderer.render(escena, camara); };
  const pedir = () => { if (!pedido) { pedido = true; requestAnimationFrame(dibujar); } };
  controles.addEventListener("change", pedir);
  const ajustar = () => {
    const w = lienzo.clientWidth, h = lienzo.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    pedir();
  };
  new ResizeObserver(ajustar).observe(lienzo);
  ajustar();

  function volarA(pos, obj, ms = 700) {
    if (reducirMovimiento()) { camara.position.copy(pos); controles.target.copy(obj); controles.update(); pedir(); return; }
    const p0 = camara.position.clone(), o0 = controles.target.clone(), t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camara.position.lerpVectors(p0, pos, e);
      controles.target.lerpVectors(o0, obj, e);
      controles.update();
      renderer.render(escena, camara);
      if (k < 1) requestAnimationFrame(paso); else pedir();
    };
    requestAnimationFrame(paso);
  }

  // ------------------------------------------------ estado
  const E = { modo: "modelo", nivel: "todos", planta: false, separar: 0, semana: CR ? CR.semanas : 0, enfasis: null, capas: new Set() };
  const plano = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const aplicar = () => {
    M.aplicar(E, CR);
    renderer.clippingPlanes = E.planta ? [plano] : [];
    plano.constant = M.cotaCorte(E) + CORTE + 0.03;
    pedir();
  };

  // ------------------------------------------------ barra de herramientas
  const info = $(".visor__info", raiz), obra = $(".visor__obra", raiz), pista = $(".visor__pista", raiz);
  const fijarModo = (modo) => {
    E.modo = modo;
    if (obra) obra.hidden = E.modo !== "4d";
    if (pista) pista.hidden = E.modo === "4d";
    if (E.modo !== "tipologias") { E.enfasis = null; info.hidden = true; }
    else mostrarLeyenda();
    if (E.modo === "4d" && E.semana >= CR.semanas) fijarSemana(Math.round(CR.semanas * 0.45));
    aplicar();
  };
  $("[data-visor-modo]", raiz)?.addEventListener("cambio", (e) => fijarModo(e.detail.dataset.modo));
  const botonPlanta = $("[data-planta]", raiz);
  const vistaPlanta = () => {
    const y = M.cotaCorte(E);
    controles.maxPolarAngle = 0.35;
    volarA(new THREE.Vector3(M.vista.obj.x, y + M.vista.alturaPlanta, M.vista.obj.z + 0.01), new THREE.Vector3(M.vista.obj.x, y, M.vista.obj.z));
  };
  botonPlanta?.addEventListener("click", () => {
    E.planta = !E.planta;
    botonPlanta.setAttribute("aria-pressed", String(E.planta));
    aplicar();
    if (E.planta) vistaPlanta();
    else { controles.maxPolarAngle = 1.45; volarA(VISTA.pos, VISTA.obj); }
  });
  $("[data-reencuadrar]", raiz)?.addEventListener("click", () => {
    if (E.planta) vistaPlanta(); else volarA(VISTA.pos, VISTA.obj);
  });
  const botonesNivel = $$("[data-nivel]", raiz);
  botonesNivel.forEach((b) => b.addEventListener("click", () => {
    E.nivel = b.dataset.nivel;
    botonesNivel.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const t = $("[data-nivel-texto]", raiz);
    if (t) t.textContent = b.dataset.nivel === "todos" ? "Pisos" : b.getAttribute("aria-label");
    aplicar();
    if (E.planta) vistaPlanta();
  }));
  const separar = $("[data-separar]", raiz);
  if (separar) E.separar = +separar.value;
  separar?.addEventListener("input", (e) => { E.separar = +e.target.value; aplicar(); });
  $$("[data-capa]", raiz).forEach((c) => {
    if (!c.checked) E.capas.add(c.dataset.capa);
    c.addEventListener("change", () => { c.checked ? E.capas.delete(c.dataset.capa) : E.capas.add(c.dataset.capa); aplicar(); });
  });

  // leyenda de tipologías (vivienda): cada entrada resalta su tipología
  function mostrarLeyenda() {
    if (!M.tipologias) return;
    info.replaceChildren();
    const t = document.createElement("b");
    t.textContent = "Tipologías · toca para resaltar";
    info.appendChild(t);
    const lista = document.createElement("div");
    lista.className = "opciones";
    lista.style.cssText = "display:grid;gap:2px;margin-top:.4rem";
    for (const [tip, color, area] of M.tipologias) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "visor__herr";
      b.style.cssText = "width:100%;justify-content:flex-start;min-height:32px;padding:0 .5rem";
      b.setAttribute("aria-pressed", String(E.enfasis === tip));
      const i = document.createElement("i");
      i.style.cssText = `width:12px;height:12px;border-radius:3px;background:${color}`;
      const s = document.createElement("span");
      s.textContent = `${tip} · ${numero(area, 0)} m²`;
      b.append(i, s);
      b.addEventListener("click", () => { E.enfasis = E.enfasis === tip ? null : tip; mostrarLeyenda(); aplicar(); });
      lista.appendChild(b);
    }
    info.appendChild(lista);
    info.hidden = false;
  }

  // clic en una unidad (tipologías) o en un elemento (tienda): ficha breve
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let abajo = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { abajo = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camara);
    const hit = ray.intersectObjects(M.seleccionables(E), false).find((h) => !E.planta || h.point.y <= plano.constant + 0.01);
    const ficha = hit && M.ficha(hit.object, E, CR);
    if (!ficha) { if (E.modo !== "tipologias") info.hidden = true; return; }
    info.replaceChildren();
    const b = document.createElement("b"); b.textContent = ficha[0];
    info.appendChild(b);
    for (const linea of ficha.slice(1)) { const s = document.createElement("span"); s.textContent = linea; info.appendChild(s); }
    info.hidden = false;
  });

  // ------------------------------------------------ obra 4D (tienda)
  let fijarSemana = () => {};
  if (CR && obra) {
    const rango = $("[data-semana]", raiz), texto = $("[data-semana-texto]", raiz), play = $("[data-reproducir]", raiz);
    const inicio = aFecha(CR.inicio);
    rango.max = CR.semanas;
    fijarSemana = (s, origen = "visor") => {
      E.semana = Math.max(0, Math.min(CR.semanas, Math.round(s)));
      rango.value = E.semana;
      const f = new Date(inicio.getTime() + (7 * E.semana - 1) * DIA);
      const enObra = CR.tareas.filter((t) => !t.resumen && !t.hito && E.semana > 0 && aFecha(t.inicio) <= f && f <= aFecha(t.fin)).map((t) => t.nombre);
      texto.replaceChildren();
      const b = document.createElement("b");
      b.textContent = E.semana === 0 ? "Semana 0 · local recibido" : `Semana ${E.semana} de ${CR.semanas} · al ${fecha(f.toISOString().slice(0, 10))}`;
      texto.append(b, document.createTextNode(enObra.length ? ` · En obra: ${enObra.slice(0, 3).join("; ")}${enObra.length > 3 ? "…" : ""}` : E.semana >= CR.semanas ? " · tienda entregada" : ""));
      if (origen !== "bus") emitir("avance", { semana: E.semana, origen: "visor" });
      if (E.modo === "4d") aplicar();
    };
    rango.addEventListener("input", () => fijarSemana(+rango.value));
    escuchar("avance", (d) => { if (d.origen !== "visor") fijarSemana(d.semana, "bus"); });
    let reloj = null;
    const icono = (pausa) => pausa
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
    const parar = () => { clearInterval(reloj); reloj = null; play.innerHTML = icono(false); play.setAttribute("aria-label", "Reproducir la obra semana a semana"); };
    play.addEventListener("click", () => {
      if (reloj) return parar();
      if (E.semana >= CR.semanas) fijarSemana(0);
      play.innerHTML = icono(true);
      play.setAttribute("aria-label", "Pausar");
      reloj = setInterval(() => { if (E.semana >= CR.semanas) return parar(); fijarSemana(E.semana + 1); }, reducirMovimiento() ? 900 : 650);
    });
    fijarSemana(CR.semanas, "bus");
  }

  // si se eligió un modo mientras el modelo cargaba, el visor empieza en ese modo
  const elegido = $('[data-visor-modo] [aria-checked="true"]', raiz)?.dataset.modo;
  if (elegido && elegido !== E.modo) fijarModo(elegido); else aplicar();
  $(".visor__cargando", raiz)?.remove();
}

// ===================================================================================== utilidades
const caja = (largo, alto, esp, ang, x, y, z) => {
  const g = new THREE.BoxGeometry(largo, alto, esp);
  g.rotateY(ang);
  g.translate(x, y, z);
  return g;
};
const aristas = (malla, opacidad = 0.22, color = 0x2a2a30) =>
  malla.add(new THREE.LineSegments(new THREE.EdgesGeometry(malla.geometry, 30), new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacidad })));

function suelo(escena, ancho, fondo) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(ancho, fondo), new THREE.MeshStandardMaterial({ color: 0xebeae5, roughness: 1 }));
  s.rotation.x = -Math.PI / 2;
  s.position.y = -0.14;
  escena.add(s);
  const grilla = new THREE.GridHelper(Math.max(ancho, fondo), Math.round(Math.max(ancho, fondo)), 0xcfcdc6, 0xdddbd5);
  grilla.position.y = -0.13;
  grilla.material.transparent = true;
  grilla.material.opacity = 0.55;
  escena.add(grilla);
}

// ===================================================================================== VIVIENDA
function construirVivienda(D, escena) {
  const NIV = ["N1", "N2", "N3", "N4", "N5", "AZ"];
  const P = ([X, Y]) => [X - 10, -(Y - 7.5)];
  const cota = Object.fromEntries(D.niveles.map((n) => [n.id, n.cota]));
  const nombreNivel = Object.fromEntries(D.niveles.map((n) => [n.id, n.nombre]));
  suelo(escena, 64, 52);
  const lote = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(D.lote.map((p) => { const [x, z] = P(p); return new THREE.Vector3(x, -0.1, z); })),
    new THREE.LineBasicMaterial({ color: 0x55555c, transparent: true, opacity: 0.5 }));
  escena.add(lote);
  const ejes = new THREE.Group();
  for (const e of D.ejes) {
    const [x1, z1] = P(e.p1), [x2, z2] = P(e.p2);
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, -0.09, z1), new THREE.Vector3(x2, -0.09, z2)]),
      new THREE.LineDashedMaterial({ color: 0x55555c, dashSize: 0.6, gapSize: 0.35, transparent: true, opacity: 0.4 }));
    l.computeLineDistances();
    ejes.add(l);
  }
  escena.add(ejes);

  const MAT = {
    muro: new THREE.MeshStandardMaterial({ color: 0xf3f1ed, roughness: 0.9 }),
    losa: new THREE.MeshStandardMaterial({ color: 0xd8d4cd, roughness: 0.95 }),
    columna: new THREE.MeshStandardMaterial({ color: 0xb9b3aa, roughness: 0.85 }),
    vidrio: new THREE.MeshStandardMaterial({ color: 0xa6cad3, roughness: 0.15, transparent: true, opacity: 0.5 }),
    puerta: new THREE.MeshStandardMaterial({ color: 0x9a7456, roughness: 0.8 }),
    escalera: new THREE.MeshStandardMaterial({ color: 0xcdc8c0, roughness: 0.9 }),
    fantasma: new THREE.MeshStandardMaterial({ color: 0xdedbd5, roughness: 1, transparent: true, opacity: 0.14, depthWrite: false }),
    poche: new THREE.MeshBasicMaterial({ color: 0x55555c }),
    pocheCol: new THREE.MeshBasicMaterial({ color: 0x151517 }),
    vidrioCorte: new THREE.MeshBasicMaterial({ color: 0x5b8ea6 }),
  };
  const piezas = {};
  const agregar = (clave, tipo, g) => (((piezas[clave] ||= {})[tipo] ||= []).push(g));
  const vanosPorMuro = {};
  for (const v of D.vanos) (vanosPorMuro[v.muro] ||= []).push(v);
  for (const m of D.muros) {
    const [x1, z1] = P(m.p1), [x2, z2] = P(m.p2);
    const L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, ang = Math.atan2(-uz, ux);
    const t = D.tipos_muro[m.tipo].espesor, base = cota[m.nivel];
    const H = m.tope ? cota[m.tope] - base - 0.2 : m.altura;
    const pieza = (a, b, y0, y1) => {
      if (b - a <= 0.01 || y1 - y0 <= 0.01) return;
      const cx = x1 + ux * (a + b) / 2, cz = z1 + uz * (a + b) / 2;
      agregar("muros:" + m.nivel, "muro", caja(b - a, y1 - y0, t, ang, cx, base + (y0 + y1) / 2, cz));
      if (y0 <= CORTE && y1 >= CORTE) agregar("corte:" + m.nivel, "poche", caja(b - a, 0.02, t, ang, cx, base + CORTE, cz));
    };
    let s = 0;
    const vs = (vanosPorMuro[m.id] || []).map((v) => ({ a: v.dist_inicio - v.ancho / 2, b: v.dist_inicio + v.ancho / 2, v })).sort((p, q) => p.a - q.a);
    for (const o of vs) {
      const y0 = o.v.alfeizar, y1 = Math.min(o.v.alfeizar + o.v.alto, H);
      pieza(s, o.a, 0, H);
      pieza(o.a, o.b, 0, y0);
      pieza(o.a, o.b, y1, H);
      s = o.b;
      const puerta = o.v.categoria === "puerta", c = (o.a + o.b) / 2;
      agregar("vanos:" + m.nivel, puerta ? "puerta" : "vidrio",
        caja(o.b - o.a - (puerta ? 0.06 : 0.02), y1 - y0 - 0.02, puerta ? 0.045 : 0.025, ang, x1 + ux * c, base + (y0 + y1) / 2, z1 + uz * c));
      if (!puerta && y0 <= CORTE && y1 >= CORTE)
        agregar("corte:" + m.nivel, "vidrioCorte", caja(o.b - o.a, 0.02, 0.05, ang, x1 + ux * c, base + CORTE, z1 + uz * c));
    }
    pieza(s, L, 0, H);
  }
  // columnas: un tramo por nivel (así se filtran y separan con su piso)
  for (const c of D.columnas || []) {
    const [x, z] = P(c.punto);
    const tc = D.tipos_columna[c.tipo];
    const i0 = NIV.indexOf(c.base), i1 = NIV.indexOf(c.tope);
    for (let i = i0; i < i1; i++) {
      const n = NIV[i], base = cota[n], alto = cota[NIV[i + 1]] - base;
      agregar("columnas:" + n, "columna", caja(tc.b + 0.01, alto, tc.h + 0.01, 0, x, base + alto / 2, z));
      agregar("corte:" + n, "pocheCol", caja(tc.b + 0.012, 0.024, tc.h + 0.012, 0, x, base + CORTE, z));
    }
  }
  const forma = (poli) => new THREE.Shape(poli.map(([X, Y]) => new THREE.Vector2(X - 10, Y - 7.5)));
  for (const l of D.losas) {
    const esp = D.tipos_losa[l.tipo].espesor;
    const f = forma(l.contorno);
    for (const h of l.huecos) f.holes.push(new THREE.Path(h.map(([X, Y]) => new THREE.Vector2(X - 10, Y - 7.5))));
    const g = new THREE.ExtrudeGeometry(f, { depth: esp, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, cota[l.nivel] - esp, 0);
    agregar("losa:" + l.nivel, "losa", g);
  }
  for (const e of D.escaleras) {
    const base = cota[e.base], alto = cota[e.tope] - base;
    const porTramo = e.contrahuellas / e.tramos.length, hr = alto / e.contrahuellas;
    e.tramos.forEach((tr, k) => {
      const [x1, z1] = P(tr.p1), [x2, z2] = P(tr.p2);
      const L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, ang = Math.atan2(-uz, ux);
      const pasos = Math.round(L / e.huella), y0 = base + k * porTramo * hr;
      for (let i = 0; i < pasos; i++) {
        const h = (i + 1) * hr, c = (i + 0.5) * e.huella;
        agregar("escaleras:" + e.base, "escalera", caja(e.huella, h, tr.ancho, ang, x1 + ux * c, y0 + h / 2, z1 + uz * c));
      }
    });
    if (e.descanso) {
      const xs = e.descanso.map((p) => P(p)[0]), zs = e.descanso.map((p) => P(p)[1]);
      agregar("escaleras:" + e.base, "escalera", caja(Math.max(...xs) - Math.min(...xs), 0.15, Math.max(...zs) - Math.min(...zs), 0,
        (Math.max(...xs) + Math.min(...xs)) / 2, base + porTramo * hr - 0.075, (Math.max(...zs) + Math.min(...zs)) / 2));
    }
  }
  const grupoNivel = Object.fromEntries(NIV.map((n) => [n, new THREE.Group()]));
  NIV.forEach((n) => escena.add(grupoNivel[n]));
  const mallas = {};
  for (const [clave, porTipo] of Object.entries(piezas)) {
    const nivel = clave.split(":")[1];
    for (const [t, geos] of Object.entries(porTipo)) {
      const malla = new THREE.Mesh(mergeGeometries(geos), MAT[t]);
      malla.userData.base = MAT[t];
      malla.userData.clave = clave;
      if (t === "muro" || t === "losa" || t === "columna") aristas(malla, t === "columna" ? 0.35 : 0.2);
      grupoNivel[nivel].add(malla);
      (mallas[clave] ||= []).push(malla);
    }
  }
  const matsTipo = {};
  for (const [tip, color] of Object.entries(D.colores_tipologia))
    matsTipo[tip] = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const unidades = [];
  for (const u of D.unidades_vivienda) {
    const g = new THREE.ExtrudeGeometry(forma(u.poligono), { depth: 2.45, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, cota[u.nivel] + 0.05, 0);
    const m = new THREE.Mesh(g, matsTipo[u.tipologia]);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
    m.userData.unidad = u;
    m.visible = false;
    grupoNivel[u.nivel].add(m);
    unidades.push(m);
  }
  const celosia = new THREE.Group();
  const tex = texturaCelosia();
  for (const c of D.celosias) {
    const [x1, z1] = P(c.p1), [x2, z2] = P(c.p2);
    const L = Math.hypot(x2 - x1, z2 - z1), alto = cota[c.tope] - cota[c.base];
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(L / 0.55, alto / 0.55);
    const g = new THREE.PlaneGeometry(L, alto);
    g.rotateY(Math.atan2(-(z2 - z1) / L, (x2 - x1) / L));
    g.translate((x1 + x2) / 2, cota[c.base] + alto / 2, (z1 + z2) / 2);
    celosia.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 })));
  }
  escena.add(celosia);
  const areas = {};
  for (const u of D.unidades_vivienda) areas[u.tipologia] = (areas[u.tipologia] || 0) + u.area;

  return {
    vista: { pos: new THREE.Vector3(27, 21, 33), obj: new THREE.Vector3(0, 6, 0), alturaPlanta: 34 },
    tipologias: Object.entries(D.colores_tipologia).map(([t, c]) => [t, c, areas[t] || 0]),
    cotaCorte: (E) => { const n = E.nivel === "todos" ? "N1" : E.nivel; return cota[n] + NIV.indexOf(n) * E.separar; },
    seleccionables: (E) => E.modo === "tipologias" ? unidades.filter((m) => m.visible && m.parent.visible) : [],
    ficha: (obj) => { const u = obj.userData.unidad; return u ? [u.nombre, `${nombreNivel[u.nivel]} · ${u.tipologia}`, `Área bruta ${numero(u.area, 1)} m²`] : null; },
    aplicar(E) {
      const soloUno = E.nivel !== "todos";
      NIV.forEach((n, i) => { grupoNivel[n].visible = !soloUno || n === E.nivel; grupoNivel[n].position.y = i * E.separar; });
      for (const [clave, lista] of Object.entries(mallas)) {
        const t = clave.split(":")[0];
        for (const m of lista) {
          if (t === "corte") { m.visible = E.planta && E.modo !== "tipologias"; continue; }
          if (E.modo === "tipologias") { m.visible = t === "muros" || t === "losa" || t === "columnas"; m.material = t === "losa" ? m.userData.base : MAT.fantasma; }
          else { m.visible = true; m.material = m.userData.base; }
          m.children.forEach((c) => (c.visible = E.modo !== "tipologias"));
        }
      }
      for (const m of unidades) m.visible = E.modo === "tipologias";
      for (const [tip, mat] of Object.entries(matsTipo)) {
        const apagar = E.enfasis && E.enfasis !== tip;
        mat.color.set(apagar ? 0xd9d6d0 : D.colores_tipologia[tip]);
        mat.opacity = apagar ? 0.28 : 0.9;
      }
      celosia.visible = E.modo !== "tipologias" && !soloUno && E.separar < 0.05 && !E.planta;
      ejes.visible = E.planta || E.modo !== "tipologias";
    },
  };
}

function texturaCelosia() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.strokeStyle = "#b8704f";
  x.lineWidth = 9;
  x.lineCap = "square";
  x.beginPath();
  x.moveTo(0, 0); x.lineTo(64, 64);
  x.moveTo(64, 0); x.lineTo(0, 64);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ===================================================================================== TIENDA (4D)
function construirTienda(D, escena) {
  const [cx, cy] = D.centro;
  suelo(escena, 40, 44);
  const MAT = {};
  for (const [k, m] of Object.entries(D.materiales)) {
    MAT[k] = new THREE.MeshStandardMaterial({
      color: m.color, roughness: k === "vidrio" ? 0.1 : k === "acero" || k === "negro" ? 0.55 : 0.85,
      metalness: k === "acero" ? 0.35 : 0, transparent: !!m.opacidad, opacity: m.opacidad ?? 1, depthWrite: !m.opacidad,
      emissive: m.emisivo ? m.color : 0x000000, emissiveIntensity: m.emisivo || 0,
    });
  }
  MAT.obra = new THREE.MeshStandardMaterial({ color: OBRA, roughness: 0.8 });
  MAT.poche = new THREE.MeshBasicMaterial({ color: 0x4a4a52 });
  MAT.pocheCol = new THREE.MeshBasicMaterial({ color: 0x141416 });

  // prisma -> geometría (en la escena: x = X - cx, z = -(Y - cy), y = altura)
  const geo = (pr) => {
    if (pr.z) {
      const f = new THREE.Shape(pr.p.map(([X, Y]) => new THREE.Vector2(X - cx, Y - cy)));
      const g = new THREE.ExtrudeGeometry(f, { depth: pr.z[1] - pr.z[0], bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, pr.z[0], 0);
      return g;
    }
    const f = new THREE.Shape(pr.p.map(([X, Z]) => new THREE.Vector2(X - cx, Z)));
    const g = new THREE.ExtrudeGeometry(f, { depth: pr.y[1] - pr.y[0], bevelEnabled: false });
    g.translate(0, 0, -(pr.y[1] - cy));
    return g;
  };
  const piezas = {}, cortes = {};
  for (const pr of D.prismas) {
    ((piezas[pr.g] ||= {})[pr.m] ||= []).push(geo(pr));
    const cortable = pr.z && (pr.g === "exist:muros" || pr.g === "exist:columnas" || pr.g === "obra:muros-sshh");
    if (cortable && pr.z[0] <= CORTE && pr.z[1] >= CORTE)
      (cortes[pr.g === "exist:columnas" ? "pocheCol" : "poche"] ||= []).push(geo({ ...pr, z: [CORTE, CORTE + 0.02] }));
  }
  const raizModelo = new THREE.Group();
  escena.add(raizModelo);
  const mallas = {};
  for (const [g, porMat] of Object.entries(piezas)) {
    for (const [mk, geos] of Object.entries(porMat)) {
      const malla = new THREE.Mesh(mergeGeometries(geos), MAT[mk]);
      malla.userData = { grupo: g, base: mk };
      if (!["vidrio", "luz"].includes(mk) && !g.startsWith("obra:luminarias")) aristas(malla, g.startsWith("exist") ? 0.18 : 0.26);
      raizModelo.add(malla);
      (mallas[g] ||= []).push(malla);
    }
  }
  const mallasCorte = Object.entries(cortes).map(([mk, geos]) => { const m = new THREE.Mesh(mergeGeometries(geos), MAT[mk]); raizModelo.add(m); return m; });
  const capa = (g) => g.startsWith("exist") ? "exist" : /fachada|mampara|letrero/.test(g) ? "fachada" : /mobiliario|graficos/.test(g) ? "mobiliario" : /luminarias/.test(g) ? "luces" : "obra";

  // estado 4D de cada grupo según la semana
  const tareaPorId = (CR, id) => CR.tareas.find((t) => t.id === id);
  const fechaSemana = (CR, s) => new Date(aFecha(CR.inicio).getTime() + (7 * s - 1) * DIA);
  function estado(CR, E, g) {
    const id = CR.mapa_4d[g];
    if (!id) return null;
    const t = tareaPorId(CR, id), f = fechaSemana(CR, E.semana);
    if (E.semana === 0 || f < aFecha(t.inicio)) return "oculto";
    return f <= aFecha(t.fin) ? "obra" : "listo";
  }
  function materialCambios(CR, E, g) {
    const lista = CR.cambios_4d.filter((c) => c.grupo === g);
    if (!lista.length) return null;
    const f = fechaSemana(CR, E.semana);
    let mk = lista[0].antes;
    for (const c of lista) {
      const t = tareaPorId(CR, c.tarea);
      if (E.semana === 0 || f < aFecha(t.inicio)) break;
      if (f <= aFecha(t.fin)) return "obra";
      mk = c.despues;
    }
    return mk;
  }
  const nombres = D.grupos;
  return {
    vista: { pos: new THREE.Vector3(-13, 33, 25), obj: new THREE.Vector3(0.5, 0.5, -0.5), alturaPlanta: 36 },
    cotaCorte: () => 0,
    seleccionables: () => Object.values(mallas).flat().filter((m) => m.visible),
    ficha: (obj, E, CR) => {
      const g = obj.userData.grupo;
      if (!g || !nombres[g]) return null;
      const lineas = [nombres[g]];
      const id = CR?.mapa_4d[g] ?? CR?.cambios_4d.find((c) => c.grupo === g)?.tarea;
      if (id) {
        const t = tareaPorId(CR, id);
        lineas.push(`${t.nombre}`, `${fecha(t.inicio)} → ${fecha(t.fin)} · ${t.dias} días${t.critica ? " · ruta crítica" : ""}`);
      } else if (g.startsWith("exist")) lineas.push("Existente: el local ya era de albañilería confinada");
      return lineas;
    },
    aplicar(E, CR) {
      for (const [g, lista] of Object.entries(mallas)) {
        const oculta = E.capas.has(capa(g));
        const est = E.modo === "4d" ? estado(CR, E, g) : null;
        const mk = E.modo === "4d" ? materialCambios(CR, E, g) : null;
        for (const m of lista) {
          m.visible = !oculta && est !== "oculto";
          m.material = est === "obra" || mk === "obra" ? MAT.obra : mk ? MAT[mk] : MAT[m.userData.base];
          if (m.userData.base === "vidrio" || m.userData.base === "luz") m.material = est === "obra" ? MAT.obra : MAT[m.userData.base];
        }
      }
      for (const m of mallasCorte) m.visible = E.planta && !E.capas.has("exist");
    },
  };
}
