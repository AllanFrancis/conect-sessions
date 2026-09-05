# Journal — SPEC-20260904-2036

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-04 21:28
**Onde tô:** 10 de 10 critérios [x]; `close --dry` diz pronto: SIM
**Próximo passo:** usuário decide o `close` e o git; nada commitado
**Última decisão:** puxar a resposta órfã para esta SPEC ("Puxar para esta SPEC", 21:11) — virou a peça 5 e o critério 9
**Bloqueio atual:** nenhum — falta só a decisão de fechamento
**Se retomar, ler:** main.md (4 peças) + [descoberta] 20:37 (os 3 defeitos) + [tentativa] 20:59 (harness com verde falso) + [decisão] 21:04 + [decisão] 21:17 + [conclusão] 21:27

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | Entrega atômica de reply (`sync.ts`) | feito, critério 1 [x] | 2026-09-04 20:50 |
| 2 | Cursor só avança com confirmação | feito, critério 2 [x] | 2026-09-04 20:52 |
| 3 | Tick sem sobreposição + concorrência limitada | feito, critérios 3 e 6 [x] | 2026-09-04 20:58 |
| 4 | Retentativa com causa no log | feito, critério 4 [x] | 2026-09-04 20:52 |
| 5 | Resposta órfã: sync drena todas as sessões do agente | feito, critério 9 [x] | 2026-09-04 21:18 |
| 6 | Passe real de ≥10 min | feito, critério 10 [x] — 11/11 entregues, 0 duplicadas | 2026-09-04 21:27 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
- fato: o mesmo reply era entregue 3× — reproduzido contra o deploy; com a correção, 1×
- fato: em falha de POST o agente antigo perdeu 1057 ids de mensagem; o corrigido perdeu 0 de 398
- fato: com `LRC_CONCURRENCY=1` o agente antigo chegou a 3 requisições em voo (ticks sobrepostos); o corrigido, 1
- fato: ciclo em regime estável 3153ms (LRC_INTERVAL=2000, 9 sessões, 800ms de latência) — os ~7s temidos não acontecem
- fato: agente anterior a esta SPEC grava 15 sessões e 1848 mensagens contra a API nova, 0 recusas
- fato: log de falha passou a nomear a causa — `fetch failed (ECONNREFUSED)` em vez de só `fetch failed`
- fato: typecheck e lint exit 0; `specctl lint` 0/0
- fato: o deploy do Vercel serve o `main` byte a byte, mas ainda SEM esta correção — o passe está contra localhost
- inferência: o `fetch failed` do usuário vinha do empilhamento; não reproduzi (243/243 ok numa sonda de 4 min), então a correção é defensiva
- dúvida: o critério 6 pede "na ordem do LRC_INTERVAL"; 3153ms é 1,6× os 2000ms — número posto na evidência
- fato: o passe local não cobre a hospedagem do Vercel (cold start, limites de conexão, latência real de ~800ms)
- fato: o 1º passe FALHOU — 6 de 11 respostas nunca entregues, exatamente as 6 sessões que o monitor não vê (15 no banco, 9 monitoradas)
- fato: a causa era anterior a esta SPEC — o tick só POSTa sessão monitorada ou com mensagem nova; sessão encerrada nunca era POSTada e o reply dela morria pendente
- fato: com a peça 5, a mesma sonda que dava "TRANSCRIPT-ONLY: false" agora dá "true", e a resposta do agente vizinho segue pendente e intocada

### Respostas-chave do usuário
- 2026-09-04 18:22 — publicou no Vercel e reportou reply triplicado e `fetch failed`
- 2026-09-04 20:33 — escopo "Os três defeitos (Recomendado)" e área `dashboard`
- 2026-09-04 21:03 — "aceitp o passe local como evidência" — NÃO é aceite de gap: o critério é cumprido, muda o ALVO
- 2026-09-04 21:11 — "Puxar para esta SPEC" (resposta órfã) e "Refazer com o alvo certo" (passe)

### Tentativas que falharam
- teste de sobreposição passava nos dois agentes: latência de 120ms fazia o tick antigo caber no intervalo — parametrizei a latência
- medidor de ciclo por "pausa longa" quebrou quando os ticks passaram a emendar — troquei por repetição de `external_id`
- `await sleep(INTERVAL)` depois do tick transformava intervalo em pausa: ciclo de 5,05s — passou a dormir o que sobra
- perda deu FAIL com concorrência 4: era a janela de 22s do harness, não o código

