// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { NET, NODES, SEGMENTS, STATIONS, SWITCHES, DT, MATCH_TIME, LOCK_TIME, GAP, newGame, step, run, flip, canFlip, pointAt, nextSeg, distToNode, pathAhead, PLAYER, CPU, EMPTY } from '../js/rules.js';
import { OPPONENTS, ROBOT, makeController, desiredBranch, nextTrain, rng } from '../js/ai.js';
import { CHALLENGES, setupChallenge, solveChallenge, idleRun, starsFor } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 200 s'); process.exit(1); }, 200000).unref();

console.log('Trilhos');
{
  ok(SWITCHES.join() === 'SW1,SW2,SW3', `3 desvios (${SWITCHES})`);
  ok(Object.keys(NODES).every(n => NET.out[n]?.length >= 1 && NET.inc[n]?.length >= 1), 'todo nó tem entrada e saída (rede fechada)');
  ok(STATIONS.every(s => NET.segs[s.seg]), 'estações em trechos que existem');
  // curvas contínuas: o fim de um trecho encosta no começo do seguinte
  let worst = 0;
  for (const g of Object.values(NET.segs)) for (const o of NET.out[g.to]) { const a = g.pts[g.pts.length - 1], b = NET.segs[o].pts[0]; worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1])); }
  ok(worst < 1e-9, 'trechos emendados');
  // direção na emenda quase igual (sem quina)
  let maxTurn = 0;
  for (const g of Object.values(NET.segs)) for (const o of NET.out[g.to]) { const a = pointAt(g.id, g.len - 0.001), b = pointAt(o, 0.001); maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, a.dx * b.dx + a.dy * b.dy))); }
  ok(maxTurn < 0.3, `sem quinas nas emendas (maior virada ${(maxTurn * 57.3).toFixed(1)}°)`);
  // menor raio de curva
  let minR = Infinity;
  for (const g of Object.values(NET.segs)) for (let s = 0.01; s < g.len - 0.01; s += 0.01) { const a = pointAt(g.id, s - 0.005), b = pointAt(g.id, s + 0.005); const ang = Math.acos(Math.min(1, a.dx * b.dx + a.dy * b.dy)); if (ang > 1e-6) minR = Math.min(minR, 0.01 / ang); }
  ok(minR > 0.04, `curvas não muito fechadas (menor raio ${(minR * 100).toFixed(1)} cm)`);
  ok(Object.values(NET.segs).every(g => g.pts.every(([x, y]) => Math.abs(x) < 0.6 && Math.abs(y) < 0.38)), 'tudo cabe na mesa');
}

console.log('Simulação');
{
  const st = newGame({ seed: 3 });
  const p0 = st.trains.map(t => `${t.seg}${t.s}`).join();
  run(st, 1);
  ok(st.trains.map(t => `${t.seg}${t.s}`).join() !== p0 && Math.abs(st.t - 1) < 1e-6, 'trens andam');
  const a = newGame({ seed: 9 }), b = newGame({ seed: 9 });
  run(a, 30); run(b, 30);
  ok(JSON.stringify(a.trains) === JSON.stringify(b.trains) && a.scores.join() === b.scores.join(), 'simulação determinística');
  // sem desvio mexido: seguem a saída reta
  ok(nextSeg(newGame(), 'SW1') === 'SW1>SW2', 'desvio em 0 segue reto');
  // entrega: trem vermelho na Vila Rubi
  let d = newGame({ trains: [{ seg: 'SW1>M1a', s: 0.0, cargo: PLAYER }], cargoSeq: [CPU] });
  run(d, 4);
  ok(d.scores[0] === 1 && d.trains[0].cargo === EMPTY, 'carga vermelha na estação vermelha: +1 e o vagão esvazia');
  let m = newGame({ trains: [{ seg: 'SW1>M1a', s: 0.0, cargo: CPU }] });
  run(m, 4);
  ok(m.scores.join() === '0,0' && m.trains[0].cargo === CPU, 'carga azul na estação vermelha: nada');
  let dep = newGame({ trains: [{ seg: 'R1>R2', s: 0.0, cargo: CPU }], cargoSeq: [PLAYER] });
  run(dep, 3);
  ok(dep.trains[0].cargo === PLAYER && dep.loads === 1, 'armazém troca a carga');
  // desvio: trava depois de virar e não vira com trem em cima
  const f = newGame({ trains: [{ seg: 'LO2>B0', s: 0.0, cargo: EMPTY }] });
  ok(flip(f, 'SW1', PLAYER) && f.sw.SW1 === 1, 'vira o desvio');
  ok(!flip(f, 'SW1', CPU), 'logo depois está travado');
  run(f, LOCK_TIME + 0.05);
  ok(canFlip(f, 'SW1') || distToNode(f, f.trains[0], 'SW1') < 0.05, 'destrava depois de 1,2 s');
  const f2 = newGame({ trains: [{ seg: 'B0>SW1', s: NET.segs['B0>SW1'].len - 0.02, cargo: EMPTY }] });
  ok(!canFlip(f2, 'SW1'), 'trem em cima da agulha: não vira');
  const em = newGame({ locked: { SW3: 0 } });
  ok(!flip(em, 'SW3', PLAYER), 'desvio emperrado não vira');
  // trens não se atravessam: distância mínima mantida
  const crowd = newGame({ seed: 4, speed: 0.16 });
  let minD = Infinity;
  for (let k = 0; k < 60 * 60; k++) {
    step(crowd);
    for (const x of crowd.trains) for (const y of crowd.trains) if (x.id < y.id) { const p = pointAt(x.seg, x.s), q = pointAt(y.seg, y.s); minD = Math.min(minD, Math.hypot(p.x - q.x, p.y - q.y)); }
  }
  ok(minD > GAP * 0.6, `trens não se atravessam (menor distância ${(minD * 100).toFixed(1)} cm)`);
  ok(crowd.trains.every(t => t.v > 0.05), 'e ninguém fica parado para sempre');
  const pa = pathAhead(newGame(), newGame().trains[0], 0.6);
  ok(pa.length >= 2, 'caminho à frente para a prévia');
  const t = newGame({ time: 5 }); run(t, 10);
  ok(t.over && t.t <= 5 + DT, 'acaba no tempo');
}

