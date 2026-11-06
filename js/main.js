// Liga a simulação da ferrovia e a IA à cena, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { PLAYER, CPU, EMPTY, DT, MATCH_TIME, SWITCHES, SWITCH_NAMES, NET, LOCK_TIME, newGame, step, flip, canFlip, pointAt, pathAhead, winnerOf } from './rules.js';
import { OPPONENTS, ROBOT, makeController, rng } from './ai.js';
import { CHALLENGES, setupChallenge, measure, starsFor, goalText } from './challenges.js';
import { buildWorld, TABLE, BASE_Y, CARGO_COLOR, toWorld, leverPos } from './scene.js';
import { createShell } from './shell.js';
import { setTheme } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

setTheme({
  bg: 'rgba(250,244,232,0.97)', edge: '#2a6a4a', text: '#2a2a22', dim: '#6a6a5a', btn: '#e6e0cc', btnHover: '#f6d88a',
  btnOn: '#2a6a4a', btnOnText: '#ffffff', lock: '#e2ddd0', star: '#e8a82a', labelBg: 'rgba(250,244,232,0.92)',
  title: 'bold 58px Georgia, serif',
});

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TOUCH_DIST = 0.07;
const READY_T = 2.0;
const STAND = { x: TABLE.x, z: TABLE.z + 0.62 };
const CENTER = new THREE.Vector3(TABLE.x, BASE_Y, TABLE.z);

const world = buildWorld();
const { scene } = world;
const shell = createShell({ scene, sfx, save, storeSave, stand: STAND, exposure: 1.0, statusPos: new THREE.Vector3(TABLE.x, 1.92, TABLE.z - 0.62), hooks: {} });
const { renderer, camera, panel } = shell;
shell.orbit.target.copy(CENTER).add(new THREE.Vector3(0, 0.12, -0.12));
shell.orbit.dist = 1.4; shell.orbit.pitch = 0.98; shell.orbit.keys = 'wasd';
const menuCam = (t) => ({ pos: new THREE.Vector3(TABLE.x + Math.sin(t * 0.12) * 0.9, 1.45, TABLE.z + 1.1), look: new THREE.Vector3(TABLE.x, 0.95, TABLE.z - 0.3) });

// ---------- Estado ----------
let app = 'menu', mode = 'match', st = null, ch = null, oppIndex = 0;
let phase = 'idle';          // 'intro' | 'ready' | 'run' | 'over'
let time = 0, msg = null, random = rng((Date.now() % 100000) + 1);
let cpuCtl = null, robotCtl = null, readyT = 0, acc = 0, evI = 0, result = null;
const opponent = () => OPPONENTS[oppIndex];
const trainViews = [];
const _v = new THREE.Vector3();

function clearTrains() { for (const t of trainViews) { scene.remove(t.loco, t.wagon); } trainViews.length = 0; }
function setupView() {
  clearTrains();
  for (const tr of st.trains) { const v = world.makeTrain(tr.id); v.prevSeg = tr.seg; v.lastSeg = tr.seg; trainViews.push(v); world.setCargo(v, tr.cargo); }
  evI = st.events.length;
  syncTrains(0);
}
// posição de um ponto a `back` metros atrás do trem (pode estar no trecho anterior)
function behind(tr, view, back) {
  if (tr.s >= back) return pointAt(tr.seg, tr.s - back);
  const g = NET.segs[view.prevSeg];
  return pointAt(view.prevSeg, g.len - (back - tr.s));
}
function placeAlong(obj, p, h = 0) { toWorld(p.x, p.y, h, obj.position); obj.rotation.y = Math.atan2(p.dx, -p.dy); }
function syncTrains(dt) {
  st.trains.forEach((tr, i) => {
    const v = trainViews[i];
    if (tr.seg !== v.lastSeg) { v.prevSeg = v.lastSeg; v.lastSeg = tr.seg; }
    placeAlong(v.loco, pointAt(tr.seg, tr.s), 0.004);
    placeAlong(v.wagon, behind(tr, v, 0.042), 0.004);
    v.puffT -= dt * (0.4 + tr.v * 8);
    if (v.puffT <= 0 && tr.v > 0.02) { v.puffT = 0.5; v.loco.getWorldPosition(_v); _v.y += 0.035; world.puff(_v); }
  });
}