### Arquivos tocados
- `src/routes/api/public/agent/sync.ts` (entrega atômica) · `public/agent/remote-agent.mjs` (`readNew`/`tick`/`postSync`/laço, +`emLotes`, +`motivoDaFalha`, +`LRC_CONCURRENCY`) · `eslint.config.js` (ignora `.scratch`)
- `tmp/`: 5 harnesses + `agente-antes.mjs` (cópia do HEAD, para o antes/depois)

### Onde parei
Nada commitado, branch `feat/sync-resiliente`. Código completo, 10/10 critérios, `close --dry` pronto: SIM. Banco limpo (0 agentes/sessões/replies de teste), `.scratch/` removido, dev server parado.

### Sessões (máx 5 linhas + 1 agregada)
- 2026-09-04 17:27–20:33 — diagnóstico: deploy velho do Lovable, outro banco, e os 3 defeitos do round-trip
- 2026-09-04 20:36–21:00 — SPEC aberta, 4 peças implementadas, antes/depois medido, 8 critérios fechados

## LOG (append-only — NUNCA editar entradas antigas)
<!-- tipos: ativação descoberta decisão tentativa blocker unblock refactor nota conclusão | entrada nova: specctl log -->

## 2026-09-04 20:36 — [ativação] SPEC criada e ativada (@AllanFrancis, branch feat/sync-resiliente, base main)

## 2026-09-04 20:37 — [descoberta] Três defeitos no round-trip, dois reproduzidos contra o Vercel

Origem: usuário publicou no Vercel (conect-sessions.vercel.app) e rodou o agente
contra ele. O console mostrou a mesma resposta remota ("Faça o commit") entregue
3 vezes, e `erro ao sincronizar kiro:sess_... fetch failed` repetido.

Confirmei antes de qualquer hipótese que o deploy está correto: o
`/api/public/agent/remote-agent` do Vercel é byte a byte idêntico ao
`public/agent/remote-agent.mjs` do main. Ou seja, o código publicado É o nosso.

DEFEITO 1 — reply entregue N vezes. REPRODUZIDO.
O handler faz SELECT dos replies pendentes e SÓ DEPOIS marca `delivered`. Criei
uma sessão e um reply pendente por SQL, disparei 3 syncs em paralelo da mesma
sessão: as 3 receberam o mesmo reply. Como o `deliverReplies()` executa o
`LRC_REPLY_CMD`, o comando do usuário rodaria 3x.

DEFEITO 2 — mensagem perdida em falha de POST. Confirmado por leitura de código.
`readNew()` faz `sent.set(file, lines.length)` ANTES do POST em `tick()`. Se o
POST falha (HTTP ou transporte), o offset já avançou e aquelas mensagens não são
reenviadas nunca mais naquele processo. Foi exatamente o que aconteceu na
tempestade de 500 do preview antigo do Lovable: todo tick avançou offset sem
gravar nada. É o pior dos três porque some dado sem avisar.

DEFEITO 3 — ticks se atropelam.
`setInterval(tick, 2000)` não espera o tick anterior. Cada tick faz um POST
sequencial por sessão, e medi ~800ms de latência até o Vercel (20/20 ok,
mediana 802ms). Com 9 sessões o tick leva ~7s: ficam ~4 ticks em voo. É a causa
do defeito 1 e multiplica a carga por 4.

O `fetch failed` NÃO foi reproduzido. Sonda de 4 minutos no ritmo do agente:
243/243 ok. Teste de 4 ticks sobrepostos: 36/36 ok. Então não vou afirmar causa;
o gatilho provável é o empilhamento do defeito 3 sustentado por mais tempo. O
tratamento é defensivo: retentar, e imprimir `err.cause`, que hoje é descartado
— por isso a mensagem "fetch failed" não ajuda em nada.

Limpeza: removi todas as linhas `diag:%` que criei no banco do usuário.
⎿ commit e1de995

## 2026-09-04 20:56 — [nota] verify: 2/2 critérios passaram (commit `e1de995`)

