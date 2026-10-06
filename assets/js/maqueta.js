// Maqueta de portada: volúmenes de "arcilla" blanca sobre un tablero de corcho, con una colina de cartón,
// árboles de espuma y, bajo cada proyecto, una placa de acrílico de su color. Se dibuja solo cuando algo cambia.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { json, reducirMovimiento } from "./util.js?v=12";

const C = {
  corcho: 0xdcc6a4, cantoTablero: 0xb99c77, arcilla: 0xf7f6f3, arcillaHover: 0xffffff, linea: 0x3a3a40,
  carton: [0xd9d1c4, 0xcac1b2], curva: 0x8a7154, vidrio: 0xcfe3e8,
  copa: [0xa6bb8e, 0x93ad7d, 0xbccaa2], tronco: 0x9a7b5c, techo: 0xb5c49c,   // techo: los techos verdes (esponja)
};
const TAB = { w: 170, d: 116 };   // tablero de la maqueta (unidades de maqueta)
const AMPLIACION = 0.3;            // opacidad de las ampliaciones futuras (material «ampliacion» en proyectos.json)

export async function iniciar(cont, capa, pista) {
  const cfg = await json(cont.dataset.proyectos);
  // maqueta arriba y texto debajo (la misma consulta que en styles.css)
  const movil = matchMedia("(max-width: 900px), (max-aspect-ratio: 1/1)").matches;
  const tactil = matchMedia("(pointer: coarse)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, movil ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !movil;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  cont.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Maqueta 3D con los proyectos");

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(26, 1, 1, 1200);
  // centro del conjunto (los proyectos van a la misma escala); en pantallas angostas se corre para centrarlo
  const objetivo = movil ? new THREE.Vector3(2, 3, -8) : new THREE.Vector3(0, 3, -5);

  // luz cálida de tarde, con un contraluz rosado que dibuja los cantos
  escena.add(new THREE.HemisphereLight(0xfffaf4, 0xe0d2bf, 1.5));
  const sol = new THREE.DirectionalLight(0xfff0dc, 2.35);
  sol.position.set(-70, 120, 80);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -110, right: 110, top: 90, bottom: -90, near: 20, far: 400 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.03;
  escena.add(sol);
  const contraluz = new THREE.DirectionalLight(0xffd8cf, 0.6);
  contraluz.position.set(70, 45, -120);
  escena.add(contraluz);

  // ---------- tablero de corcho, su sombra y la topografía de cartón
  const lado = new THREE.MeshStandardMaterial({ color: C.cantoTablero, roughness: 0.9 });
  const tapa = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texturaCorcho(), roughness: 1 });
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(TAB.w, 2.4, TAB.d), [lado, lado, tapa, lado, lado, lado]);
  tablero.position.y = -1.2;
  tablero.receiveShadow = true;
  escena.add(tablero);
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(TAB.w * 1.45, TAB.d * 1.6),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false }));
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set(4, -2.7, 6);
  escena.add(sombra);
  // la colina de cartón y sus curvas de nivel (posición y radio en data/proyectos.json)
  const cerro = { x: -64, z: -40, r: 17, ...cfg.tablero?.colina };
  colina(escena, cerro.x, cerro.z, cerro.r, 7, 1.15, [0.7, 2.1, 4.0]);
  curvasTablero(escena, cerro.x, cerro.z, cerro.r, [0.7, 2.1, 4.0]);

  // ---------- proyectos
  const piezas = [];
  for (const p of cfg.proyectos) {
    const m = p.maqueta;
    const grupo = new THREE.Group();
    const mats = [];
    if (m.fuente === "tienda") await volumenTienda(grupo, m.datos, mats, p.acrilico);
    else if (m.fuente === "vivienda") await volumenVivienda(grupo, m.datos, mats);
    else for (const v of m.volumenes) grupo.add(primitiva(v, mats));
    placaAcrilico(grupo, p.acrilico, m.margen ?? 3);
    grupo.position.set(m.x, 0, m.z);
    grupo.rotation.y = m.giro || 0;
    grupo.scale.setScalar(m.escala || 1);
    grupo.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = !o.userData.placa && !o.userData.ampliacion;   // la ampliación es una proyección: no da sombra
      o.receiveShadow = !o.userData.ampliacion;
      o.userData.id = p.id;
    });
    escena.add(grupo);
    // la etiqueta va sobre lo construido: no cuentan la placa ni la ampliación futura
    grupo.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    for (const h of grupo.children) if (!h.userData.placa && !h.userData.ampliacion) caja.expandByObject(h);
    const ancla = new THREE.Vector3((caja.min.x + caja.max.x) / 2, caja.max.y + 1.5, (caja.min.z + caja.max.z) / 2);
    const etiqueta = crearEtiqueta(p);
    capa.appendChild(etiqueta);
    piezas.push({ id: p.id, grupo, mats, etiqueta, ancla, url: p.url });
  }
  // árboles de espuma en grupos, solo donde no hay proyectos ni colina
  arboles(escena, cerro, piezas.map((pz) => new THREE.Box3().setFromObject(pz.grupo)), !movil);

  const controles = new OrbitControls(camara, renderer.domElement);
  controles.target.copy(objetivo);
  Object.assign(controles, { enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false, rotateSpeed: 0.55, minPolarAngle: 0.45, maxPolarAngle: 1.22 });
  renderer.domElement.style.touchAction = "pan-y";

  let pedido = false;
  const v = new THREE.Vector3();
  function ubicarEtiquetas() {
    const w = cont.clientWidth, h = cont.clientHeight;
    const ox = cont.offsetLeft, oy = cont.offsetTop;
    const L = piezas.map((pz) => {
      v.copy(pz.ancla).project(camara);
      // la placa nunca sale de la pantalla: se corre hacia adentro si el volumen está en el borde
      const medio = (pz.ancho ||= pz.etiqueta.offsetWidth) / 2;
      const alto = (pz.alto ||= pz.etiqueta.firstElementChild.offsetHeight);
      return {
        pz, medio, alto, palo: 24,
        vis: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.05,
        x: Math.max(medio + 8, Math.min(w - medio - 8, (v.x * 0.5 + 0.5) * w)),
        y: (-v.y * 0.5 + 0.5) * h,
      };
    });
    // si dos placas se pisan, la de arriba sube y su palito se alarga hasta su volumen
    L.sort((a, b) => b.y - a.y);
    for (let i = 1; i < L.length; i++) for (let j = 0; j < i; j++) {
      const a = L[i], b = L[j];
      if (!a.vis || !b.vis || Math.abs(a.x - b.x) >= a.medio + b.medio + 6) continue;
      const techoB = b.y - b.palo - b.alto, pisoA = a.y - a.palo;
      if (pisoA > techoB - 5) a.palo += pisoA - (techoB - 5);
    }
    for (const e of L) {
      e.pz.etiqueta.style.opacity = e.vis ? "1" : "0";
      e.pz.etiqueta.style.setProperty("--palo", `${Math.round(e.palo)}px`);
      e.pz.etiqueta.style.transform = `translate(${ox + e.x}px, ${oy + e.y}px) translate(-50%, -100%)`;
    }
  }
  function dibujar() {
    pedido = false;
    const mueve = controles.update();
    renderer.render(escena, camara);
    ubicarEtiquetas();
    if (mueve) pedir();
  }
  const pedir = () => { if (!pedido) { pedido = true; requestAnimationFrame(dibujar); } };
  controles.addEventListener("change", pedir);

  // encuadre: se busca la distancia y se corre la vista para que todos los proyectos (con sus etiquetas) queden dentro.
  // En escritorio, además, la esquina izquierda y el fondo del tablero quedan a la vista, con aire arriba (la isla y
  // las etiquetas), abajo (la pista) y a la izquierda (el borde difuminado del lienzo); el tablero puede seguir más allá
  // del borde derecho de la pantalla, como una mesa grande. En el celular solo cuentan los proyectos, con poco margen.
  const dirInicial = new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, 1.0, 0.52));
  const esquinas = [];
  for (const x of [-TAB.w / 2, TAB.w / 2]) for (const z of [-TAB.d / 2, TAB.d / 2]) for (const y of [0, -2.4]) esquinas.push(new THREE.Vector3(x, y, z));
  const puntosPiezas = [];
  for (const pz of piezas) {
    const b = new THREE.Box3().setFromObject(pz.grupo);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) puntosPiezas.push(new THREE.Vector3(x, y, z));
  }
  let distancia = 0, corrida = [0, 0];
  function encuadrar(w, h) {
    const lim = movil
      ? { izq: -1 + 2 * 12 / w, der: 1 - 2 * 12 / w, arriba: 1 - 2 * 10 / h, abajo: -1 + 2 * 14 / h }
      : { izq: -1 + 2 * Math.max(60, w * 0.1) / w, der: 1 - 2 * Math.max(24, w * 0.05) / w, arriba: 1 - 2 * 96 / h, abajo: -1 + 2 * 100 / h };
    const etq = 2 * (movil ? 50 : 64) / h;   // una etiqueta con su palito, sobre su volumen (en coordenadas de pantalla)
    const cam = new THREE.PerspectiveCamera(camara.fov, w / h, 1, 1200);
    let dist = 300, caja;
    for (let i = 0; i < 6; i++) {
      cam.position.copy(dirInicial).multiplyScalar(dist).add(objetivo);
      cam.lookAt(objetivo);
      cam.updateMatrixWorld();
      caja = [Infinity, -Infinity, Infinity, -Infinity];
      if (!movil) for (const p of esquinas) {   // del tablero cuentan su esquina izquierda y su fondo
        v.copy(p).project(cam);
        caja[0] = Math.min(caja[0], v.x); caja[3] = Math.max(caja[3], v.y);
      }
      for (const p of puntosPiezas) {    // los proyectos, enteros
        v.copy(p).project(cam);
        caja = [Math.min(caja[0], v.x), Math.max(caja[1], v.x), Math.min(caja[2], v.y), Math.max(caja[3], v.y)];
      }
      for (const pz of piezas) caja[3] = Math.max(caja[3], v.copy(pz.ancla).project(cam).y + etq);
      if (i < 5) dist *= Math.max((caja[1] - caja[0]) / (lim.der - lim.izq), (caja[3] - caja[2]) / (lim.arriba - lim.abajo));
    }
    const dx = (lim.izq + lim.der - caja[0] - caja[1]) / 2, dy = (lim.abajo + lim.arriba - caja[2] - caja[3]) / 2;
    distancia = dist;
    corrida = [-dx * w / 2, dy * h / 2];
  }

  let listo = false;
  function ajustar() {
    const w = cont.clientWidth, h = cont.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    encuadrar(w, h);
    camara.setViewOffset(w, h, corrida[0], corrida[1], w, h);
    // si cambia el tamaño de la ventana, la cámara se acerca o se aleja sin perder el giro que le dio la persona
    if (listo) camara.position.sub(objetivo).setLength(distancia).add(objetivo);
    camara.updateProjectionMatrix();
    for (const pz of piezas) pz.ancho = pz.alto = 0;
    pedir();
  }
  new ResizeObserver(ajustar).observe(cont);

  const esf = new THREE.Spherical();
  function posicionFinal() {
    esf.set(distancia, 1.0, 0.52);
    return new THREE.Vector3().setFromSpherical(esf).add(objetivo);
  }
  ajustar();
  const fin = posicionFinal();
  listo = true;
  if (reducirMovimiento()) { camara.position.copy(fin); controles.update(); pedir(); }
  else {
    const ini = new THREE.Vector3().setFromSpherical(new THREE.Spherical(fin.distanceTo(objetivo) * 1.35, 0.6, -0.25)).add(objetivo);
    const t0 = performance.now(), dur = 1900;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      camara.position.lerpVectors(ini, fin, e);
      camara.lookAt(objetivo);
      renderer.render(escena, camara);
      ubicarEtiquetas();
      if (k < 1) requestAnimationFrame(paso); else { controles.update(); pedir(); }
    };
    requestAnimationFrame(paso);
  }

  // ---------- interacción: resaltar y abrir proyecto
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const mallas = [];
  for (const pz of piezas) pz.grupo.traverse((o) => o.isMesh && mallas.push(o));
  let activo = null, abajo = null;
  const resaltar = (id) => {
    if (id === activo) return;
    activo = id;
    for (const pz of piezas) {
      const on = pz.id === id;
      pz.etiqueta.classList.toggle("activa", on);
      for (const m of pz.mats) m.color.setHex(on ? C.arcillaHover : C.arcilla);
      pz.grupo.traverse((o) => {
        if (o.userData.placa) o.material.opacity = on ? 0.9 : 0.62;
        else if (o.userData.ampliacion) o.material.opacity = on ? AMPLIACION + 0.14 : AMPLIACION;
      });
    }
    renderer.domElement.style.cursor = id ? "pointer" : "grab";
    pedir();
  };
  const tocado = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camara);
    return ray.intersectObjects(mallas, false)[0]?.object.userData.id || null;
  };
  renderer.domElement.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && !e.buttons) resaltar(tocado(e)); });
  renderer.domElement.addEventListener("pointerleave", () => resaltar(null));
  renderer.domElement.addEventListener("pointerdown", (e) => { abajo = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 6) return;
    const pz = piezas.find((p) => p.id === tocado(e));
    if (pz?.url) window.location.href = pz.url;
  });
  for (const pz of piezas) {
    pz.etiqueta.addEventListener("mouseenter", () => resaltar(pz.id));
    pz.etiqueta.addEventListener("mouseleave", () => resaltar(null));
    pz.etiqueta.addEventListener("focus", () => resaltar(pz.id));
    pz.etiqueta.addEventListener("blur", () => resaltar(null));
  }
  if (pista) pista.textContent = tactil
    ? "Desliza de lado para girar la maqueta · toca un proyecto para abrirlo"
    : "Arrastra para girar la maqueta · haz clic en un proyecto para abrirlo";
}