// ---------- Partidas e desafios ----------
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  const o = opponent();
  world.avatar.setStyle(o.style, o.color);
  const seed = 1 + Math.floor(random() * 9999);
  st = newGame({ seed, sw: { SW1: random() < 0.5 ? 0 : 1, SW2: random() < 0.5 ? 0 : 1, SW3: random() < 0.5 ? 0 : 1 } });
  cpuCtl = makeController(CPU, o, rng(seed + 3));
  ch = null;
  startRun();
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  const k = clamp(i, 0, CHALLENGES.length - 1);
  ch = { i: k };
  st = setupChallenge(CHALLENGES[k]);
  cpuCtl = null;
  world.avatar.setStyle('master', 0x8a7a6a);
  if (skipIntro || dev.autoplay) startRun();
  else { app = 'play'; phase = 'intro'; result = null; setupView(); placeForPlay(); showScreen('chIntro'); }
}
function startRun() {
  app = 'play'; shell.hidePanel();
  result = null; acc = 0;
  robotCtl = makeController(PLAYER, ROBOT, () => 0.5);
  setupView();
  placeForPlay();
  phase = 'ready'; readyT = READY_T;
  msg = { text: 'Preparar...', t: READY_T };
  sfx.whistle();
  updateHint();
}
function simulate(dt) {
  acc += dt;
  let n = 0;
  while (acc >= DT && !st.over && n++ < 10) {
    acc -= DT;
    if (cpuCtl) cpuCtl(st, DT);
    if (dev.autoplay) robotCtl(st, DT);
    step(st);
  }
  handleEvents();
  if (st.over) finish();
}
function handleEvents() {
  while (evI < st.events.length) {
    const e = st.events[evI++];
    if (e.type === 'flip') {
      sfx.clunk();
      if (e.who === CPU) { world.avatar.react('surpresa', 0.5); lookAtLever = { node: e.node, t: 1.2 }; }
      if (e.who === 'vento') msg = { text: `O vento virou o ${SWITCH_NAMES[e.node]}!`, t: 2 };
    } else if (e.type === 'deliver') {
      const v = trainViews[e.train]; world.setCargo(v, EMPTY);
      v.loco.getWorldPosition(_v); _v.y += 0.06;
      world.popText(_v, '+1', e.owner === PLAYER ? '#d8343a' : '#2a62d8');
      if (e.owner === PLAYER) { sfx.good(); world.avatar.react(-1, 1.2); shell.pulseAll(0.4, 40); msg = { text: `Entrega em ${e.station}!`, t: 2 }; }
      else { sfx.bad(); world.avatar.react(1, 1.2); msg = { text: `${mode === 'match' ? opponent().name : 'Azul'} entregou em ${e.station}.`, t: 2 }; }
    } else if (e.type === 'load') {
      world.setCargo(trainViews[e.train], e.cargo); sfx.load();
    } else if (e.type === 'miss' && e.cargo !== EMPTY) {
      // carga na estação errada: só um aviso discreto
    }
  }
}
function finish() {
  if (phase === 'over') return;
  phase = 'over';
  sfx.whistle();
  if (mode === 'challenge') {
    const c = CHALLENGES[ch.i];
    const value = measure(c, st), stars = starsFor(c, value);
    result = { value, stars };
    save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
    storeSave(save);
    for (let k = 0; k < stars; k++) later(0.25 * k, () => sfx.star(k));
    if (stars === 3) later(0.8, () => sfx.fanfare());
    showScreen('chResult');
  } else {
    const w = winnerOf(st);
    result = { winner: w };
    save.games[oppIndex]++;
    if (w === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); world.avatar.react(-1, 3); } else if (w === CPU) { sfx.bad(); world.avatar.react(1, 3); }
    storeSave(save);
    showScreen('over');
  }
  timerAuto = 2.5;
  updateHint();
}
let timerAuto = 0;
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
let lookAtLever = null;

