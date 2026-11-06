// Regras e simulação da Ferrovia: maquete de trilhos de mão única com desvios. Os trens andam sozinhos;
// os dois jogadores viram os desvios para levar a carga da sua cor às suas estações. Simulação em
// passos fixos (determinística), sem navegador: a mesma conta roda nos testes, na IA e no jogo.

export const PLAYER = 0, CPU = 1, EMPTY = -1;
export const DT = 1 / 60;                 // passo da simulação (s)
export const MATCH_TIME = 150;            // partida: 2 min 30 s
export const SPEED = 0.12;                // m/s
export const LOCK_TIME = 1.2;             // depois de virado, o desvio trava por este tempo
export const COMMIT = 0.05;               // trem a menos disto (m) do desvio: não dá mais para virar
export const GAP = 0.075;                 // distância mínima entre trens (m)
export const TRAIN_LEN = 0.07;            // locomotiva + vagão

// Nós: posição na mesa (m; x direita, y para longe de quem joga) e direção de viagem (graus).
export const NODES = {
  B0: [-0.30, -0.28, 0], SW1: [-0.17, -0.28, 0], SW2: [0.05, -0.28, 0],
  R1: [0.40, -0.18, 90], R2: [0.40, 0.16, 90], T0: [0.28, 0.28, 180],
  M2a: [0.17, -0.12, 90], M2b: [0.17, 0.12, 90], MG2: [0.05, 0.28, 180],
  M1a: [-0.07, -0.12, 90], M1b: [-0.07, 0.12, 90], MG1: [-0.17, 0.28, 180],
  SW3: [-0.30, 0.28, 180], LO1: [-0.50, 0.10, 270], LO2: [-0.50, -0.12, 270],
  LI1: [-0.37, 0.10, 270], LI2: [-0.37, -0.12, 270],
};
// Trechos (de, para). Nó com duas saídas é desvio; a ordem das saídas é [reto, desviado].
export const SEGMENTS = [
  ['B0', 'SW1'], ['SW1', 'SW2'], ['SW1', 'M1a'], ['SW2', 'R1'], ['SW2', 'M2a'],
  ['R1', 'R2'], ['R2', 'T0'], ['T0', 'MG2'], ['M2a', 'M2b'], ['M2b', 'MG2'],
  ['MG2', 'MG1'], ['M1a', 'M1b'], ['M1b', 'MG1'], ['MG1', 'SW3'],
  ['SW3', 'LO1'], ['SW3', 'LI1'], ['LO1', 'LO2'], ['LO2', 'B0'], ['LI1', 'LI2'], ['LI2', 'B0'],
];
// Estações: no meio de um trecho. owner 0 = sua (vermelha), 1 = dele (azul), 'depot' = armazém (pega carga)
export const STATIONS = [
  { seg: 'M1a>M1b', owner: PLAYER, name: 'Vila Rubi' },
  { seg: 'LI1>LI2', owner: PLAYER, name: 'Porto Rubi' },
  { seg: 'M2a>M2b', owner: CPU, name: 'Vila Safira' },
  { seg: 'LO1>LO2', owner: CPU, name: 'Porto Safira' },
  { seg: 'R1>R2', owner: 'depot', name: 'Armazém' },
];
export const SWITCH_NAMES = { SW1: 'Desvio 1', SW2: 'Desvio 2', SW3: 'Desvio 3' };

// ---------- Geometria: cada trecho é uma curva de Bézier entre os nós, amostrada em pontos ----------
const rad = (d) => d * Math.PI / 180;
function bez(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}
function buildNet() {
  const segs = {};
  const out = {}, inc = {};
  for (const [a, b] of SEGMENTS) {
    const A = NODES[a], B = NODES[b];
    const ha = rad(A[2]), hb = rad(B[2]);
    const dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const k = dist * 0.42;
    const p0 = [A[0], A[1]], p1 = [A[0] + Math.cos(ha) * k, A[1] + Math.sin(ha) * k];
    const p2 = [B[0] - Math.cos(hb) * k, B[1] - Math.sin(hb) * k], p3 = [B[0], B[1]];
    const n = Math.max(8, Math.ceil(dist / 0.01));
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([bez(p0[0], p1[0], p2[0], p3[0], t), bez(p0[1], p1[1], p2[1], p3[1], t)]); }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const id = `${a}>${b}`;
    segs[id] = { id, from: a, to: b, pts, cum, len: cum[cum.length - 1] };
    (out[a] ||= []).push(id);
    (inc[b] ||= []).push(id);
  }
  const switches = Object.keys(out).filter(n => out[n].length > 1);
  return { segs, out, inc, switches };
}
export const NET = buildNet();
export const SWITCHES = NET.switches;   // ['SW1', 'SW2', 'SW3']

