// Desafios da Ferrovia: só você vira os desvios. Entregue o máximo de cargas vermelhas no tempo.
// O robô (o mesmo controlador da IA, do seu lado) joga a simulação inteira e prova que dá 3 estrelas.
import { newGame, step, DT, PLAYER, CPU, EMPTY } from './rules.js';
import { ROBOT, makeController } from './ai.js';

const R = PLAYER, B = CPU, E = EMPTY;
export const CHALLENGES = [
  { name: 'Primeira entrega', time: 65, stars: [1, 2, 3], desc: 'Um trem e só carga vermelha. Mande para a Vila Rubi ou o Porto Rubi.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }], cargoSeq: [R] } },
  { name: 'Dois trens', time: 60, stars: [2, 3, 4], desc: 'Dois trens, cargas alternando. Mande as azuis de volta ao armazém.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'MG1>SW3', s: 0.0, cargo: R }], cargoSeq: [R, B] } },
  { name: 'Só vermelho', time: 60, stars: [4, 6, 8], desc: 'Três trens e o armazém só dá vermelho. Nenhuma viagem perdida.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'R2>T0', s: 0.0, cargo: R }, { seg: 'LO1>LO2', s: 0.15, cargo: E }], cargoSeq: [R] } },
  { name: 'Desvio emperrado', time: 70, stars: [2, 4, 5], desc: 'O desvio 1 emperrou reto. Só sobram o Porto Rubi e o armazém.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'MG2>MG1', s: 0.05, cargo: R }], cargoSeq: [R, B, R], locked: { SW1: 0 } } },
  { name: 'Expresso', time: 60, stars: [2, 3, 4], desc: 'Um dos trens é expresso: chega rápido nos desvios.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E, speedK: 1.6 }, { seg: 'LI1>LI2', s: 0.0, cargo: E }], cargoSeq: [R, R, B] } },
  { name: 'Ventania', time: 70, stars: [2, 3, 4], desc: 'O vento vira um desvio sozinho a cada 4 segundos. Conserte a tempo.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'T0>MG2', s: 0.1, cargo: R }], cargoSeq: [R, B], gremlin: 4 } },
  { name: 'Hora do rush', time: 70, stars: [4, 6, 8], desc: 'Três trens mais rápidos. Fique de olho nos três desvios.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'R2>T0', s: 0.0, cargo: R }, { seg: 'LO1>LO2', s: 0.1, cargo: B }], cargoSeq: [R, B, R, R, B], speed: 0.16 } },
  { name: 'Carga mista', time: 90, stars: [2, 3, 4], desc: 'Quase tudo azul no armazém. Cada vermelha conta.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'MG1>SW3', s: 0.0, cargo: B }, { seg: 'R1>R2', s: 0.1, cargo: E }], cargoSeq: [B, B, R] } },
  { name: 'Porto fechado', time: 90, stars: [2, 3, 4], desc: 'O desvio 3 emperrou para o Porto Safira. Só a Vila Rubi recebe.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'LO1>LO2', s: 0.1, cargo: E }], cargoSeq: [R, R, B], locked: { SW3: 0 } } },
  { name: 'Grande final', time: 120, stars: [4, 6, 8], desc: 'Três trens, vento e cargas misturadas. Dois minutos.',
    setup: { trains: [{ seg: 'SW1>SW2', s: 0.02, cargo: E }, { seg: 'R2>T0', s: 0.0, cargo: B }, { seg: 'LI1>LI2', s: 0.1, cargo: R }], cargoSeq: [R, B, B, R, R, B], gremlin: 7 } },
];

export function setupChallenge(c) {
  const sw = { SW1: 0, SW2: 0, SW3: 0, ...(c.setup.locked || {}) };
  return newGame({ ...c.setup, time: c.time, sw, seed: 1 });
}
export const measure = (c, st) => st.scores[PLAYER];
export function starsFor(c, v) { let n = 0; for (const t of c.stars) if (v >= t) n++; return n; }
export const goalText = (c) => `Estrelas por cargas entregues em ${c.time} s: ${c.stars.map((t, i) => `${'★'.repeat(i + 1)} ${t}`).join('   ')}`;
// Robô: joga a simulação inteira com o controlador. Gerador (meio segundo de jogo por pedaço).
export function* robotRunGen(c, o = ROBOT) {
  const st = setupChallenge(c);
  const ctl = makeController(PLAYER, o, () => 0.5);
  let n = 0;
  while (!st.over) { ctl(st, DT); step(st); if (++n % 30 === 0) yield; }
  return { value: measure(c, st), stars: starsFor(c, measure(c, st)), st };
}
export function solveChallenge(c, o) { const g = robotRunGen(c, o); let x; do x = g.next(); while (!x.done); return x.value; }
export function idleRun(c) { const st = setupChallenge(c); while (!st.over) step(st); return measure(c, st); }