// ======================================================================= materiales del tablero
// corcho: base cálida con motas claras y oscuras, dibujada una vez en un lienzo y repetida
function texturaCorcho() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d");
  x.fillStyle = "#e4d4b9";
  x.fillRect(0, 0, 512, 512);
  let s = 11;
  const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const oscuro = azar() < 0.62;
    x.fillStyle = oscuro ? `rgba(150, 116, 78, ${0.16 + azar() * 0.3})` : `rgba(246, 234, 212, ${0.25 + azar() * 0.4})`;
    x.beginPath();
    x.arc(azar() * 512, azar() * 512, 0.5 + azar() * (oscuro ? 1.7 : 1.2), 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(TAB.w / 34, TAB.d / 34);
  t.anisotropy = 4;
  return t;
}
// sombra suave bajo el tablero: lo asienta sobre el fondo de color
function texturaSombra() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(128, 128, 30, 128, 128, 128);
  g.addColorStop(0, "rgba(70, 36, 34, 0.32)");
  g.addColorStop(0.55, "rgba(70, 36, 34, 0.16)");
  g.addColorStop(1, "rgba(70, 36, 34, 0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// árboles de maqueta: bolitas de espuma sobre palitos, en grupos (parques) con semilla fija
function arboles(escena, cerro, zonas, conSombra) {
  let s = 7;
  const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const hechos = [];
  const libre = (x, z, r) => {
    if (Math.abs(x) > TAB.w / 2 - 5 - r || Math.abs(z) > TAB.d / 2 - 5 - r) return false;
    if (Math.hypot(x - cerro.x, z - cerro.z) < cerro.r * 1.22 + r + 1.5) return false;
    for (const b of zonas) if (x > b.min.x - r - 2.5 && x < b.max.x + r + 2.5 && z > b.min.z - r - 2.5 && z < b.max.z + r + 2.5) return false;
    for (const h of hechos) if (Math.hypot(x - h.x, z - h.z) < h.r + r + 0.5) return false;
    return true;
  };
  for (let g = 0; g < 400 && hechos.length < 70; g++) {
    const cx = (azar() - 0.5) * TAB.w, cz = (azar() - 0.5) * TAB.d;
    if (!libre(cx, cz, 3)) continue;
    const n = 3 + Math.floor(azar() * 5);
    for (let k = 0, puestos = 0; k < 30 && puestos < n; k++) {
      const r = 1.1 + azar() * 1.0, a = azar() * Math.PI * 2, d = azar() * 7;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (libre(x, z, r)) { hechos.push({ x, z, r, h: 1.2 + azar() * 1.3, c: Math.floor(azar() * C.copa.length) }); puestos++; }
    }
  }
  if (!hechos.length) return;
  const copas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.95 }), hechos.length);
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), new THREE.MeshStandardMaterial({ color: C.tronco, roughness: 0.9 }), hechos.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
  hechos.forEach((h, i) => {
    copas.setMatrixAt(i, m.compose(new THREE.Vector3(h.x, h.h + h.r * 0.85, h.z), q, new THREE.Vector3(h.r, h.r * 0.92, h.r)));
    copas.setColorAt(i, color.setHex(C.copa[h.c]));
    troncos.setMatrixAt(i, m.compose(new THREE.Vector3(h.x, h.h / 2, h.z), q, new THREE.Vector3(1, h.h, 1)));
  });
  copas.castShadow = troncos.castShadow = conSombra;
  copas.receiveShadow = true;
  escena.add(copas, troncos);
}