// ponto e direção num trecho, a uma distância s do começo
export function pointAt(segId, s) {
  const g = NET.segs[segId];
  s = Math.max(0, Math.min(g.len, s));
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i] < s) i++;
  const a = g.pts[i - 1], b = g.pts[i];
  const u = (s - g.cum[i - 1]) / Math.max(1e-9, g.cum[i] - g.cum[i - 1]);
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return { x: a[0] + dx * u, y: a[1] + dy * u, dx: dx / l, dy: dy / l };
}
export const stationOn = (segId) => STATIONS.find(s => s.seg === segId);
// saída que o desvio manda agora
export const nextSeg = (st, node) => { const o = NET.out[node]; return o.length > 1 ? o[st.sw[node]] : o[0]; };

// ---------- Estado ----------
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// trains: [{ seg, s, cargo }]; cargoSeq: cores que o armazém vai dando, em ordem
export function newGame({ trains = null, time = MATCH_TIME, seed = 7, speed = SPEED, locked = {}, sw = null, cargoSeq = null, gremlin = 0 } = {}) {
  const r = rng(seed);
  const seq = cargoSeq ? cargoSeq.slice() : Array.from({ length: 80 }, (_, k) => (k % 2 ? 1 : 0) ^ (r() < 0.3 ? 1 : 0));
  const T = trains || [
    { seg: 'MG1>SW3', s: 0.02, cargo: PLAYER },
    { seg: 'R1>R2', s: 0.2, cargo: CPU },
    { seg: 'SW1>SW2', s: 0.05, cargo: EMPTY },
  ];
  return {
    t: 0, time, speed, seq, seqI: 0,
    trains: T.map((x, i) => ({ id: i, seg: x.seg, s: x.s, cargo: x.cargo, v: speed * (x.speedK || 1), k: x.speedK || 1, stopped: false, visited: null })),
    sw: { ...(sw || Object.fromEntries(SWITCHES.map(n => [n, r() < 0.5 ? 0 : 1]))) },   // posição inicial sorteada
    lockUntil: Object.fromEntries(SWITCHES.map(n => [n, 0])),
    locked: { ...locked },   // desvios emperrados (não viram)
    scores: [0, 0], loads: 0, events: [], over: false, gremlin, gremlinT: gremlin || 0,
    flips: [0, 0],
  };
}

// distância (ao longo dos trilhos) até um nó, seguindo os desvios como estão agora (no máximo maxD)
export function distToNode(st, tr, node, maxD = 3) {
  let d = NET.segs[tr.seg].len - tr.s, seg = tr.seg, guard = 0;
  while (guard++ < 20) {
    const to = NET.segs[seg].to;
    if (to === node) return d;
    if (d > maxD) return Infinity;
    seg = nextSeg(st, to);
    d += NET.segs[seg].len;
  }
  return Infinity;
}
// o desvio pode virar agora? (não está travado, emperrado nem com trem em cima da agulha)
export function canFlip(st, node) {
  if (st.over || st.locked[node] != null) return false;
  if (st.t < st.lockUntil[node]) return false;
  for (const tr of st.trains) {
    const g = NET.segs[tr.seg];
    if (g.to === node && g.len - tr.s < COMMIT) return false;
    if (g.from === node && tr.s < TRAIN_LEN) return false;   // vagão ainda em cima da agulha
  }
  return true;
}
export function flip(st, node, who) {
  if (!canFlip(st, node)) return false;
  st.sw[node] = 1 - st.sw[node];
  st.lockUntil[node] = st.t + LOCK_TIME;
  if (who === PLAYER || who === CPU) st.flips[who]++;
  st.events.push({ t: st.t, type: 'flip', node, who, to: st.sw[node] });
  return true;
}

