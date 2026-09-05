# SPEC-20260904-2036: sync resiliente

**Status:** done
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-04 20:36
**Ativada:** 2026-09-04 20:36
**Concluída:** 2026-09-04 21:28
**Pausada em:** —
**Commit final:** `e1de995`
**Keywords:** dashboard
**Features:** dashboard
**Branch:** feat/sync-resiliente
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-04 20:36
**Resumo:** O round-trip do `/sync` para de entregar a mesma resposta várias vezes e para de perder mensagem quando o POST falha.

## Objetivo

Com o app publicado no Vercel, o agente mostrou dois defeitos no console: a mesma resposta remota entregue três vezes seguidas, e `fetch failed` em algumas sessões. A entrega repetida foi reproduzida contra o deploy real — o `sync.ts` faz `SELECT` dos replies pendentes e só depois marca `delivered`, então syncs concorrentes da mesma sessão levam a mesma linha. Pior, e ainda invisível para o usuário: o `readNew()` avança o offset do arquivo ANTES do POST, então qualquer falha de rede descarta aquelas mensagens para sempre naquele processo. A entrega é o que o usuário vê; a perda é o que o machuca sem avisar.

## Escopo

**DENTRO:**
- Entrega de reply atômica: uma operação só, para que syncs concorrentes não levem a mesma linha duas vezes.
- Offset do arquivo só avança depois que o servidor confirmou a gravação.
- Tick que não se sobrepõe ao anterior, com concorrência limitada no passo de estado para o ciclo não esticar.
- `postSync` com retentativa em falha transitória e log que nomeia a causa (`err.cause`), não só "fetch failed".
- Resposta para sessão que o monitor não enxerga mais deixa de morrer pendente: qualquer sync do agente drena as respostas de todas as sessões DELE.

**FORA:**
- Websocket/Realtime — o round-trip do POST continua sendo o protocolo.
- Fila persistente em disco no agente: o offset em memória, corrigido, já resolve o caso desta SPEC.
- Mudar o formato do payload — agente antigo tem que continuar funcionando.
- Reduzir a latência do endpoint (~800ms até o Vercel) ou trocar de hospedagem.
- Entrega "exatamente uma vez" com ack do agente — protocolo novo, ver Riscos.

## Invariantes

<!-- o invariante abaixo entrou em 21:12, com o defeito que o passe revelou -->

- NUNCA avançar o offset de um arquivo sem o servidor ter confirmado a gravação daquele lote.
- SEMPRE entregar cada reply no máximo uma vez, mesmo com N syncs concorrentes da mesma sessão.
- NUNCA mudar o formato do payload: agente antigo numa máquina não atualizada continua funcionando contra a API nova.
- NUNCA deixar um tick começar com o anterior ainda em voo.
- NUNCA deixar resposta enviada pelo painel morrer pendente porque a sessão dela não está sendo monitorada.
- SEMPRE escopar a entrega por AGENTE: o usuário tem várias máquinas, e resposta de uma não pode sair no terminal da outra.

## Implementação

Quatro peças. A primeira é no servidor, as outras três no agente.

**1. Entrega atômica de reply (`src/routes/api/public/agent/sync.ts`)** — as duas operações de hoje (`SELECT` pendentes, depois `UPDATE` delivered) viram uma só, com o `UPDATE ... RETURNING` que o PostgREST expõe como `.update().select()`, filtrando por `session_id` e `status = 'pending'`. Em READ COMMITTED o segundo UPDATE concorrente bloqueia até o primeiro comitar, reavalia o `WHERE`, não encontra mais nada pendente e devolve zero linhas: uma requisição leva a resposta, as outras levam nada. O `.order()` que existia no SELECT não sobrevive ao UPDATE, então a ordenação por `created_at` passa a ser feita no handler antes de responder.

**2. Offset só avança após confirmação (`public/agent/remote-agent.mjs`)** — `readNew()` deixa de mutar o mapa `sent` e passa a devolver `{ messages, nextOffset }`. O `nextOffset` continua respeitando o caso da linha parcial (hoje um `sent.set(file, start + i)` dentro do `catch` do `JSON.parse`): linha meio escrita tem que ser relida no tick seguinte. O `tick()` grava `sent.set(file, nextOffset)` só depois que TODOS os lotes voltaram ok; um lote que falhe interrompe o laço e deixa o offset onde estava. Reenviar é seguro porque o upsert de mensagens usa `ignoreDuplicates` sobre `(session_id, external_id)`.

