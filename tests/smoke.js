// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, partida (com o robô), clique do PC com prévia e desafios funcionam.
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  await import('../js/main.js');
  const dev = window.dev;
  const G = window.ferrovia;
  const THREE = await import('../vendor/three/three.module.js');
  ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
  let s = dev.advance(1);
  ok(s.tela === 'menu' && s.painel, 'abre no menu principal (a maquete roda sozinha atrás)');
  ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);

  s = dev.startMatch(1);
  ok(s.tela === 'play' && s.adversario === 'Seu Arlindo' && s.trensEmCena === 3 && s.fase === 'ready', 'partida contra o Seu Arlindo montada com 3 trens');
  s = dev.advance(2.2);
  ok(s.fase === 'run', 'depois do "preparar", os trens andam');
  const t0 = s.trens.join();
  s = dev.advance(1);
  ok(s.trens.join() !== t0 && s.tempo > 0.9, `os trens andaram (${s.tempo} s de simulação)`);

  // tecla 1 vira o desvio 1
  const st = G.st;
  const before = st.sw.SW1;
  let tries = 0;
  while (!(await import('../js/rules.js')).canFlip(st, 'SW1') && tries++ < 60) dev.advance(0.1);
  win.dispatch('keydown', { key: '1' });
  s = dev.advance(0.05);
  ok(s.desvios.SW1 === 1 - before && s.viradas[0] >= 1, 'tecla 1 vira o desvio 1');
  // clique na alavanca do desvio 2
  const R = await import('../js/rules.js');
  tries = 0;
  while (!R.canFlip(st, 'SW2') && tries++ < 60) dev.advance(0.1);
  const b2 = st.sw.SW2;
  const lp = dev.leverScreen('SW2');
  const canvasEl = G.renderer.domElement;
  canvasEl.dispatch('pointermove', { clientX: lp.x, clientY: lp.y });
  s = dev.advance(0.03);
  ok(s.apontada === 'SW2', `mouse em cima da alavanca 2 (apontada: ${s.apontada})`);
  canvasEl.dispatch('pointerdown', { clientX: lp.x, clientY: lp.y, button: 0 });
  win.dispatch('pointerup', {});
  s = dev.advance(0.05);
  ok(s.desvios.SW2 === 1 - b2, 'clicar na alavanca vira o desvio 2');
  // desvio que acabou de virar trava
  const b2b = st.sw.SW2;
  canvasEl.dispatch('pointerdown', { clientX: lp.x, clientY: lp.y, button: 0 });
  win.dispatch('pointerup', {});
  s = dev.advance(0.05);
  ok(s.desvios.SW2 === b2b, 'desvio recém-virado fica travado um instante');

  // VR (controle de mentira): encostar a mão na alavanca 3 e apertar o botão lateral
  tries = 0;
  while (!R.canFlip(st, 'SW3') && tries++ < 60) dev.advance(0.1);
  const b3 = st.sw.SW3;
  const entry = G.shell.ctrls[1];
  entry.source = { handedness: 'right', gamepad: { buttons: [], axes: [0, 0, 0, 0] } };
  entry.side = 'right';
  const rigInv = new THREE.Matrix4().copy(G.shell.rig.matrixWorld).invert();
  const knob = G.world.levers.SW3.knob.getWorldPosition(new THREE.Vector3());
  entry.grip.position.copy(knob.clone().add(new THREE.Vector3(0, 0.02, 0.04)).applyMatrix4(rigInv));
  G.shell.rig.updateMatrixWorld(true);
  G.shell.hooks.squeezeStart(entry);
  s = dev.advance(0.05);
  ok(s.desvios.SW3 === 1 - b3, 'VR: aperto com a mão na alavanca vira o desvio 3');
  G.shell.hooks.squeezeEnd?.(entry);
  entry.source = null; entry.side = null;

  // o resto da partida: o robô vira por você até o apito final
  dev.autoplay = true;
  let guard = 0;
  while (!dev.state().vencedor && guard++ < 1000) s = dev.advance(0.5);
  s = dev.state();
  ok(s.vencedor && s.falta <= 0, `partida acabou no tempo (${s.entregas.join(' x ')}, vencedor: ${s.vencedor})`);
  ok(s.entregas[0] + s.entregas[1] > 2, 'houve entregas dos dois lados ou de um');
  ok(JSON.parse(store.get('ferroviavr.v1') || '{"games":[]}').games[0] === 1, 'resultado salvo no localStorage');

  // Desafios pelo mesmo caminho do menu; o robô do jogo tem que fazer o mesmo que o do teste
  const C = await import('../js/challenges.js');
  let stars = [], loadedOk = true, same = true;
  for (let n = 1; n <= C.CHALLENGES.length; n++) {
    s = dev.loadLevel(n);
    const c = C.CHALLENGES[n - 1];
    if (s.trensEmCena !== c.setup.trains.length || s.falta !== c.time) loadedOk = false;
    let g = 0;
    while (dev.state().estrelas == null && g++ < 600) dev.advance(0.5);
    s = dev.state();
    stars.push(s.estrelas);
    if (s.entregas[0] !== C.solveChallenge(c).value) same = false;
  }
  ok(loadedOk, 'cada desafio aparece montado (trens e tempo certos)');
  ok(same, 'o robô dentro do jogo entrega o mesmo número que a simulação do teste');
  ok(stars.every(x => x === 3), `robô tira 3 estrelas nos ${C.CHALLENGES.length} desafios dentro do jogo (${stars.join(' ')})`);
  ok(Object.keys(JSON.parse(store.get('ferroviavr.v1') || '{"ch":{}}').ch).length === C.CHALLENGES.length, 'estrelas dos desafios salvas');

  dev.autoplay = false;
  dev.loadLevel(10); dev.advance(3);
  s = dev.win();
  ok(s.estrelas === 3, 'dev.win() resolve o desafio');
  dev.startMatch(2); dev.advance(3);
  s = dev.win();
  ok(s.vencedor === 'você', 'dev.win() ganha a partida');

  dev.startMatch(3);
  dev.advance(2.5);
  const tp = dev.state().tempo;
  win.dispatch('keydown', { key: 'Escape' });
  s = dev.advance(1);
  ok(s.tela === 'paused' && s.tempo === tp, 'Esc pausa e os trens param');
  win.dispatch('keydown', { key: 'Escape' });
  s = dev.advance(0.5);
  ok(s.tela === 'play' && s.tempo > tp, 'Esc de novo continua');
  const loop = G.renderer._loop;
  for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
  ok(typeof loop === 'function', 'laço de animação ligado');
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