- PASS: Typecheck limpo | verify: `bunx tsc --noEmit`
- PASS: Lint limpo | verify: `bun run lint`

## 2026-09-04 20:59 — [nota] Quatro peças implementadas; antes/depois medido com o mesmo harness

Servidor (`sync.ts`): entrega e marcação viram UM comando, `UPDATE ... RETURNING`
filtrando por `session_id` e `status = 'pending'`. A ordenação por `created_at`
migrou para o handler, porque o UPDATE não aceita `order`.

Agente (`remote-agent.mjs`), três mudanças:
- `readNew()` não mexe mais no mapa `sent`; devolve `{ messages, nextOffset }`.
  O `nextOffset` é o mínimo entre o fim do arquivo e a primeira linha que não
  parseou — linha meio escrita continua sendo relida. O `tick()` só grava o
  cursor depois que TODOS os lotes voltaram ok.
- `setInterval` virou laço auto-agendado, e o passo 2 ganhou concorrência
  limitada (`LRC_CONCURRENCY`, padrão 4) via `emLotes()`, com trabalhadores
  puxando de fila compartilhada — sessão lenta não segura as outras.
- `postSync()` retenta transporte e 5xx (backoff 500ms, 1500ms), não retenta
  4xx, e todo log de falha passa por `motivoDaFalha()`, que anexa o
  `err.cause?.code` que antes era descartado.

MEDIÇÕES, o mesmo harness rodando contra o agente ANTES e DEPOIS (o
`tmp/agente-antes.mjs` é `git show HEAD:public/agent/remote-agent.mjs`):

| medida                         | antes | depois |
|--------------------------------|-------|--------|
| mensagens perdidas em falha    | 1057  | 0      |
| máximo em voo (limite 1)       | 3     | 1      |
| causa da falha no log          | não   | sim    |
| retentativas                   | 0     | 2      |

- Corrida de reply: 3x contra o deploy antigo, 1x contra o corrigido.
- Compatibilidade: agente antigo contra a API nova gravou 15 sessões e 1848
  mensagens, 0 recusas.
- Ciclo em regime estável: 3153ms médio (LRC_INTERVAL=2000, 9 sessões, 800ms de
  latência simulada). Os 2000ms que o agente antigo aparentava eram artefato da
  sobreposição: ele começava um tick novo sem ter terminado o anterior.

Uma correção de rumo no meio: eu tinha escrito `await sleep(INTERVAL)` depois do
tick, o que transforma o intervalo em PAUSA e não em período — o ciclo dava
5,05s. Passou a dormir o que sobra do intervalo, com piso de 25% para não
martelar um servidor degradado emendando tick em tick.
⎿ commit e1de995+dirty · 3 files changed, 167 insertions(+), 44 deletions(-)

## 2026-09-04 20:59 — [tentativa] Dois harnesses que passavam sem provar nada

Registro porque quase fecharam critério com verde falso.

1) O teste de sobreposição passava nos DOIS agentes. O servidor falso respondia
   em 120ms, então o tick antigo (9 sessões sequenciais) cabia dentro dos 2s do
   intervalo e nunca sobrepunha. Teste que não pode falhar não prova nada.
   Corrigido parametrizando a latência: com 400ms o agente antigo chega a 3
   requisições em voo e o teste passa a discriminar.

2) O medidor de ciclo detectava fronteira de tick por "pausa longa entre
   requisições". Depois que o laço passou a dormir só o que sobra do intervalo,
   os ticks emendaram, a pausa sumiu e o medidor passou a reportar ciclos de
   11 a 28 segundos — que não existiam. Trocado por um detector que não depende
   de tempo: cada tick toca uma sessão no máximo uma vez, então a REPETIÇÃO de
   um `external_id` marca o tick seguinte.

3) Um susto que não era defeito: com concorrência 4 e latência 800ms, o teste de
   perda deu FAIL. Era a janela de 22s do harness, curta demais para o agente
   reenviar tudo nessas condições. Com 60s: 398 de 398 ids recuperados. Antes de
   culpar o código, aumentei a janela.
⎿ commit e1de995+dirty · 3 files changed, 167 insertions(+), 44 deletions(-)

## 2026-09-04 21:01 — [nota] 8 de 9 critérios fechados; passe longo em execução e o 9 depende de decisão do usuário

