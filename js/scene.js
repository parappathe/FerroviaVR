// Cenário da Ferrovia: varanda de uma fazenda de café numa tarde clara (colunas brancas, telhado de
// telha, cafezal e morros lá fora). Na mesa grande, a maquete: gramado, laguinho, árvores, os trilhos
// de mão única, as estações de cada cor, o armazém, as alavancas dos desvios e os trenzinhos.
import * as THREE from '../vendor/three/three.module.js';
import { NET, NODES, STATIONS, SWITCHES, pointAt, PLAYER, CPU, EMPTY } from './rules.js';
import { makeAvatar } from './avatar.js';

export const TABLE = { x: 0, z: -0.5, top: 0.84, w: 1.3, d: 0.86 };
export const BASE_Y = TABLE.top + 0.03;          // tampo da maquete (gramado)
export const CARGO_COLOR = { [PLAYER]: 0xd8343a, [CPU]: 0x2a62d8, [EMPTY]: 0x9a9080 };
// mesa (x, y em m) -> mundo
export const toWorld = (x, y, h = 0, out = new THREE.Vector3()) => out.set(TABLE.x + x, BASE_Y + h, TABLE.z - y);
// alavanca de cada desvio: ao lado do nó, para fora dos trilhos
export const LEVER_OFFSET = { SW1: [0, -0.085], SW2: [0, -0.085], SW3: [0, 0.085] };
export const leverPos = (node, out = new THREE.Vector3()) => { const n = NODES[node], o = LEVER_OFFSET[node]; return toWorld(n[0] + o[0], n[1] + o[1], 0, out); };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function speckle(g, w, h, n, cols, seed, size = 3) { const r = rand(seed); for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(r() * w, r() * h, size * r() + 1, size * r() + 1); } }

