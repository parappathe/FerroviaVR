// Adversários da Ferrovia: olham o trem que vai chegar em cada desvio, calculam para onde cada saída
// leva (estações e armazém, com a carga mudando no caminho) e viram o desvio. Sem navegador.
import { NET, SWITCHES, STATIONS, stationOn, nextSeg, distToNode, canFlip, flip, PLAYER, CPU, EMPTY } from './rules.js';

export const OPPONENTS = [
  {
    id: 'arlindo', name: 'Seu Arlindo', title: 'o cauteloso', style: 'careful',
    desc: 'Cuida só das cargas dele, vira cedo e com calma', color: 0x4a6a9a,
    react: 0.6, sabotage: 0.3, horizon: 0.4, late: 0, error: 0.04,
  },
  {
    id: 'rita', name: 'Rita Vapor', title: 'a arriscada', style: 'risky',
    desc: 'Desvia as suas cargas sem dó, mas às vezes erra', color: 0xd85a3a,
    react: 0.45, sabotage: 1.5, horizon: 0.3, late: 0, error: 0.18,
  },
  {
    id: 'leopoldo', name: 'Engenheiro Leopoldo', title: 'pensa à frente', style: 'master',
    desc: 'Planeja dois desvios à frente e vira no último instante', color: 0x6a4a8a,
    react: 0.5, sabotage: 1, horizon: 0.45, late: 0.15, error: 0.06,
  },
];
export const ROBOT = { id: 'robo', name: 'Robô', style: 'master', react: 0.2, sabotage: 1, horizon: 0.45, late: 0, error: 0 };

// valor de um trem com carga `cargo` passar pela estação, para `who`
function stationValue(sta, cargo, who, o) {
  if (sta.owner === 'depot') return { v: 0.45, cargo: 'novo' };   // carga nova: metade das vezes é minha
  if (cargo === sta.owner) return { v: sta.owner === who ? 1 : -o.sabotage, cargo: EMPTY };
  return { v: 0, cargo };
}
// valor de seguir pela saída `seg` com esta carga: estações até o próximo desvio, e lá a melhor saída
function routeValue(st, seg, cargo, who, o, depth) {
  let v = 0, guard = 0;
  while (guard++ < 12) {
    const sta = stationOn(seg);
    if (sta) {
      const r = stationValue(sta, cargo, who, o);
      v += r.v;
      if (r.cargo === 'novo') { v += 0.15; cargo = EMPTY; return v; }   // carga desconhecida: para aqui
      cargo = r.cargo;
    }
    const to = NET.segs[seg].to;
    let outs = NET.out[to];
    if (outs.length > 1 && st.locked[to] != null) outs = [outs[st.locked[to]]];   // desvio emperrado
    if (outs.length > 1) {
      if (depth <= 0) return v;
      return v + 0.6 * Math.max(...outs.map(sg => routeValue(st, sg, cargo, who, o, depth - 1)));   // o que vem depois vale menos
    }
    seg = outs[0];
  }
  return v;
}
export function desiredBranch(st, node, tr, who, o) {
  const outs = NET.out[node];
  const vals = outs.map(sg => routeValue(st, sg, tr.cargo, who, o, o.style === 'master' ? 2 : 1));
  const best = vals[0] >= vals[1] ? 0 : 1;
  return { best, gain: Math.abs(vals[0] - vals[1]), vals };
}
// o trem que vai chegar primeiro no desvio
export function nextTrain(st, node, maxD = 1) {
  let best = null, bd = maxD;
  for (const tr of st.trains) { const d = distToNode(st, tr, node, maxD); if (d < bd) { bd = d; best = tr; } }
  return best ? { tr: best, d: bd } : null;
}

// Controlador de um lado: chamar a cada passo da simulação. Devolve a lista de desvios que virou.
export function makeController(who, o, random = Math.random) {
  let wait = 0;
  return function control(st, dt) {
    wait -= dt;
    if (wait > 0) return [];
    wait = o.react;
    const done = [];
    for (const node of SWITCHES) {
      const nt = nextTrain(st, node, o.horizon);
      if (!nt || st.locked[node] != null) continue;
      if (o.late && nt.d > o.late + 0.04 && nt.d > st.speed * nt.tr.k * 1.0) continue;   // espera o último instante
      const want = desiredBranch(st, node, nt.tr, who, o);
      if (want.gain < 0.05) continue;
      let target = want.best;
      if (o.error && random() < o.error) target = 1 - target;
      if (st.sw[node] !== target && canFlip(st, node) && flip(st, node, who)) done.push(node);
    }
    return done;
  };
}
export { CPU, PLAYER };
export { rng } from './rules.js';