function posOf(tr) { return pointAt(tr.seg, tr.s); }
// Um passo da simulação: trens andam, param se tem trem logo à frente, passam por estações e desvios.
export function step(st, dt = DT) {
  if (st.over) return;
  st.t += dt;
  if (st.gremlin && st.t >= st.gremlinT) {    // "vento": vira um desvio sozinho de tempos em tempos
    st.gremlinT += st.gremlin;
    const n = SWITCHES[Math.floor(st.t * 7.3) % SWITCHES.length];
    flip(st, n, 'vento');
  }
  const P = st.trains.map(posOf);
  for (const tr of st.trains) {
    // trem logo à frente (no mesmo caminho ou chegando junto num cruzamento): espera
    const me = P[tr.id];
    let block = false;
    for (const o of st.trains) {
      if (o === tr) continue;
      const q = P[o.id];
      const dx = q.x - me.x, dy = q.y - me.y, d = Math.hypot(dx, dy);
      if (d < GAP && dx * me.dx + dy * me.dy > 0) {
        // os dois se veem na frente (chegando num encontro): passa o de número menor
        const theyBlocked = d < GAP && -(dx * q.dx + dy * q.dy) > 0;
        if (!theyBlocked || o.id < tr.id) { block = true; break; }
      }
    }
    tr.stopped = block;
    const target = block ? 0 : st.speed * tr.k;
    tr.v += (target - tr.v) * Math.min(1, dt * (block ? 14 : 3));
    let s = tr.s + tr.v * dt;
    let g = NET.segs[tr.seg];
    // estação no meio do trecho
    const sta = stationOn(tr.seg);
    if (sta && tr.s < g.len / 2 && s >= g.len / 2) arrive(st, tr, sta);
    while (s >= g.len) {
      s -= g.len;
      const node = g.to;
      tr.seg = nextSeg(st, node);
      g = NET.segs[tr.seg];
      st.events.push({ t: st.t, type: 'pass', train: tr.id, node, seg: tr.seg });
    }
    tr.s = s;
  }
  if (st.t >= st.time) { st.over = true; st.events.push({ t: st.t, type: 'end' }); }
}
function arrive(st, tr, sta) {
  if (sta.owner === 'depot') {
    // o armazém sempre dá carga nova (troca a que o trem trouxe, se trouxe)
    const old = tr.cargo;
    tr.cargo = st.seq[st.seqI % st.seq.length]; st.seqI++; st.loads++;
    st.events.push({ t: st.t, type: 'load', train: tr.id, cargo: tr.cargo, old });
    return;
  }
  if (tr.cargo === sta.owner) {
    st.scores[sta.owner]++;
    st.events.push({ t: st.t, type: 'deliver', train: tr.id, owner: sta.owner, station: sta.name });
    tr.cargo = EMPTY;
  } else st.events.push({ t: st.t, type: 'miss', train: tr.id, cargo: tr.cargo, station: sta.name, owner: sta.owner });
}
export function run(st, sec, each = null) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n && !st.over; i++) { each?.(st); step(st); }
  return st;
}
export const cloneSt = (st) => JSON.parse(JSON.stringify(st));
export const winnerOf = (st) => (st.scores[0] > st.scores[1] ? PLAYER : st.scores[1] > st.scores[0] ? CPU : -1);

// Caminho que o trem vai fazer daqui (lista de trechos), até `len` metros, com os desvios como estão
export function pathAhead(st, tr, len = 0.8) {
  const segs = [{ seg: tr.seg, from: tr.s }];
  let d = NET.segs[tr.seg].len - tr.s, seg = tr.seg, guard = 0;
  while (d < len && guard++ < 12) { seg = nextSeg(st, NET.segs[seg].to); segs.push({ seg, from: 0 }); d += NET.segs[seg].len; }
  return segs;
}
