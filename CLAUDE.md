# FerroviaVR

Ferrovia: maquete de trem em tempo real em VR para o Meta Quest 3 no navegador (WebXR), sem instalar
nada. Na varanda de uma fazenda de café numa tarde clara, uma mesa grande tem uma maquete com
gramado, laguinho, arvorezinhas e trilhos de mão única. Três trenzinhos andam sozinhos; você vira os
desvios com a mão para levar as cargas vermelhas às suas estações e mandar as azuis para longe das do
adversário, que vira os mesmos desvios. Partidas de 2 min 30 s contra 3 adversários com personalidade e
10 desafios com 3 estrelas. Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos `https://parappathe.github.io/FerroviaVR/`
e apertar "Entrar em VR". (Publicação é com o Eduardo: `python publicar.py FerroviaVR` na pasta `C:\claude code`.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8869` (o painel de visualização usa
`.claude/launch.json`). `python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Virar um desvio | Encostar a mão na bolinha amarela da alavanca (até 7 cm) e apertar o botão lateral | Clicar na alavanca, ou teclas 1, 2 e 3 |
| De longe | Apontar o raio para a alavanca e gatilho | |
| Ver para onde vai | Seta amarela no começo da saída ativa de cada desvio; linha tracejada da cor da carga mostra o caminho de cada trem (Menu → Caminhos liga e desliga) | O mesmo |
| Só com as mãos | Pinça perto da alavanca vira; pinça apontando vira de longe | |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| Câmera | (sua cabeça) | Botão direito arrastando ou A/D/W/S |
| FPS | Menu → FPS | Tecla F |

No VR você fica em pé de frente para a mesa (maquete a 87 cm do chão, 1,24 x 0,8 m); as alavancas 1 e 2
ficam na beira perto de você e a 3 do outro lado (alcance pelo raio). O adversário fica em pé do outro
lado, olha para a alavanca que virou e comemora ou fica triste nas entregas.

### Regras

- Os trilhos são de mão única. Embaixo, os desvios 1 e 2 mandam cada trem por um de três caminhos para
  cima: Vila Rubi (vermelha), Vila Safira (azul) ou o Armazém. Em cima tudo se junta e o desvio 3 manda
  o trem descer pelo Porto Rubi (vermelho) ou pelo Porto Safira (azul).
- Carga vermelha passando numa estação vermelha: 1 ponto seu e o vagão esvazia. Carga azul numa azul:
  ponto do adversário. Carga na estação da outra cor: nada. O Armazém sempre troca a carga de quem passa
  por uma nova (vermelha ou azul, numa sequência sorteada no começo da partida).
- Os dois viram os mesmos desvios. Depois de virado, o desvio trava por 1,2 s; com trem a menos de 5 cm
  da agulha (ou o vagão ainda em cima) não vira. Trem que chega perto de outro espera.
- Partida de 150 s; ganha quem entregou mais. A posição inicial dos desvios é sorteada.
- Adversários (em `js/ai.js`): **Seu Arlindo** (cauteloso: cuida das cargas dele, vira cedo e com
  calma, quase não atrapalha), **Rita Vapor** (arriscada: reage rápido e desvia as suas cargas sem dó,
  mas erra às vezes), **Engenheiro Leopoldo** (pensa à frente: planeja dois desvios adiante e vira no
  último instante, quando a trava de 1,2 s já cobre a chegada do trem).
- Desafios (em `js/challenges.js`, só você vira os desvios): 1 Primeira entrega, 2 Dois trens, 3 Só
  vermelho, 4 Desvio emperrado, 5 Expresso, 6 Ventania (o vento vira um desvio a cada 4 s), 7 Hora do
  rush, 8 Carga mista, 9 Porto fechado, 10 Grande final. Estrelas por cargas entregues no tempo.
- Progresso salvo no navegador (localStorage, chave `ferroviavr.v1`).

## Como testar

- `npm test` (ou `node tests/run.js`): trilhos (3 desvios, rede fechada, emendas sem quina, raio
  mínimo, cabe na mesa), simulação (trens andam, determinística, desvio reto, entrega, carga errada,
  armazém troca, trava de 1,2 s, agulha ocupada, emperrado, trens não se atravessam e não travam para
  sempre, acaba no tempo), IA (escolhe a saída certa para cada lado, sabotagem por estilo, menos de 5 ms
  por quadro), IA contra IA em 36 partidas de 150 s até o fim, metade de cada lado (Leopoldo ganha
  mais que perde dos dois, Rita do Arlindo; mostra os placares), robô tira 3 estrelas nos 10 desafios e
  sem mexer nos desvios não dá 3, e fumaça do `main.js` (carrega o jogo no Node com navegador e WebGL de
  mentira; tecla 1, clique na alavanca 2, desvio travado, mão de VR de mentira na alavanca 3, partida
  inteira com o robô até o apito, os 10 desafios carregados pelo mesmo caminho do menu e o robô dentro
  do jogo entregando exatamente o mesmo que a simulação do teste, 3 estrelas, `dev.win()`, pausa
  congela os trens). Tem que terminar com "Tudo certo"; sai com código 1 se algo falhar (ou 200 s).
- O teste de fumaça usa `module.registerHooks` do Node (22.15 ou mais novo).
- No navegador (console): `dev.autoplay = true` (o robô vira por você), `dev.advance(5)`, `dev.state()`
  (tempo, entregas, desvios, trens e cargas), `dev.loadLevel(3)`, `dev.startMatch(2)`, `dev.win()`,
  `dev.leverScreen('SW1')`, `dev.resetSave()`. `window.ferrovia` tem `st`, `save`, `camera`, `scene`, `renderer`, `world`, `shell`.
- **Só dá para testar no óculos:** encostar a mão na alavanca, raio de longe na alavanca 3, mãos,
  vibração nas entregas, placas e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar e dica do PC |
| `js/rules.js` | Rede (`NODES`, `SEGMENTS`, `STATIONS`, curvas de Bézier amostradas em `NET`), estado (`newGame`), simulação em passos de 1/60 s (`step`, `run`), desvios (`flip`, `canFlip`), `pointAt`, `pathAhead`. Sem navegador |
| `js/ai.js` | Adversários, robô, valor de cada saída (`desiredBranch`), controlador (`makeController`). Sem navegador |
| `js/challenges.js` | Os 10 desafios e o robô que joga a simulação inteira (`robotRunGen`, `solveChallenge`). Sem navegador |
| `js/shell.js` | Casca: render, câmera, VR, mouse/teclado, painel, placas, FPS, laço |
| `js/main.js` | O jogo: simulação no tempo, alavancas (mão, raio, mouse, teclas), trens e vagões na tela, fumaça, entregas, caminhos, menus, HUD, `dev` |
| `js/scene.js` | Varanda e cafezal, mesa, maquete, trilhos (lastro, trilhos e dormentes), setas dos desvios, estações, alavancas, trens, placar, adversário |
| `js/avatar.js`, `js/ui.js`, `js/audio.js`, `js/save.js` | Boneco, painel/placas, sons (apito, alavanca, carga, tchu-tchu, passarinhos e bem-te-vi), progresso |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8869, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: mesa em metros, x para a direita e y para longe de quem joga, centro (0, 0); no Three.js
fica em (TABLE.x + x, 0,87, TABLE.z - y), mesa em (0; -0,5).

## Regras e convenções do projeto

- `rules.js`, `ai.js` e `challenges.js` não usam navegador nem Three.js.
- A simulação anda sempre em passos de `DT` (1/60 s), também no jogo (acumulador), para o jogo e os
  testes darem o mesmo resultado; os controladores (IA e robô) são chamados antes de cada passo.
- Mexeu na rede, nas regras, na IA ou nos desafios: rodar `npm test`. As metas dos desafios saem do
  que o robô entrega (3 estrelas = robô).
- Testes nunca tocam som.

## Decisões

- Mão única e desvios só "de agulha" (as junções só juntam): jogabilidade antes de realismo.
- O Armazém troca qualquer carga: na primeira versão ele só carregava trem vazio, e carga azul desviada
  nunca mais saía do trem (a partida travava com todos os trens azuis rodando).
- Trava de 1,2 s depois de virar: cria a briga de "quem vira por último" sem virar uma guerra de cliques.
- A IA desconta o que vem depois do próximo desvio (×0,6); sem isso o trem vazio não voltava ao Armazém.
- Desvios começam em posição sorteada: com todos retos, o caminho padrão levava ao Porto Safira e o
  lado azul ganhava de graça.
- Sem luz com sombra (só céu e sol fracos), para o Quest a 72 Hz.
- Porta do servidor local 8869.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: alcance das alavancas (a 3 fica do outro lado da mesa), tamanho dos
  trens (3,6 cm), mãos, vibração, placas e FPS.
- Contra gente, o Engenheiro Leopoldo pode estar difícil (vira no último instante); a Rita e o Arlindo
  ficam perto um do outro (7 x 5 em 12).