// ======================================================================= geometría
function materialArcilla(mats, color = C.arcilla) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
  if (color === C.arcilla) mats.push(m);
  return m;
}
function conAristas(malla, opacidad = 0.26) {
  malla.add(new THREE.LineSegments(new THREE.EdgesGeometry(malla.geometry, 25),
    new THREE.LineBasicMaterial({ color: C.linea, transparent: true, opacity: opacidad })));
  return malla;
}

// placa de acrílico de color bajo el proyecto (se calcula con el grupo aún sin transformar)
function placaAcrilico(grupo, color, margen) {
  const caja = new THREE.Box3();
  grupo.updateMatrixWorld(true);
  for (const h of grupo.children) caja.expandByObject(h);
  const w = caja.max.x - caja.min.x + 2 * margen, d = caja.max.z - caja.min.z + 2 * margen;
  const g = new THREE.BoxGeometry(w, 0.9, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.62, emissive: color, emissiveIntensity: 0.18 });
  const placa = new THREE.Mesh(g, mat);
  placa.position.set((caja.min.x + caja.max.x) / 2, 0.45, (caja.min.z + caja.max.z) / 2);
  placa.userData.placa = true;
  placa.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })));
  grupo.add(placa);
  for (const h of grupo.children) if (h !== placa) h.position.y += 0.9;
}