Estado ao pausar a sessão. Código completo, nada commitado.

Fechados com evidência (8): entrega atômica (3x → 1x), cursor com confirmação
(1057 perdidas → 0), sem sobreposição (3 em voo → 1), causa no log
(`fetch failed` → `fetch failed (ECONNREFUSED)` com 2 retentativas),
compatibilidade do agente antigo (15 sessões, 1848 mensagens, 0 recusas),
ciclo 3153ms, typecheck e lint exit 0.

O antes/depois foi medido com o MESMO harness rodando contra
`tmp/agente-antes.mjs`, que é `git show HEAD:public/agent/remote-agent.mjs` —
não é lembrança minha, é o código anterior executando.

ABERTO — critério 9, e a decisão é do usuário (R.6.2, não decido sozinho):
o critério diz "agente contra o VERCEL por ≥10 min". O passe está rodando contra
`localhost:8082`, porque o deploy do Vercel serve o `main` e o `main` ainda não
tem esta correção. Mesmo que o passe local passe, ele NÃO fecha o critério como
escrito. Os dois caminhos que ofereci:
  (a) commitar e dar push; o Vercel reconstrói sozinho, e eu rodo o passe final
      contra o deploy — fecha o critério como está escrito;
  (b) o usuário aceitar explicitamente o passe local como evidência.

Nota de processo: meu vigia do passe saiu cedo porque o `grep -E "PASS|FALHOU"`
casou com "PASSE-2036" no texto das respostas de teste. Corrigido para ancorar
no início da linha.
⎿ commit e1de995+dirty · 4 files changed, 210 insertions(+), 44 deletions(-)

## 2026-09-04 21:04 — [decisão] Usuário aceita o passe local como evidência do critério 9

Citação literal do usuário, 2026-09-04 21:03:

  "aceitp o passe local como evidência"

Contexto da pergunta: o critério 9 foi escrito como "Passe real: agente contra o
VERCEL por ≥10 min". O passe rodou contra `localhost:8082`, porque o deploy do
Vercel serve o `main` e o `main` ainda não tem esta correção. Ofereci dois
caminhos — (a) commitar, dar push, deixar o Vercel reconstruir e rodar o passe
contra o deploy; (b) aceitar o passe local. O usuário escolheu (b).

Isto NÃO é `[aceito-incompleto]`: o critério é cumprido de fato — agente real,
servidor real com a correção, banco real, ≥10 minutos, respostas enviadas pelo
painel e conferidas no `LRC_REPLY_FILE`. O que muda é o ALVO: `localhost` em vez
do deploy. Por isso o texto do critério fica como está e a evidência diz o alvo
com todas as letras, em vez de eu reescrever o contrato para ele casar com o que
eu consegui fazer.

O que este passe NÃO cobre, e vale dizer: a camada de hospedagem do Vercel —
cold start de função serverless, limites de conexão da plataforma, e a latência
real de ~800ms que era a suspeita para o `fetch failed` não reproduzido. Se o
`fetch failed` voltar depois do deploy, o log agora vai nomear a causa, que é
justamente o que faltava para diagnosticá-lo.
⎿ commit e1de995+dirty · 4 files changed, 210 insertions(+), 44 deletions(-)

## 2026-09-04 21:07 — [nota] close --dry: duas travas, ambas dependentes do passe que termina agora

Rodado a pedido do usuário. Resultado:

  ✗ critério 9 aberto sem evidência
  ✗ [conclusão] ausente no LOG
  ▸ digest.md ausente — será gerado no close
  pronto: NÃO

Nenhuma surpresa, e nenhuma das duas é resolvível antes do veredito do passe:
não marco o critério 9 sem ver o resultado, e a [conclusão] tem que dizer o que
o passe mostrou, não o que eu espero que ele mostre.

O gate cita a R.6.2 na rota do critério 9 ("só o USUÁRIO aceita incompleto").
Registro de novo para não confundir quem ler o journal depois: aqui NÃO é aceite
de incompleto. O critério vai ser cumprido de fato — agente real, servidor real
com a correção, banco real, ≥10 min, respostas enviadas pelo painel e conferidas
no LRC_REPLY_FILE. O que o usuário aceitou foi o ALVO (localhost em vez do
deploy), e isso vai escrito na evidência.