console.log('IA');
{
  // trem vermelho chegando no desvio 1: o seu lado manda para a Vila Rubi, o dele não
  const st = newGame({ trains: [{ seg: 'B0>SW1', s: 0.0, cargo: PLAYER }] });
  const tr = st.trains[0];
  ok(desiredBranch(st, 'SW1', tr, PLAYER, ROBOT).best === 1, 'você quer a vermelha na Vila Rubi');
  ok(desiredBranch(st, 'SW1', tr, CPU, OPPONENTS[2]).best === 0, 'o adversário quer desviar a vermelha');
  ok(desiredBranch(st, 'SW1', tr, CPU, OPPONENTS[0]).gain < desiredBranch(st, 'SW1', tr, CPU, OPPONENTS[1]).gain, 'Seu Arlindo liga menos para sabotar que a Rita');
  ok(nextTrain(st, 'SW1').tr === tr, 'acha o próximo trem do desvio');
  // tempo do controlador
  const big = newGame({ seed: 2 });
  const ctl = makeController(CPU, OPPONENTS[2], rng(1));
  let worst = 0;
  for (let k = 0; k < 600; k++) { const t0 = performance.now(); ctl(big, DT); worst = Math.max(worst, performance.now() - t0); step(big); }
  ok(worst < 5, `IA decide em menos de 5 ms por quadro (pior ${worst.toFixed(2)} ms)`);
}

console.log('IA contra IA');
{
  const play = (a, b, seed) => { const st = newGame({ seed }); const r = rng(seed); const A = makeController(PLAYER, a, r), B = makeController(CPU, b, r); while (!st.over) { A(st, DT); B(st, DT); step(st); } return st; };
  const duel = (i, j, games) => {
    let wa = 0, wb = 0; const lines = [];
    for (let g = 0; g < games; g++) {
      // metade das partidas com cada um de um lado (vermelho/azul)
      const swap = g % 2 === 1;
      const s = swap ? play(OPPONENTS[j], OPPONENTS[i], g + 1) : play(OPPONENTS[i], OPPONENTS[j], g + 1);
      ok(s.over && Math.abs(s.t - MATCH_TIME) < 0.02, 'partida IA x IA até o fim');
      const A = swap ? s.scores[1] : s.scores[0], B = swap ? s.scores[0] : s.scores[1];
      if (A > B) wa++; else if (B > A) wb++; lines.push(`${A}x${B}`);
    }
    console.log(`  ${OPPONENTS[i].name} ${wa} x ${wb} ${OPPONENTS[j].name}  (${lines.join(' ')})`);
    return [wa, wb];
  };
  const [a, b] = duel(2, 0, 12), [c, d] = duel(2, 1, 12), [e, f] = duel(1, 0, 12);
  ok(a > b && c > d, 'Engenheiro Leopoldo ganha mais do que perde dos outros dois');
  ok(e > f, 'Rita ganha mais do que perde do Seu Arlindo');
}

console.log('Desafios');
{
  for (const [i, c] of CHALLENGES.entries()) {
    ok(c.desc && c.stars.length === 3 && c.stars[0] < c.stars[1] && c.stars[1] < c.stars[2], `desafio ${i + 1}: texto e metas crescentes`);
    const t0 = performance.now();
    const r = solveChallenge(c);
    const idle = idleRun(c);
    console.log(`  ${i + 1}. ${c.name}: ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}  robô ${r.value} entregas, sem mexer ${idle}  (${(performance.now() - t0).toFixed(0)} ms)`);
    ok(r.stars === 3, `robô tira 3 estrelas no desafio ${i + 1}`);
    ok(starsFor(c, idle) < 3, `desafio ${i + 1}: sem mexer nos desvios não dá 3 estrelas`);
    ok(setupChallenge(c).trains.length === c.setup.trains.length, `desafio ${i + 1}: trens certos`);
  }
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try {
    const out = await smoke();
    for (const [cond, msg] of out) ok(cond, msg);
    console.log(`  ${out.filter(o => o[0]).length} de ${out.length} conferências do jogo carregado`);
  } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