// ampliación futura (la «propuesta de expansión» de un proyecto): acrílico translúcido con las aristas punteadas, como
// el volumen proyectado de los diagramas. Se dibuja después de la placa (renderOrder), si no la placa la taparía
function ampliacion(v) {
  const g = new THREE.BoxGeometry(v.w, v.h, v.d);
  const malla = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: C.arcilla, roughness: 0.35, transparent: true, opacity: AMPLIACION, depthWrite: false,
  }));
  malla.position.set(v.x, (v.y || 0) + v.h / 2, v.z);
  malla.rotation.y = v.giro || 0;
  malla.renderOrder = 2;
  malla.userData.ampliacion = true;
  const aristas = new THREE.LineSegments(new THREE.EdgesGeometry(g),
    new THREE.LineDashedMaterial({ color: C.linea, dashSize: 1.6, gapSize: 1.1, transparent: true, opacity: 0.6 }));
  aristas.computeLineDistances();
  aristas.renderOrder = 3;
  malla.add(aristas);
  return malla;
}

function primitiva(v, mats) {
  if (v.material === "ampliacion") return ampliacion(v);
  const color = { vidrio: C.vidrio, verde: C.techo }[v.material] || C.arcilla;
  const mat = materialArcilla(mats, color);
  if (v.material === "vidrio") Object.assign(mat, { transparent: true, opacity: 0.55, roughness: 0.2 });
  let malla;
  if (v.tipo === "caja") {
    malla = new THREE.Mesh(new THREE.BoxGeometry(v.w, v.h, v.d), mat);
    malla.position.set(v.x, (v.y || 0) + v.h / 2, v.z);
    malla.rotation.y = v.giro || 0;
  } else if (v.tipo === "boveda") {
    const g = new THREE.CylinderGeometry(v.d / 2, v.d / 2, v.w, 28, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    malla = new THREE.Mesh(g, mat);
    malla.scale.y = v.h / (v.d / 2);
    malla.position.set(v.x, v.y || 0, v.z);
  } else if (v.tipo === "anfiteatro") {
    const perfil = [new THREE.Vector2(0, 0.15)];
    for (let k = 1; k <= v.gradas; k++) {
      const r = (v.r * k) / v.gradas, y0 = 0.15 + (k - 1) * 0.55;
      perfil.push(new THREE.Vector2(r, y0), new THREE.Vector2(r, y0 + 0.55));
    }
    perfil.push(new THREE.Vector2(v.r + 0.01, 0));
    malla = new THREE.Mesh(new THREE.LatheGeometry(perfil, 40), mat);
    malla.position.set(v.x, 0, v.z);
  }
  return conAristas(malla, v.material === "vidrio" ? 0.45 : 0.26);
}

async function volumenVivienda(grupo, url, mats) {
  const d = await json(url);
  const cota = Object.fromEntries(d.niveles.map((n) => [n.id, n.cota]));
  const mat = materialArcilla(mats);
  for (const u of d.unidades_vivienda) {
    const forma = new THREE.Shape(u.poligono.map(([X, Y]) => new THREE.Vector2(X - 10, Y - 7.5)));
    const g = new THREE.ExtrudeGeometry(forma, { depth: 2.9, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const malla = conAristas(new THREE.Mesh(g, mat), 0.34);
    malla.position.y = cota[u.nivel];
    grupo.add(malla);
  }
  // celosía de fachada (el rasgo más reconocible del proyecto)
  for (const c of d.celosias) {
    const [x1, y1] = c.p1, [x2, y2] = c.p2;
    const alto = cota[c.tope] - cota[c.base];
    const malla = conAristas(new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1), alto, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xc98f73, roughness: 0.95 })), 0.2);
    malla.position.set((x1 + x2) / 2 - 10, cota[c.base] + alto / 2, -((y1 + y2) / 2 - 7.5));
    grupo.add(malla);
  }
}