function goMenu() {
  app = 'menu'; phase = 'idle';
  shell.orbit.menu = menuCam; shell.orbit.snap = true;
  ch = null;
  st = newGame({ seed: 5 });
  cpuCtl = makeController(CPU, OPPONENTS[0], rng(2));
  robotCtl = makeController(PLAYER, OPPONENTS[0], rng(3));
  setupView();
  world.avatar.setStyle('careful', OPPONENTS[0].color);
  if (shell.vr) shell.recenter();
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; shell.hidePanel(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = shell.vr;
  shell.showPanel((p) => {
    if (name === 'main') {
      p.title('Ferrovia', 72);
      p.text('Vire os desvios e leve as cargas vermelhas às suas estações', 512, 130, { size: 26, color: '#6a6a5a' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 190, 66, { size: 26 });
      p.button(`Caminhos: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); showScreen('main'); }, 417, 474, 190, 66, { size: 24 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 474, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#2a6a4a' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#6a6a5a' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 112, 116 + i * 156, 800, 136, { size: 34, sub: `${o.desc}   (vitórias: ${save.wins[i]} de ${save.games[i]})` }));
      p.text(`Partida de ${Math.floor(MATCH_TIME / 60)} min ${MATCH_TIME % 60} s. Ganha quem entregar mais.`, 512, 600, { size: 24, color: '#6a6a5a' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#6a6a5a' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Os trens andam sozinhos, sempre no mesmo sentido. Você só vira os desvios.',
        'A seta amarela mostra para onde cada desvio manda o próximo trem.',
        'Carga vermelha na estação vermelha (Vila Rubi, Porto Rubi): ponto seu.',
        'Carga azul na estação azul: ponto dele. Desvie as azuis para longe!',
        'O Armazém troca a carga de quem passa (vermelha ou azul, na sorte).',
        'Desvio virado trava por 1,2 s, e com trem em cima da agulha não vira.',
        vr ? 'VR: encoste a mão na alavanca e aperte o botão lateral (ou a pinça).' : 'PC: clique na alavanca ou aperte 1, 2 ou 3. Botão direito: câmera.',
        vr ? 'De longe: aponte o raio para a alavanca e gatilho. B ou Y: pausa.' : 'A/D/W/S também giram a câmera. Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 44, 124 + i * 54, { size: 25, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name}` : `Desafio ${ch.i + 1}: ${CHALLENGES[ch.i].name}`, 512, 130, { size: 28, color: '#6a6a5a' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); shell.recenter(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'over') {
      const w = result.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Entregas: você ${st.scores[0]} x ${st.scores[1]} ${opponent().name}`, 512, 150, { size: 38, bold: true });
      p.text(`Desvios virados: você ${st.flips[0]}, ${opponent().name} ${st.flips[1]} · cargas do armazém: ${st.loads}`, 512, 210, { size: 24, color: '#6a6a5a' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 258, { size: 24, color: '#6a6a5a' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const c = CHALLENGES[ch.i];
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 66);
      p.text(c.desc, 512, 150, { size: 26 });
      p.text(`${st.trains.length} trem(ns), ${c.time} s. Ninguém mais mexe nos desvios${c.setup.gremlin ? ' (só o vento)' : ''}.`, 512, 200, { size: 25, color: '#6a6a5a' });
      p.text(goalText(c), 512, 252, { size: 23, color: '#2a6a4a' });
      p.button('Começar', () => startRun(), 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = CHALLENGES[ch.i];
      p.title(result.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(result.stars, 512, 160, 80);
      p.text(`Cargas entregues: ${result.value}`, 512, 232, { size: 30, bold: true });
      p.text(goalText(c), 512, 276, { size: 22, color: '#6a6a5a' });
      p.text(`Melhor: ${save.ch[ch.i] || 0} estrela(s)`, 512, 314, { size: 24 });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 350, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 350, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 454, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 554, 500, 80);
    }
  });
  updateHint();
}
function placeForPlay() {
  shell.orbit.menu = null;
  if (shell.vr && !rigPlaced) { shell.recenter(); rigPlaced = true; }
  shell.orbit.snap = true;
}
let rigPlaced = false;

// ---------- Entrada: virar desvios ----------
let lastEntry = null;
const canAct = () => app === 'play' && phase === 'run' && !panel.visible && !dev.autoplay;
function tryFlip(node, src) {
  if (!canAct()) return false;
  if (st.locked[node] != null) { msg = { text: `O ${SWITCH_NAMES[node]} está emperrado.`, t: 2 }; sfx.deny(); return false; }
  if (!canFlip(st, node)) { msg = { text: st.t < st.lockUntil[node] ? 'Esse desvio acabou de virar: espere um instante.' : 'Tem trem em cima da agulha.', t: 1.6 }; sfx.deny(); return false; }
  flip(st, node, PLAYER);
  if (src && src !== 'mouse') shell.pulse(src, 0.4, 25);
  handleEvents();
  return true;
}
const leverHits = () => SWITCHES.map(n => world.levers[n].hit);
function leverUnderRay(rc) { const h = rc.intersectObjects(leverHits(), false)[0]; return h ? { node: h.object.userData.node, dist: h.distance } : null; }
function leverNear(p) {
  let best = null, bd = TOUCH_DIST;
  for (const n of SWITCHES) { world.levers[n].knob.getWorldPosition(_v); const d = _v.distanceTo(p); if (d < bd) { bd = d; best = n; } }
  return best;
}
let hoverLever = null;
const hooks = {
  tick,
  pause: () => togglePause(),
  squeezeStart: (e) => { lastEntry = e; const n = leverNear(shell.grabPoint(e)); if (n) tryFlip(n, e); },
  selectStart: (e) => {
    lastEntry = e;
    if (e.isHand) { const n = leverNear(shell.grabPoint(e)); if (n) { tryFlip(n, e); return; } }
    const h = leverUnderRay(shell.entryRay(e));
    if (h) tryFlip(h.node, e);
  },
  sessionStart: () => { rigPlaced = false; updateHint(); },
  sessionEnd: () => updateHint(),
  pointerDown: () => { const h = leverUnderRay(shell.mouseRay()); if (h) tryFlip(h.node, 'mouse'); },
  key: (k) => {
    if (k === '1' || k === '2' || k === '3') { tryFlip(`SW${k}`, 'mouse'); return true; }
    return false;
  },
};
Object.assign(shell.hooks, hooks);

// ---------- HUD, caminhos e alavancas ----------
function updateHint() {
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else t = 'Clique numa alavanca (ou 1, 2, 3) para virar o desvio · botão direito ou A/D/W/S: câmera · Esc: pausa';
  shell.setHint(t);
}
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function statusLines() {
  const left = st.time - st.t;
  if (mode === 'challenge') { const c = CHALLENGES[ch.i]; return { a: `Desafio ${ch.i + 1}: ${c.name} · ${fmtTime(left)} · entregas: ${st.scores[0]}`, b: goalText(c) }; }
  const o = opponent();
  return { a: `Entregas: você ${st.scores[0]} x ${st.scores[1]} ${o.name} · faltam ${fmtTime(left)}`, b: phase === 'ready' ? 'Preparar...' : 'Vire os desvios: vermelhas para o Rubi, azuis para longe do Safira.' };
}
let boardKey = '';
function updateScoreboard() {
  let data;
  if (!st || app === 'menu') data = { names: ['Você', 'Adversário'], scores: [0, 0], round: fmtTime(MATCH_TIME), footer: 'Escolha uma partida ou um desafio' };
  else if (mode === 'challenge') data = { names: ['Você', 'Meta'], scores: [st.scores[0], CHALLENGES[ch.i].stars[2]], round: fmtTime(st.time - st.t), footer: CHALLENGES[ch.i].name };
  else data = { names: ['Você', opponent().name], scores: st.scores, round: fmtTime(st.time - st.t), footer: 'Estação Ferrovia' };
  const key = JSON.stringify(data);
  if (key !== boardKey) { boardKey = key; world.drawBoard(data); }
}
let pathT = 0;
function updatePaths(dt) {
  pathT -= dt;
  if (pathT > 0) return;
  pathT = 0.1;
  st.trains.forEach((tr, i) => {
    const line = world.pathLine(i);
    line.visible = save.preview && app !== 'menu';
    if (!line.visible) return;
    const pos = line.geometry.attributes.position.array;
    let n = 0;
    for (const { seg, from } of pathAhead(st, tr, 0.55)) {
      const g = NET.segs[seg];
      for (let s = from; s <= g.len && n < 199; s += 0.012) { const p = pointAt(seg, s); toWorld(p.x, p.y, 0.012, _v); pos[n * 3] = _v.x; pos[n * 3 + 1] = _v.y; pos[n * 3 + 2] = _v.z; n++; }
      if (n >= 46) break;
    }
    line.geometry.setDrawRange(0, n);
    line.geometry.attributes.position.needsUpdate = true;
    line.computeLineDistances();
    line.material.color.set(CARGO_COLOR[tr.cargo]);
  });
}
function updateLevers(dt) {
  for (const n of SWITCHES) {
    const lockK = st.t < st.lockUntil[n] ? (st.lockUntil[n] - st.t) / LOCK_TIME : 0;
    world.setLever(n, st.sw[n], lockK, st.locked[n] != null, dt);
  }
}
function updateAim() {
  hoverLever = null;
  if (!canAct()) return;
  if (shell.vr) {
    for (const e of shell.ctrls) { if (!e.source) continue; const h = leverUnderRay(shell.entryRay(e)); if (h) { e.laserLen = h.dist; hoverLever = h.node; } }
  } else { const h = leverUnderRay(shell.mouseRay()); if (h) hoverLever = h.node; renderer.domElement.style.cursor = h ? 'pointer' : 'default'; }
}

// ---------- Laço ----------
function tick(dt) {
  const paused = app === 'paused';
  if (!paused) {
    time += dt;
    for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
  }
  if (st && !paused) {
    if (app === 'menu') {             // a maquete roda sozinha no menu
      acc += dt;
      while (acc >= DT) { acc -= DT; cpuCtl(st, DT); robotCtl(st, DT); step(st); if (st.over) { st = newGame({ seed: 5 }); setupView(); } }
      handleEvents();
    } else if (phase === 'ready') {
      readyT -= dt;
      if (readyT <= 0) { phase = 'run'; msg = { text: 'Já!', t: 1 }; sfx.whistle(); }
    } else if (phase === 'run') simulate(dt);
    else if (phase === 'over' && dev.autoplay) { timerAuto -= dt; if (timerAuto <= 0 && mode === 'match') newMatch(oppIndex); }
  }
  if (st) { syncTrains(paused ? 0 : dt); updateLevers(dt); updatePaths(dt); }
  updateAim();
  shell.showPinch = canAct();
  if (lookAtLever) { lookAtLever.t -= dt; if (lookAtLever.t <= 0) lookAtLever = null; }
  const look = lookAtLever ? leverPos(lookAtLever.node, new THREE.Vector3()) : phase === 'run' ? CENTER : camera.getWorldPosition(_v);
  world.avatar.state.thinking = false;
  world.avatar.update(dt, time, look);
  world.animate(dt, time);
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  shell.setStatus(app === 'play' && st ? { ...statusLines(), msg: msg?.text } : null);
  updateScoreboard();
  sfx.trains(st && app !== 'paused' ? st.trains.reduce((a, t) => a + t.v, 0) / Math.max(1, st.trains.length) / 0.12 : 0);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true   o robô vira os desvios por você   dev.advance(5)   avança 5 s na hora
// dev.state()           resumo                           dev.loadLevel(3) abre o desafio 3 (1 a 10)
// dev.startMatch(2)     partida contra o 2 (1 a 3)        dev.win()        ganha a partida/desafio na hora
// dev.leverScreen('SW1') posição da alavanca na tela      dev.resetSave()  apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  advance(sec, stepT = 1 / 60) {
    const frames = Math.round(sec / stepT);
    for (let i = 0; i < frames; i++) shell.step(stepT);
    shell.resetClock(); shell.render();
    return this.state();
  },
  win() {
    if (!st || app !== 'play') return this.state();
    if (mode === 'challenge') st.scores[0] = Math.max(st.scores[0], CHALLENGES[ch.i].stars[2]);
    else st.scores = [Math.max(st.scores[0], st.scores[1] + 5), st.scores[1]];
    st.t = st.time; st.over = true; phase = 'run'; finish();
    return this.state();
  },
  leverScreen(n) { const p = world.levers[n].knob.getWorldPosition(new THREE.Vector3()).project(camera); return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight }; },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    if (!st || app === 'menu') return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${CHALLENGES[ch.i].name}` : null,
      tempo: +st.t.toFixed(2), falta: +(st.time - st.t).toFixed(1), entregas: st.scores.slice(),
      desvios: { ...st.sw }, viradas: st.flips.slice(), trens: st.trains.map(t => `${t.seg}@${t.s.toFixed(2)} carga ${t.cargo}`),
      trensEmCena: trainViews.length, apontada: hoverLever,
      estrelas: mode === 'challenge' && result ? result.stars : null,
      vencedor: mode === 'match' && phase === 'over' && result ? (result.winner === PLAYER ? 'você' : result.winner === CPU ? opponent().name : 'empate') : null,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.ferrovia = { dev, get st() { return st; }, save, camera, scene, renderer, world, shell };

goMenu();
shell.start();