**3. Tick sem sobreposição (`public/agent/remote-agent.mjs`)** — `setInterval(tick, INTERVAL)` não espera o tick anterior; com ~800ms de latência e 9 sessões, um tick leva ~7s e ficam ~4 em voo. Vira laço auto-agendado: `await tick()` e só então `await sleep(INTERVAL)`. Isso sozinho serializaria o passo 2 e o ciclo passaria a ~7s, atrasando o status na tela — então o passo 2 ganha concorrência limitada (4 simultâneas). A corrida que a concorrência poderia causar é exatamente a da peça 1, que já a elimina.

**4. `postSync` com retentativa e causa (`public/agent/remote-agent.mjs`)** — falha de transporte e HTTP 5xx são retentadas com backoff (2 retentativas); 4xx não é retentado, porque 400/401 não se conserta sozinho. Todo log de falha passa a imprimir `err.cause?.code ?? err.cause?.message` junto do `err.message`. Continua devolvendo `null` em falha definitiva: é o sinal que a peça 2 usa para não avançar o offset.

**5. Resposta órfã (`sync.ts`)** — descoberta pelo passe, e anterior a esta SPEC. O agente só faz POST para sessão que o monitor enxerga agora ou que teve mensagem nova; uma sessão já encerrada não se encaixa em nenhum dos dois, então a resposta escrita para ela ficava `pending` para sempre, sem nada na tela dizendo isso. Medido: de 11 respostas num passe de 11 minutos, 6 nunca chegaram — exatamente as 6 sessões que o monitor não via (15 no banco, 9 monitoradas). O sync de UMA sessão passa a drenar as respostas de TODAS as sessões daquele agente, no mesmo `UPDATE ... RETURNING`. Sem requisição extra e sem mudar o protocolo. O escopo é por agente, nunca por usuário: duas máquinas do mesmo dono não podem roubar a resposta uma da outra. Cada resposta passa a viajar com o `session_id` dela, para o agente rotular a origem certa e alimentar o `{{session}}` do `LRC_REPLY_CMD` com a sessão a que a resposta pertence.

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| — | Nenhuma mudança de schema. `replies.status`/`delivered_at` já existem; muda só COMO são escritos. |

**Alternativas rejeitadas:** fila persistente em disco no agente (resolveria também a perda entre execuções, mas o defeito desta SPEC é perda DENTRO de uma execução — offset em memória corrigido basta, e um arquivo de fila traz corrupção e limpeza para um agente que é de propósito um arquivo único sem estado); `SELECT ... FOR UPDATE SKIP LOCKED` (correto, mas exige RPC/função no banco — o `UPDATE ... RETURNING` do PostgREST dá a mesma garantia sem superfície nova); manter `setInterval` e só proteger com um flag de "tick em andamento" (funciona, mas deixa o timer disparando à toa; o laço auto-agendado diz a intenção no código).

## Riscos

- A entrega passa a ser **no máximo uma vez**: se a conexão cair depois do commit e antes de o agente receber a resposta, aquela resposta se perde — antes ela seria reentregue no tick seguinte. Mitigação: é a troca certa (hoje o `LRC_REPLY_CMD` pode rodar 3× o mesmo comando, o que é pior que perder), e "exatamente uma vez" exigiria ack do agente, que é protocolo novo e está FORA.
- Concorrência limitada no passo 2 mantém requisições simultâneas contra a mesma origem, que é a suspeita para o `fetch failed` não reproduzido. Mitigação: 4 simultâneas contra ~36 de hoje, mais a retentativa da peça 4.
- Não avançar o offset em falha significa reenviar o mesmo lote no tick seguinte. Mitigação: o upsert com `ignoreDuplicates` torna o reenvio idempotente — já é assim hoje para o caso de reinício do agente.

## Sinais de sucesso

- O `LRC_REPLY_CMD` roda uma vez por resposta enviada do painel, e uma transcrição acompanhada do celular não tem buracos depois de um blip de rede.

## Critério de aceite