async function volumenTienda(grupo, url, mats, acrilico) {
  const d = await json(url);
  const [cx, cy] = d.centro;
  const forma = new THREE.Shape(d.lote.map(([X, Y]) => new THREE.Vector2(X - cx, Y - cy)));
  const g = new THREE.ExtrudeGeometry(forma, { depth: 4.9, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  grupo.add(conAristas(new THREE.Mesh(g, materialArcilla(mats)), 0.34));
  // franja del letrero sobre la fachada y vitrina de vidrio (lo que hace reconocible a la tienda)
  const [a, b] = [d.lote[0], d.lote[1]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const franja = conAristas(new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 1.9, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6 })), 0.2);
  franja.position.set((a[0] + b[0]) / 2 - cx, 3.95, -((a[1] + b[1]) / 2 - cy) + 0.2);
  grupo.add(franja);
  const logo = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 24), new THREE.MeshStandardMaterial({ color: acrilico, emissive: acrilico, emissiveIntensity: 0.35 }));
  logo.rotation.x = Math.PI / 2;
  logo.position.set(a[0] - cx + 1.2, 3.95, -((a[1] + b[1]) / 2 - cy) + 0.42);
  grupo.add(logo);
  const vidrio = new THREE.Mesh(new THREE.BoxGeometry(L - 0.6, 2.9, 0.08), new THREE.MeshStandardMaterial({ color: C.vidrio, transparent: true, opacity: 0.6, roughness: 0.15 }));
  vidrio.position.set((a[0] + b[0]) / 2 - cx, 1.5, -((a[1] + b[1]) / 2 - cy) + 0.08);
  grupo.add(vidrio);
}