Estado do passe neste momento: 10 respostas enviadas, aguardando o fechamento da
janela e as asserções.
⎿ commit e1de995+dirty · 4 files changed, 210 insertions(+), 44 deletions(-)

## 2026-09-04 21:10 — [descoberta] Passe FALHOU: reply em sessão não monitorada nunca é entregue

O passe de 11 min contra localhost deu FALHOU. Números crus:

  respostas enviadas pelo painel: 11
    entregues:      5
    DUPLICADAS:     0     <- o que esta SPEC corrigiu, funcionou
    nao entregues:  6
  replies ainda pendentes:  6
  mensagens sincronizadas:  1848
  falhas de sync no log:    0

O 6 nao era ruido. O agente tinha 15 sessoes e o monitor enxerga 9: 15-9=6.

Confirmado por experimento dirigido (.scratch/quem-recebe-reply.mjs): inseri um
reply numa sessao MONITORADA e outro numa `transcript-only`, com o mesmo agente
e no mesmo minuto.
  entregue da MONITORADA:      true
  entregue da TRANSCRIPT-ONLY: false

CAUSA: o `tick()` so faz POST para (1) arquivos com mensagem nova e (2) sessoes
que o `monitorScan()` enxerga NESTE tick. Uma sessao que existe no banco porque
a transcricao foi lida uma vez, mas que o monitor nao ve mais e que nao recebeu
mensagem nova, nunca e POSTada — e como o reply so viaja na resposta do POST
daquela sessao, ele fica `pending` para sempre.

ISTO E ANTERIOR A ESTA SPEC. O passo 2 sempre percorreu apenas o `byId`; minhas
quatro pecas nao mudaram QUAIS sessoes sao POSTadas. Eu ja tinha esbarrado nisso
hoje, na sessao af1b7738 do passe da SPEC-1457, e registrei como comportamento
existente. O que mudou agora e que ele foi medido.

SOBRE O CRITERIO 9: ele pede "zero reply duplicado e zero mensagem perdida".
Duplicado: 0. Mensagem perdida: 0 (1848 sincronizadas, 0 falhas). O que falhou
foi uma assercao EXTRA que eu escrevi no harness — "toda resposta enviada tem
que ser entregue" —, mais forte que o criterio e que esbarra num defeito fora do
escopo desta SPEC. Nao vou afrouxar o harness em silencio para ele passar;
levei a decisao ao usuario.
⎿ commit e1de995+dirty · 4 files changed, 210 insertions(+), 44 deletions(-)

## 2026-09-04 21:17 — [decisão] Defeito da resposta órfã puxado para esta SPEC, a pedido do usuário

Perguntei o que fazer com o defeito que o passe revelou (resposta para sessão não
monitorada morre pendente). Escolha do usuário, 2026-09-04 21:11: "Puxar para
esta SPEC (Recomendado)", e para o critério do passe: "Refazer com o alvo certo".

Correção (peça 5): o sync de UMA sessão passa a drenar as respostas de TODAS as
sessões daquele agente, no MESMO `UPDATE ... RETURNING` que já garantia entrega
única. Sem requisição extra, sem mudança de protocolo.

Duas decisões dentro dela, ambas deliberadas:
- Escopo por AGENTE, nunca por usuário. O usuário tem duas máquinas ("PC" e
  "casa"); drenar por `user_id` faria a resposta escrita para a sessão de uma
  sair no terminal da outra. Custa um SELECT dos ids de sessão do agente por
  sync — barato e indexado.
- Cada resposta viaja com o `session_id` dela, e o `deliverReplies()` passa a
  rotular pela sessão DA RESPOSTA, não pela do POST. Anunciar tudo com o nome da
  sessão sincronizada seria mentir sobre a origem. O `{{session}}` do
  `LRC_REPLY_CMD` também passa a receber a sessão certa, com fallback para o
  comportamento antigo quando o servidor não manda o campo.

Contrato atualizado: escopo, dois invariantes novos (resposta não morre
pendente; entrega escopada por agente), peça 5 na implementação e um critério
próprio — que já fechou.
⎿ commit e1de995+dirty · 4 files changed, 247 insertions(+), 48 deletions(-)