- [x] Com 3 syncs concorrentes da mesma sessão, o reply é entregue exatamente 1× (hoje: 3×, reproduzido contra o Vercel) (2026-09-04 20:58, commit `e1de995`, evidence: tmp/corrida-reply.test.mjs, 3 syncs simultaneos da mesma sessao: contra o deploy antigo (Vercel) o mesmo reply foi entregue 3x; contra o servidor corrigido, 1x, com 0 replies pendentes ao fim)
- [x] POST que falha não avança o offset: as mensagens entram no tick seguinte e o banco não duplica (2026-09-04 20:58, commit `e1de995`, evidence: tmp/perda-e-concorrencia.test.mjs com servidor falso falhando as 6 primeiras requisicoes: agente ANTES perdeu 1057 ids; agente DEPOIS perdeu 0 de 398 ids enviados na janela de falha (todos reenviados e gravados))
- [x] Nunca há dois ticks em voo (2026-09-04 20:58, commit `e1de995`, evidence: mesmo harness, latencia de 400ms: agente ANTES chegou a 3 requisicoes em voo com LRC_CONCURRENCY=1 (prova de ticks sobrepostos); DEPOIS o maximo foi 1. Com a concorrencia padrao 4, o maximo observado foi exatamente 4)
- [x] Falha de transporte é retentada e o log nomeia a causa, não só "fetch failed" (2026-09-04 20:58, commit `e1de995`, evidence: agente apontado para porta fechada: ANTES loga 'erro em <arquivo> fetch failed' (sem causa, sem retentativa); DEPOIS loga 'sync falhou: fetch failed (ECONNREFUSED) - nova tentativa em 500ms', depois 1500ms, e so entao desiste)
- [x] Payload inalterado: agente anterior a esta SPEC continua funcionando contra a API nova (2026-09-04 20:58, commit `e1de995`, evidence: tmp/compat-agente-antigo.test.mjs: o agente anterior a esta SPEC rodou 30s contra a API nova e gravou 15 sessoes e 1848 mensagens, com 0 recusas)
- [x] Ciclo completo com as sessões reais desta máquina fica na ordem do `LRC_INTERVAL`, não em ~7s (2026-09-04 20:58, commit `e1de995`, evidence: tmp/perda-e-concorrencia.test.mjs medindo fronteira de tick por repeticao de sessao: regime estavel 3153ms medio (ultimos ciclos 3073-3593ms) com LRC_INTERVAL=2000, 9 sessoes e 800ms de latencia simulada. Longe dos ~7s que motivaram o criterio; o 2000ms que o agente antigo aparentava vinha justamente da sobreposicao)
- [x] Typecheck limpo (2026-09-04 20:56, commit `e1de995`, verify: exit 0) | verify: `bunx tsc --noEmit`
- [x] Lint limpo (2026-09-04 20:56, commit `e1de995`, verify: exit 0) | verify: `bun run lint`
- [x] Resposta enviada para sessão que o monitor não enxerga é entregue mesmo assim, e nenhuma resposta de um agente vaza para outro agente do mesmo usuário (2026-09-04 21:18, commit `e1de995`, evidence: tmp/reply-orfa.test.mjs com dois agentes temporarios do mesmo usuario: resposta em sessao 'transcript-only' (que o monitor nao enxerga) foi entregue, resposta em sessao monitorada tambem, e a resposta do agente vizinho NAO vazou — seguiu 'pending' e intocada. Antes da correcao a mesma sonda dava 'entregue da TRANSCRIPT-ONLY: false')
- [x] Passe real: agente contra o Vercel por ≥10 min, zero reply duplicado e zero mensagem perdida (2026-09-04 21:27, commit `e1de995`, evidence: tmp/passe-real.test.mjs, 11 min com agente real, servidor real com a correcao e banco real. ALVO: http://localhost:8082, NAO o Vercel — o deploy ainda serve o main sem estas correcoes, e o usuario aceitou o alvo local em 2026-09-04 21:03 ('aceitp o passe local como evidencia'). Resultado: 11 respostas enviadas pelo painel, 11 entregues, 0 duplicadas, 0 perdidas, 0 pendentes ao fim, 1860 mensagens sincronizadas, 0 falhas de sync, agente vivo ao fim. A 1a execucao deste mesmo passe reprovou (6 de 11 nao entregues) e foi o que revelou o defeito da resposta orfa)