// colina de capas de cartón (curvas de nivel apiladas)
function radioCurva(R, t, fases) {
  return R * (1 + 0.1 * Math.sin(3 * t + fases[0]) + 0.06 * Math.sin(5 * t + fases[1]) + 0.03 * Math.sin(9 * t + fases[2]));
}
function colina(escena, cx, cz, R, capas, alto, fases) {
  for (let i = 0; i < capas; i++) {
    const r = R * (1 - i / (capas + 0.6));
    const dx = i * 0.9, dz = i * 0.6;
    const pts = [];
    for (let k = 0; k < 96; k++) {
      const t = (k / 96) * Math.PI * 2;
      const rr = radioCurva(r, t, fases.map((f) => f + i * 0.35));
      pts.push(new THREE.Vector2(cx + dx + rr * Math.cos(t), -(cz + dz + rr * Math.sin(t))));
    }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: alto, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: C.carton[i % 2], roughness: 1 }));
    m.position.y = i * alto;
    m.castShadow = m.receiveShadow = true;
    escena.add(m);
  }
}
function curvasTablero(escena, cx, cz, R, fases) {
  const mat = new THREE.LineBasicMaterial({ color: C.curva, transparent: true, opacity: 0.42 });
  const dentro = (x, z) => Math.abs(x) < TAB.w / 2 - 1 && Math.abs(z) < TAB.d / 2 - 1;
  for (let j = 1; j <= 7; j++) {
    const r = R + j * 5;
    let tramo = [];
    const cerrar = () => { if (tramo.length > 1) escena.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tramo), mat)); tramo = []; };
    for (let k = 0; k <= 160; k++) {
      const t = (k / 160) * Math.PI * 2;
      const rr = radioCurva(r, t, fases.map((f) => f - j * 0.3));
      const x = cx + rr * Math.cos(t), z = cz + rr * Math.sin(t);
      if (dentro(x, z)) tramo.push(new THREE.Vector3(x, 0.03, z)); else cerrar();
    }
    cerrar();
  }
}

// ======================================================================= etiquetas HTML (enlaces reales)
function crearEtiqueta(p) {
  const el = document.createElement("a");
  el.className = "marca-3d";
  el.href = p.url;
  el.style.setProperty("--c", p.color);
  el.style.setProperty("--c-acr", p.acrilico);
  el.setAttribute("aria-label", `${p.nombre}, ${p.lugar}`);
  const placa = document.createElement("span");
  placa.className = "marca-3d__placa vidrio";
  const i = document.createElement("i");
  const t = document.createElement("span");
  t.className = "marca-3d__largo";
  t.textContent = p.corto;
  const s = document.createElement("small");
  s.textContent = p.lugar;
  const m = document.createElement("span");
  m.className = "marca-3d__corto";
  m.textContent = p.movil || p.corto;
  placa.append(i, t, s, m);
  const palo = document.createElement("span");
  palo.className = "marca-3d__palo";
  el.append(placa, palo);
  el.style.opacity = "0";
  return el;
}