## 2026-09-04 21:19 — [nota] Estado: 9 de 10 critérios; 2º passe em execução com a peça 5

Entrada de continuidade, para o journal não ficar atrás do código.

Código completo e estável desde 21:14 (peça 5 em `sync.ts` e o rótulo por
sessão de origem em `deliverReplies`). Gates: typecheck e lint exit 0,
`specctl lint` 0/0.

Critérios: 9 de 10 fechados com evidência. O único aberto é o 10, o passe de
≥10 min, que está na segunda execução — a primeira reprovou e a reprovação foi
útil: revelou o defeito da resposta órfã, que virou a peça 5 e o critério 9.

Nada commitado. Branch `feat/sync-resiliente`.

Pendências que seguem com o usuário, nenhuma bloqueante para esta SPEC:
- revogar o token `lrc_43c15bca…`, colado no chat e usado por mim para
  reproduzir os defeitos;
- o deploy do Vercel ainda serve o `main` sem estas correções — o passe roda
  contra localhost, com o alvo aceito pelo usuário em 21:03;
- sessões duplicadas no banco (mesmo `external_id` sob agentes diferentes),
  vistas de passagem e ainda sem SPEC.
⎿ commit e1de995+dirty · 4 files changed, 247 insertions(+), 48 deletions(-)

## 2026-09-04 21:26 — [nota] Sessao paralela: diagnostico da resposta no chat e colisao de duas sessoes na mesma SPEC

Entrada de uma SEGUNDA sessão do Claude, aberta em paralelo enquanto o 2º passe
rodava. Esta sessão NÃO alterou código: `git status` no fim é byte a byte o do
início (`dashboard.md`, `eslint.config.js`, `remote-agent.mjs`, `sync.ts` sujos
— todos da outra sessão). O gate R.6.1 disparou pela árvore suja, não por
trabalho meu.

RELATO DE CAMPO DO USUÁRIO, durante o passe: ele rodou o agente, enviou uma
resposta pelo painel, viu `>> resposta remota para Teste de campo: clone do
repositório:` no console — e reportou "não chega a mensagem no chat".

Não é defeito, e é o oposto: a resposta foi entregue UMA vez, que é exatamente o
que esta SPEC corrigiu. O que ele esperava é coisa que o produto nunca fez. O
`deliverReplies()` imprime no console e, SÓ se configurado, grava em
`LRC_REPLY_FILE` / roda `LRC_REPLY_CMD`; ele rodou sem os dois. Regra já escrita
em `docs/ARCHITECTURE.md:28-29`: "O agente NÃO digita no CLI: a UI promete
envio, nunca resposta." Injetar na sessão aberta do Claude Code é demanda nova e
espinhosa — o CLI interativo não tem porta de entrada externa (`claude --resume
-p` abre processo headless, não fala com o terminal aberto). Fica FORA desta
SPEC; o usuário optou por decidir depois de fechá-la.

COLISÃO DE SESSÕES — o que vale aprender:
Operei sobre o SNAPSHOT do hook das 21:12 e, com ele, fiz ao usuário duas
perguntas que ele JÁ tinha respondido às 21:11 na outra sessão, com respostas
diferentes (ofereci "SPEC nova depois desta" para o defeito da resposta órfã,
que a outra sessão já havia puxado para cá como peça 5; e ofereci marcar o passe
com os números crus, quando ele já pedira "refazer com o alvo certo"). Descartei
as respostas vencidas. O `specctl check <id> 9` que cheguei a rodar foi no-op
("critério 9 já está [x] — nada a fazer") — nenhum arquivo da SPEC foi escrito
por mim antes desta entrada.

Nada avisou nenhuma das duas sessões: o claim em `docs/claims/` identifica a
SPEC por branch e owner, não por sessão, e o SNAPSHOT do hook envelhece em
minutos enquanto a outra sessão reescreve `main.md` e appenda no LOG.

SNAPSHOT DELIBERADAMENTE NÃO SOBRESCRITO. O SNAPSHOT é sobrescrita, não append:
a outra sessão está no meio do 2º passe e é a dona do estado. Reescrevê-lo daqui
apagaria a posição dela por uma leitura minha que já nasce velha. O LOG é
append-only e aceita esta entrada sem conflito — por isso ela existe e o
SNAPSHOT fica intocado.
⎿ commit e1de995+dirty · 4 files changed, 247 insertions(+), 48 deletions(-)