// faixa (ribbon) ao longo de uma polilinha, com largura w, deslocada lateralmente por off
function ribbon(pts, w, off, h) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx;
    for (const s of [-1, 1]) { const p = toWorld(pts[i][0] + nx * (off + s * w / 2), pts[i][1] + ny * (off + s * w / 2), h); pos.push(p.x, p.y, p.z); }
    if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe6f6);
  scene.fog = new THREE.Fog(0xdcebf2, 14, 40);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a7050, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5); sun.position.set(-3, 5, 2); scene.add(sun);

  // ---------- Varanda ----------
  const floorC = canvas(512, 512), fg = floorC.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { fg.fillStyle = (x + y) % 2 ? '#dcae8a' : '#d09c78'; fg.fillRect(x * 64, y * 64, 64, 64); }
  speckle(fg, 512, 512, 3000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)'], 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex(floorC, { repeat: [6, 4] }) }));
  floor.position.set(0, 0, -0.8); scene.add(floor);
  const white = new THREE.MeshLambertMaterial({ color: 0xf6f2e8 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshLambertMaterial({ color: 0xf2e6cc })); wall.position.set(0, 1.7, 2.2); wall.rotation.y = Math.PI; scene.add(wall);
  for (const x of [-4, -2, 0, 2, 4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.8, 12), white); c.position.set(x, 1.4, -3.6); scene.add(c); }
  const railTop = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.1), white); railTop.position.set(0, 0.9, -3.6); scene.add(railTop);
  for (let k = -44; k <= 44; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.04), white); b.position.set(k * 0.1, 0.43, -3.6); scene.add(b); }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.08, 6.4), new THREE.MeshLambertMaterial({ color: 0xa8583a })); roof.position.set(0, 2.85, -0.7); roof.rotation.x = -0.06; scene.add(roof);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(9, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8b888 })); ceil.position.set(0, 2.78, -0.8); scene.add(ceil);
  // lá fora: cafezal em fileiras e morros
  const field = new THREE.Mesh(new THREE.PlaneGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8aa84a })); field.position.set(0, -0.02, -24); scene.add(field);
  const bushGeo = new THREE.SphereGeometry(0.45, 8, 6).scale(1, 0.8, 1);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshLambertMaterial({ color: 0x3a6a2a }), 240);
  const m4 = new THREE.Matrix4(); let bi = 0;
  for (let row = 0; row < 8; row++) for (let k = 0; k < 30; k++) { m4.makeTranslation(-15 + k * 1.05 + (row % 2) * 0.5, 0.3, -6 - row * 1.6); bushes.setMatrixAt(bi++, m4); }
  scene.add(bushes);
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x7a9a5a });
  for (const [x, z, r] of [[-14, -30, 12], [4, -36, 16], [20, -28, 10], [-28, -24, 9]]) { const h = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat); h.scale.y = 0.4; h.position.set(x, -1, z); scene.add(h); }
  // rede e filtro de barro, para dar vida
  const hammock = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.3), new THREE.MeshLambertMaterial({ color: 0xe8a83a, side: THREE.DoubleSide }));
  hammock.scale.set(1.4, 1, 0.45); hammock.position.set(-3.2, 2.0, -1.2); hammock.rotation.y = 0.3; scene.add(hammock);
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.5, 14), new THREE.MeshLambertMaterial({ color: 0xb8683a })); filter.position.set(2.6, 1.0, -1.6); scene.add(filter);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.4), new THREE.MeshLambertMaterial({ color: 0x7a5a3a })); stand.position.set(2.6, 0.375, -1.6); scene.add(stand);

  // ---------- Mesa e maquete ----------
  const woodC = canvas(256, 256), wg = woodC.getContext('2d'); wg.fillStyle = '#8a5a32'; wg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { wg.strokeStyle = `rgba(50,25,10,${0.08 + (i % 5) * 0.03})`; wg.beginPath(); wg.moveTo(0, i * 7); wg.bezierCurveTo(80, i * 7 + 5, 160, i * 7 - 5, 256, i * 7); wg.stroke(); }
  const wood = new THREE.MeshLambertMaterial({ map: tex(woodC) });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.05, TABLE.d), wood); top.position.set(TABLE.x, TABLE.top - 0.025, TABLE.z); scene.add(top);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, TABLE.top - 0.05, 0.07), wood); l.position.set(TABLE.x + x * (TABLE.w / 2 - 0.07), (TABLE.top - 0.05) / 2, TABLE.z + z * (TABLE.d / 2 - 0.07)); scene.add(l); }
  const grassC = canvas(512, 512), gg = grassC.getContext('2d'); gg.fillStyle = '#7ab850'; gg.fillRect(0, 0, 512, 512);
  speckle(gg, 512, 512, 6000, ['#6aa840', '#8ac860', '#5a9838', '#9ad070'], 5, 4);
  const base = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w - 0.06, 0.03, TABLE.d - 0.06), [wood, wood, new THREE.MeshLambertMaterial({ map: tex(grassC) }), wood, wood, wood]);
  base.position.set(TABLE.x, BASE_Y - 0.015, TABLE.z); scene.add(base);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4aa0d8, roughness: 0.15 }));
  toWorld(0.29, 0.0, 0.001, lake.position); lake.scale.set(1, 1, 1.3); scene.add(lake);
  // arvorezinhas
  const treeGeo = new THREE.ConeGeometry(0.018, 0.05, 7).translate(0, 0.035, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.012, 5).translate(0, 0.006, 0);
  const tr = rand(31);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0x2a7a3a }), 40);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6a4a2a }), 40);
  const spots = [[-0.6, 0.35], [-0.58, -0.35], [0.58, 0.36], [0.6, -0.34], [0.26, -0.02], [0.32, 0.12], [-0.23, 0.0], [-0.21, 0.13], [0.0, 0.0], [0.08, -0.05], [-0.6, 0.0], [0.58, 0.0]];
  let ti = 0;
  for (const [sx, sy] of spots) for (let k = 0; k < 3 && ti < 40; k++) { const p = toWorld(sx + (tr() - 0.5) * 0.04, sy + (tr() - 0.5) * 0.04); const sc = 0.8 + tr() * 0.5; m4.compose(p, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); trees.setMatrixAt(ti, m4); trunks.setMatrixAt(ti, m4); ti++; }
  trees.count = trunks.count = ti;
  scene.add(trees, trunks);

  // ---------- Trilhos ----------
  const ballastMat = new THREE.MeshLambertMaterial({ color: 0x9a8a78 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: 0.7, roughness: 0.35 });
  const sleeperGeo = new THREE.BoxGeometry(0.026, 0.002, 0.006);
  const sleeperMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
  const sleeperList = [];
  for (const g of Object.values(NET.segs)) {
    scene.add(new THREE.Mesh(ribbon(g.pts, 0.03, 0, 0.0015), ballastMat));
    for (const off of [-0.0085, 0.0085]) scene.add(new THREE.Mesh(ribbon(g.pts, 0.0028, off, 0.0045), railMat));
    for (let s = 0.008; s < g.len; s += 0.018) sleeperList.push(pointAt(g.id, s));
  }
  const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperList.length);
  const q = new THREE.Quaternion();
  sleeperList.forEach((p, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.dx, -p.dy)); m4.compose(toWorld(p.x, p.y, 0.003), q, new THREE.Vector3(1, 1, 1)); sleepers.setMatrixAt(i, m4); });
  scene.add(sleepers);
  // seta luminosa no começo da saída ativa de cada desvio
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe04a, transparent: true, opacity: 0.85, depthWrite: false });
  const branchGlow = {};
  for (const n of SWITCHES) {
    branchGlow[n] = NET.out[n].map(id => {
      const g = NET.segs[id];
      const cut = []; for (const p of g.pts) { cut.push(p); if (cut.length > 1 && Math.hypot(p[0] - g.pts[0][0], p[1] - g.pts[0][1]) > 0.11) break; }
      const m = new THREE.Mesh(ribbon(cut, 0.008, 0, 0.0065), glowMat); m.renderOrder = 3; scene.add(m); return m;
    });
  }

  // ---------- Estações e armazém ----------
  const roofMats = { [PLAYER]: new THREE.MeshLambertMaterial({ color: 0xd8343a }), [CPU]: new THREE.MeshLambertMaterial({ color: 0x2a62d8 }), depot: new THREE.MeshLambertMaterial({ color: 0x8a6a3a }) };
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf6eedc });
  const stationMeshes = [];
  for (const sta of STATIONS) {
    const g = NET.segs[sta.seg];
    const p = pointAt(sta.seg, g.len / 2);
    const nx = -p.dy, ny = p.dx;
    const side = (p.x * nx + p.y * ny) > 0 ? 1 : -1;    // para fora do centro da maquete
    const grp = new THREE.Group();
    toWorld(p.x + nx * 0.045 * side, p.y + ny * 0.045 * side, 0, grp.position);
    grp.rotation.y = Math.atan2(p.dx, -p.dy);
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.07), wallMat); house.position.y = 0.014; grp.add(house);
    const rf = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.028, 0.02, 4, 1).rotateY(Math.PI / 4).scale(0.8, 1, 1.8), roofMats[sta.owner]); rf.position.y = 0.038; grp.add(rf);
    // placa com o nome
    const c = canvas(256, 64), cg = c.getContext('2d');
    cg.fillStyle = sta.owner === 'depot' ? '#8a6a3a' : sta.owner === PLAYER ? '#d8343a' : '#2a62d8'; cg.fillRect(0, 0, 256, 64);
    cg.fillStyle = '#fff'; cg.font = 'bold 34px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(sta.name, 128, 34);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.02), new THREE.MeshBasicMaterial({ map: tex(c), side: THREE.DoubleSide }));
    sign.position.set(0, 0.062, 0); sign.rotation.y = Math.PI / 2 * side; grp.add(sign);
    if (sta.owner === 'depot') for (let k = 0; k < 4; k++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xd8343a : 0x2a62d8 })); cr.position.set(0.024 * side, 0.006 + (k > 1 ? 0.012 : 0), -0.02 + (k % 2) * 0.014); grp.add(cr); }
    scene.add(grp);
    stationMeshes.push({ sta, grp, roof: rf });
  }

  // ---------- Alavancas dos desvios ----------
  const levers = {};
  const leverBaseMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.6, roughness: 0.4 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.3 });
  const lockMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.0, depthWrite: false });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x9a4a2a, roughness: 0.9 });
  for (const n of SWITCHES) {
    const g = new THREE.Group();
    leverPos(n, g.position);
    const out0 = pointAt(NET.out[n][0], 0.0);
    g.rotation.y = Math.atan2(out0.dx, -out0.dy);
    const baseM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.012, 16), leverBaseMat); baseM.position.y = 0.006; g.add(baseM);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 24).rotateX(Math.PI / 2), lockMat.clone()); ring.position.y = 0.012; g.add(ring);
    const arm = new THREE.Group(); arm.position.y = 0.012; g.add(arm);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 8).translate(0, 0.03, 0), leverBaseMat); arm.add(stick);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 10), knobMat); knob.position.y = 0.062; arm.add(knob);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.04; hit.userData.node = n; g.add(hit);
    const label = (() => { const c = canvas(64, 64), cg = c.getContext('2d'); cg.fillStyle = '#fffbe8'; cg.beginPath(); cg.arc(32, 32, 30, 0, Math.PI * 2); cg.fill(); cg.fillStyle = '#3a2a1a'; cg.font = 'bold 40px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(n.slice(2), 32, 34); return new THREE.Mesh(new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex(c) })); })();
    label.position.set(0.03, 0.0125, 0); g.add(label);
    scene.add(g);
    levers[n] = { group: g, arm, knob, ring, hit, angle: 0 };
  }
  function setLever(n, state, lockK, locked, dt) {
    const L = levers[n];
    const target = state ? -0.5 : 0.5;
    L.angle += (target - L.angle) * Math.min(1, dt * 12);
    L.arm.rotation.z = L.angle;
    L.ring.material.opacity = lockK > 0 ? 0.3 + 0.6 * lockK : 0;
    L.knob.material = locked ? rustMat : knobMat;
    branchGlow[n].forEach((m, i) => { m.visible = i === state; });
  }

  // ---------- Trens ----------
  const locoMat = [new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.5 })];
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.8, roughness: 0.3 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const cargoMats = {};
  for (const k of Object.keys(CARGO_COLOR)) cargoMats[k] = new THREE.MeshStandardMaterial({ color: CARGO_COLOR[k], roughness: 0.5 });
  const wheelGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 10).rotateZ(Math.PI / 2);
  function makeTrain(i) {
    const loco = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.036), locoMat[0]); chassis.position.y = 0.007; loco.add(chassis);
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.024, 12).rotateX(Math.PI / 2), locoMat[i % 3]); boiler.position.set(0, 0.017, 0.005); loco.add(boiler);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.012), locoMat[i % 3]); cab.position.set(0, 0.02, -0.012); loco.add(cab);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.0025, 0.012, 8), locoMat[0]); chim.position.set(0, 0.029, 0.013); loco.add(chim);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), goldMat); bell.position.set(0, 0.026, 0.003); loco.add(bell);
    for (const z of [-0.011, 0.011]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(0, 0.0045, z); loco.add(w); }
    const wagon = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.03), locoMat[0]); bed.position.y = 0.007; wagon.add(bed);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.014, 0.024), cargoMats[EMPTY]); crate.position.y = 0.016; wagon.add(crate);
    for (const z of [-0.009, 0.009]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(0, 0.0045, z); wagon.add(w); }
    scene.add(loco, wagon);
    return { loco, wagon, crate, puffT: 0 };
  }
  function setCargo(t, c) { t.crate.material = cargoMats[c]; t.crate.visible = c !== EMPTY; }
  // fumacinha (poucas bolinhas reaproveitadas)
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const puffs = [];
  for (let k = 0; k < 24; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), puffMat.clone()); m.visible = false; scene.add(m); puffs.push({ m, life: 0 }); }
  let puffI = 0;
  function puff(pos) { const p = puffs[puffI++ % puffs.length]; p.m.position.copy(pos); p.m.visible = true; p.life = 1; p.m.scale.setScalar(1); }
  // caminho de cada trem (prévia): linha tracejada colorida
  const pathLines = [];
  function pathLine(i) {
    if (!pathLines[i]) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 200), 3));
      const l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.012, gapSize: 0.008, transparent: true, opacity: 0.9, depthTest: false }));
      l.renderOrder = 6; l.frustumCulled = false; scene.add(l); pathLines[i] = l;
    }
    return pathLines[i];
  }
  // texto flutuante "+1" nas entregas
  const pops = [];
  function popText(pos, text, color) {
    const c = canvas(128, 64), g = c.getContext('2d'); g.fillStyle = color; g.font = 'bold 48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 34);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthTest: false }));
    m.position.copy(pos); m.renderOrder = 8; scene.add(m); pops.push({ m, life: 1.4 });
  }

  // placa do placar e relógio da estação
  const boardC = canvas(1024, 512), bt = tex(boardC);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: bt }));
  board.position.set(TABLE.x + 1.2, 1.7, TABLE.z - 1.25); board.rotation.y = -0.5; scene.add(board);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), new THREE.MeshLambertMaterial({ color: 0x3a3a3a })); post.position.set(TABLE.x + 1.2, 0.72, TABLE.z - 1.27); scene.add(post);
  function drawBoard({ names, scores, round, footer }) {
    const g = boardC.getContext('2d');
    g.fillStyle = '#1e3a2a'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = '#d8b04a'; g.lineWidth = 12; g.strokeRect(6, 6, 1012, 500);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f6e8b8'; g.font = 'bold 54px Georgia, serif'; g.fillText('FERROVIA', 512, 64);
    const cols = ['#ff7a7a', '#8ab4ff'];
    for (const k of [0, 1]) { const x = k ? 770 : 254; g.fillStyle = cols[k]; g.font = 'bold 42px sans-serif'; g.fillText(names[k], x, 150); g.font = 'bold 150px Georgia, serif'; g.fillText(String(scores[k]), x, 290); }
    g.fillStyle = '#f6e8b8'; g.font = 'bold 60px monospace'; g.fillText(round || '', 512, 290);
    g.font = '32px sans-serif'; g.fillText(footer || '', 512, 450);
    bt.needsUpdate = true;
  }

  // adversário
  const styles = {
    careful: () => {
      const g = new THREE.Group();
      const cap = new THREE.MeshLambertMaterial({ color: 0x2a3a6a });
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.07, 20), cap); top.position.y = 0.1; g.add(top);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 20, 1, false, -Math.PI / 2, Math.PI), new THREE.MeshLambertMaterial({ color: 0x1a1a1a })); visor.position.set(0, 0.07, 0.1); g.add(visor);
      const mus = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), new THREE.MeshLambertMaterial({ color: 0xe0e0e0 })); mus.position.set(0, -0.035, 0.125); g.add(mus);
      return g;
    },
    risky: () => {
      const g = new THREE.Group();
      const hair = new THREE.MeshLambertMaterial({ color: 0xa83a1a });
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), hair); top.position.y = 0.01; g.add(top);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 20).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffd23a })); scarf.position.y = 0.06; g.add(scarf);
      const goggle = new THREE.MeshBasicMaterial({ color: 0x8ad0ff });
      for (const x of [-0.05, 0.05]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), goggle); l.position.set(x, 0.07, 0.13); g.add(l); }
      return g;
    },
    master: () => {
      const g = new THREE.Group();
      const hat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 20), hat); brim.position.y = 0.09; g.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 20), hat); crown.position.y = 0.17; g.add(crown);
      const mono = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 18), new THREE.MeshBasicMaterial({ color: 0xd8b04a })); mono.position.set(0.045, 0.02, 0.135); g.add(mono);
      return g;
    },
  };
  const avatar = makeAvatar({ styles, headY: 1.55, handZ: 0.3, standing: true, pants: 0x4a4a5a });
  avatar.group.position.set(TABLE.x, 0, TABLE.z - 0.9);
  avatar.hands.forEach(h => { h.position.y = TABLE.top + 0.04; });
  avatar.arms.forEach(a => { a.position.y = TABLE.top + 0.13; });
  scene.add(avatar.group);

  function animate(dt, time) {
    for (const p of puffs) if (p.life > 0) { p.life -= dt * 0.9; p.m.position.y += dt * 0.03; p.m.scale.setScalar(1 + (1 - p.life) * 2); p.m.material.opacity = 0.6 * Math.max(0, p.life); if (p.life <= 0) p.m.visible = false; }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.m.position.y += dt * 0.05; p.m.material.opacity = Math.min(1, p.life); if (p.life <= 0) { scene.remove(p.m); pops.splice(i, 1); } }
  }

  return { scene, levers, setLever, makeTrain, setCargo, puff, pathLine, popText, stationMeshes, drawBoard, avatar, animate };
}