## 2026-09-04 21:27 — [conclusão] 10 de 10 critérios; o passe reprovado foi o que mais rendeu

Entregue: o round-trip do `/sync` deixa de entregar a mesma resposta várias
vezes, deixa de perder mensagem quando o POST falha, e deixa de engolir resposta
enviada para sessão já encerrada.

Cinco peças. Quatro planejadas, uma achada pelo passe:
1. `sync.ts` — entrega e marcação no MESMO `UPDATE ... RETURNING`.
2. `readNew()` devolve `nextOffset`; o cursor só anda depois que o servidor
   confirmou o lote.
3. `setInterval` → laço auto-agendado, com concorrência limitada
   (`LRC_CONCURRENCY`, padrão 4) e o intervalo tratado como período.
4. `postSync()` retenta transporte e 5xx com backoff, não retenta 4xx, e nomeia
   a causa (`err.cause`) que antes era descartada.
5. (não planejada) o sync de uma sessão drena as respostas de TODAS as sessões
   daquele agente — escopado por agente, nunca por usuário.

Antes → depois, com o MESMO harness rodando contra `git show HEAD:...`:

| medida                          | antes | depois |
|---------------------------------|-------|--------|
| mensagens perdidas em falha     | 1057  | 0      |
| mesma resposta entregue         | 3x    | 1x     |
| requisições em voo (limite 1)   | 3     | 1      |
| resposta em sessão órfã         | some  | chega  |
| causa da falha no log           | não   | sim    |

Passe final (11 min, agente real, servidor real, banco real): 11 respostas
enviadas, 11 entregues, 0 duplicadas, 0 perdidas, 0 pendentes, 1860 mensagens,
0 falhas de sync. Alvo `localhost`, aceito pelo usuário — o deploy do Vercel
ainda serve o `main` sem estas correções.

O QUE MAIS RENDEU FOI A REPROVAÇÃO. O primeiro passe deu FALHOU com 6 de 11
respostas não entregues. Era um defeito real, anterior a esta SPEC, que cinco
harnesses não pegavam e que eu mesmo tinha visto de relance horas antes e
arquivado como "comportamento existente". Afrouxar a asserção para o verde
aparecer teria deixado o buraco aberto — e ele é do pior tipo, silencioso: o
painel diz que enviou, e nada acontece nunca.

Fica registrado como método: harness que não consegue falhar não prova nada.
Dois desta SPEC nasceram assim (o de sobreposição passava nas duas versões
porque o servidor falso respondia rápido demais; o medidor de ciclo quebrou
quando os ticks passaram a emendar) e só viraram teste depois de rodarem contra
a versão anterior e reprovarem-na.
⎿ commit e1de995+dirty · 4 files changed, 247 insertions(+), 48 deletions(-)

## 2026-09-04 21:28 — [nota] Journal já está em dia; o gate reincide por causa do working tree sujo

Registro do "por que não se aplica", que é a saída que o próprio gate oferece.

O R.6.1 dispara a cada fim de turno porque há código alterado e NÃO COMMITADO no
working tree. Isso é verdade e vai continuar sendo até o `close` — a SPEC está
parada de propósito, esperando a decisão de fechamento do usuário. Não é journal
atrasado: a [conclusão] das 21:27 descreve a entrega completa, e o SNAPSHOT foi
reescrito depois dela com o estado final (10/10, `close --dry` pronto: SIM,
banco limpo, dev server parado).

Paro de anexar entrada por turno a partir daqui. O LOG é append-only e encher de
"continua tudo igual" degrada o valor de quem for ler isto depois. A próxima
entrada será a do fechamento de fato, ou a de uma mudança real de estado.

Estado, para não deixar dúvida a quem retomar:
- 10 de 10 critérios [x]; typecheck, lint e `specctl lint` limpos
- nada commitado, branch `feat/sync-resiliente`
- pendências do usuário, todas fora desta SPEC: revogar o token `lrc_43c15bca…`,
  publicar estas correções (o Vercel ainda serve o `main` antigo) e as sessões
  duplicadas no banco
⎿ commit e1de995+dirty · 5 files changed, 248 insertions(+), 48 deletions(-)
