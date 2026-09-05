# Feature: dashboard

**Keywords:** painel, sessões, polling, react-query, status, resposta remota
**Arquivos principais:**
  - src/routes/_authenticated/dashboard.tsx
  - src/routes/_authenticated/sessions.$sessionId.tsx
  - src/components/terminal.tsx
  - src/lib/session-display.ts
  - src/components/markdown.tsx
  - src/lib/ask-answer.ts
  - src/lib/parse-choices.ts
  - public/agent/remote-agent.mjs
**Resumo:** Painel autenticado que lista as sessões de IA das máquinas do usuário e abre a conversa de cada uma, com resposta remota.

## Specs desta feature
### Concluídas
- SPEC-20260904-1433 | 2026-09-04 | `fc53ff4` | Painel lista apenas sessões ativas
- SPEC-20260904-1457 | 2026-09-04 | `f4437f4` | Transcrição formatada, pergunta clicável e adaptador do Kiro
- SPEC-20260904-2036 | 2026-09-04 | `e1de995` | Sync resiliente: entrega atômica de reply e cursor com confirmação
- SPEC-20260904-2135 | 2026-09-05 | `PENDENTE` | Resposta e escolha do painel chegam na sessão de Claude Code (hook)
### Planejadas (future/)

## Estado atual

Duas rotas sob `_authenticated`, ambas lendo o Supabase direto do browser sob RLS
(`supabase` publishable) e mantendo frescor por `refetchInterval` do react-query — não há
Realtime nem websocket.

- **Lista** (`dashboard.tsx`, polling 3s): consulta `sessions` ordenada por `last_activity_at desc`,
  mostrando status, ícone da origem, título, IDE, pid e confiança da detecção. Título e nome de
  projeto passam por `sessionTitle()`/`projectName()`, que caem para a primeira mensagem do usuário
  e para o último segmento do `cwd` quando o título é uuid/hash. As primeiras mensagens vêm de uma
  segunda query em `messages` (`role = 'user'`, limite 500) usada só para esse fallback.
- **Sessão** (`sessions.$sessionId.tsx`, polling 2s): três queries em paralelo (`sessions`,
  `messages`, `replies`), transcrição com markdown nas mensagens do assistente, auto-scroll para o
  fim e textarea que envia com Enter. Respostas ainda `pending` aparecem otimistas na transcrição —
  a entrega real só acontece quando o agente local faz o próximo sync.

A UI é composta pelas primitivas de `terminal.tsx` (`TermScreen`, `TermBox`, `TermButton`,
`TermHints`, `StatusDot`, `SourceIcon`, `TermTag`, `TermCode`); a estética de terminal não é
re-estilizada em cada rota.

### Delta de estado (SPEC-20260904-1457, 2026-09-04 16:58)

A transcrição deixou de ser texto plano e passou a ter três formas, decididas por `messages.meta`
(jsonb aditivo — mensagem sem `meta` renderiza como antes):

- **Markdown próprio** (`markdown.tsx`), sem `@tailwindcss/typography`: mapa `components` sobre
  `ReactMarkdown` + `remark-gfm`, com `TermCode` para bloco de código (rótulo de linguagem, copiar,
  rolagem contida no card para o body nunca rolar de lado no celular).
- **Pergunta de escolha** (`meta.ask`): enunciado e um botão por opção. Vale para o
  `AskUserQuestion` do Claude Code E para o `pending_interaction` do Kiro — o agente normaliza os
  dois para a mesma estrutura, então a UI tem uma forma só e duas origens. Respondida/pendente vem
  por DERIVAÇÃO (um `Set` dos `answers_tool_use_id` presentes na conversa), nunca por update: o
  upsert usa `ignoreDuplicates`, então a linha da pergunta nunca é reescrita.
- **Resultado de ferramenta** (`meta.tool`, só Kiro): cabeçalho com ferramenta, alvo e ok/falhou,
  saída num `<details>` fechado.

O agente ganhou adaptador por IDE em `normalize()`: o Claude Code põe `role`/`content` na raiz ou
em `message`, o Kiro envelopa tudo em `payload`. Raciocínio do Kiro (`operationType: "Reasoning"`)
entra marcado com `meta.kind`, para a UI desenhá-lo esmaecido em vez de confundir com fala.

### Delta de estado (SPEC-20260904-2036, 2026-09-04 21:00)

O round-trip ganhou as três garantias que faltavam para ele ser confiável sob rede ruim:

- **Entrega de reply é atômica.** O handler marca e devolve no MESMO `UPDATE ... RETURNING`,
  filtrando `status = 'pending'`. Antes eram duas operações e dois syncs concorrentes da mesma
  sessão levavam a mesma linha — o `LRC_REPLY_CMD` do usuário rodava três vezes.
- **O cursor do arquivo só anda com confirmação.** `readNew()` devolve `nextOffset` e quem grava
  é o `tick()`, depois que todos os lotes voltaram ok. Antes o cursor avançava antes do POST, e
  qualquer falha descartava aquelas mensagens para sempre naquela execução.
- **Um tick por vez.** Laço auto-agendado no lugar do `setInterval`, com concorrência limitada
  (`LRC_CONCURRENCY`, padrão 4) no passo de estado. O intervalo virou período: dorme o que sobra
  dele, com piso de 25% para não martelar servidor degradado.

`postSync()` retenta transporte e 5xx, não retenta 4xx, e nomeia a causa no log.

## Decisões arquiteturais ativas

- DEC-20260904-2100-entrega-no-maximo-uma-vez [ativa] (SPEC-20260904-2036) — a entrega de reply é
  atômica e portanto **no máximo uma vez**: se a conexão cair entre o commit e o agente receber, a
  resposta se perde. Trade-off aceito conscientemente — entregar de novo era pior, porque o
  `LRC_REPLY_CMD` do usuário executava o mesmo comando N vezes. "Exatamente uma vez" exigiria ack
  do agente, ou seja, protocolo novo.
- DEC-20260904-2101-cursor-com-confirmacao [ativa] (SPEC-20260904-2036) — o offset de leitura só
  avança depois que o servidor confirmou. Trade-off: uma falha faz o mesmo lote ser reenviado no
  tick seguinte, o que é barato porque o upsert é idempotente por `(session_id, external_id)`.
- DEC-20260904-1658-meta-aditivo [ativa] (SPEC-20260904-1457) — o que não cabe em `content` viaja
  numa coluna `meta` jsonb, opcional e sem esquema no zod do endpoint: o agente pode ganhar chaves
  sem a API mudar, e agente antigo numa máquina não atualizada continua funcionando. Trade-off: a
  validação de forma vira responsabilidade da UI (`readMeta` checa em runtime).
- DEC-20260904-1659-uma-forma-duas-origens [ativa] (SPEC-20260904-1457) — o adaptador de cada IDE
  normaliza para a MESMA estrutura (`meta.ask`, `meta.answers_tool_use_id`) em vez de a UI aprender
  o formato de cada agente. Trade-off: IDE nova exige trabalho no agente, não na UI — que é onde a
  gente quer o trabalho.
- DEC-20260904-1443-lista-somente-ativas [ativa] (SPEC-20260904-1433) — a lista filtra
  `status = 'active'` no servidor, não no cliente: as sessões idle/finished/unknown nem trafegam.
  Trade-off aceito: elas deixam de ser alcançáveis pelo painel e só abrem por URL direta.

## Alternativas consideradas e rejeitadas

- SPEC-20260904-1433 | filtrar no cliente e manter todas as linhas no cache — rejeitada em
  2026-09-04 14:43. Traria linhas que seriam descartadas na renderização, a cada 3 segundos.
- SPEC-20260904-2036 | fila persistente em disco no agente — rejeitada em 2026-09-04 20:36. O
  defeito era perda DENTRO de uma execução; o cursor em memória corrigido basta, e um arquivo de
  fila traz corrupção e limpeza para um agente que é de propósito um arquivo único sem estado.
- SPEC-20260904-2036 | `SELECT ... FOR UPDATE SKIP LOCKED` — rejeitada em 2026-09-04 20:36. Dá a
  mesma garantia, mas exigiria função/RPC no banco; o `UPDATE ... RETURNING` do PostgREST resolve
  sem superfície nova.
- SPEC-20260904-1457 | instalar `@tailwindcss/typography` — rejeitada em 2026-09-04 15:25. Traz um
  estilo genérico que briga com os tokens oklch e as primitivas de terminal; o mapa `components`
  custa o mesmo e combina.
- SPEC-20260904-1457 | tabela `questions` própria para a pergunta — rejeitada em 2026-09-04 15:25.
  A pergunta É uma mensagem; separar duplicaria ordenação e RLS por nada.
- SPEC-20260904-1457 | atualizar a linha da pergunta quando a resposta chega — rejeitada em
  2026-09-04 15:25. O `ignoreDuplicates` do upsert impede, e derivar do marcador é mais barato que
  abrir exceção no caminho de escrita.

## Gotchas

- SPEC-20260904-1433 | sessão recém-aberta aparece como `idle`, não `active` (o processo está vivo
  mas a transcrição ainda não se moveu) — com o filtro de ativas, ela só surge no painel depois do
  primeiro turno. Não é bug do painel: a derivação de status vive no agente local.
- SPEC-20260904-2036 | ler-depois-escrever num endpoint chamado em paralelo é corrida (2026-09-04
  20:37) — o `SELECT` de pendentes seguido de `UPDATE` entregava o mesmo reply a cada sync em voo.
  Em endpoint que o agente chama concorrentemente, marcar e devolver têm que ser UM comando.
- SPEC-20260904-2036 | não mova cursor antes de a escrita ser confirmada (2026-09-04 20:37) — vale
  para qualquer leitura incremental: avançar o offset antes do POST fez uma tempestade de 500
  apagar uma tarde inteira de transcrição, em silêncio.
- SPEC-20260904-2036 | `setInterval` com trabalho assíncrono dentro empilha (2026-09-04 20:37) — o
  timer não espera o tick anterior; com latência real ficavam ~4 em voo. Use laço auto-agendado, e
  trate o intervalo como período (dormir o que sobra), não como pausa.
- SPEC-20260904-2036 | harness precisa ser capaz de FALHAR (2026-09-04 20:59) — o teste de
  sobreposição passava nos dois agentes porque o servidor falso respondia rápido demais. Sempre
  rode o harness contra a versão anterior para provar que ele enxerga o defeito.
- SPEC-20260904-1457 | cada IDE tem envelope de transcrição PRÓPRIO (2026-09-04 16:03) — o Kiro
  envelopa tudo em `{id, timestamp, payload}`, e o `normalize()` escrito para o Claude Code
  descartava 2761 de 2761 linhas em silêncio: a sessão aparecia no painel e a conversa não, porque
  o monitor prova a sessão por outro caminho. Formato novo exige adaptador; nunca assumir o do
  Claude Code, e sempre conferir contando linhas aproveitadas contra o total.
- SPEC-20260904-1457 | o marcador de resposta do `AskUserQuestion` tem DOIS formatos de frase
  (2026-09-04 16:51) — `Your questions have been answered:` (474 ocorrências) e `The user answered:`
  (20). Reconhecer só um vaza a frase em inglês como fala do usuário E deixa a pergunta parecendo
  aberta, convidando a responder de novo. Prefira sempre `toolUseResult.answers` (objeto
  estruturado, na mesma linha) e trate a frase como último recurso.
- SPEC-20260904-1457 | harness que varre só o projeto atual dá falso verde (2026-09-04 16:51) — os
  20 casos do segundo formato estavam em OUTRO projeto de `~/.claude/projects`. Validação de
  formato de transcrição tem que varrer todos os projetos da máquina.
- SPEC-20260904-1457 | o Kiro reescreve a MESMA linha várias vezes (2026-09-04 16:03) — mesmo `id`,
  payload byte a byte idêntico, visto até 6x. Entre lotes o `ON CONFLICT DO NOTHING` resolve;
  DENTRO do lote iam duas linhas iguais no mesmo INSERT, então `sync.ts` deduplica por
  `external_id` antes de gravar.

### Delta de estado (SPEC-20260904-2135, 2026-09-05 16:45)

A resposta parou de morrer no console do agente. Quem entrega é um **hook do Claude Code**
(`public/agent/claude-hook.mjs`), porque a sessão que o usuário roda é `claude.exe` falando
stream-json por pipe: não há console, não há janela, não há teclado para simular. O hook roda DENTRO
da sessão de destino e recebe o `session_id` dela — "escrever na sessão errada" deixa de ser risco a
mitigar e vira impossível por construção.

- **Texto** → hook `Stop`. Drena `~/.lrc/inbox/claude-<sid>.jsonl` (o agente escreve com append, o
  hook toma com `rename` atômico) e devolve `decision: "block"` + `reason`. A sessão não para e
  recebe a fala como instrução. **`decision`/`reason` são TOP-LEVEL**: aninhados em
  `hookSpecificOutput` o inbox é drenado e a decisão ignorada — a fala some depois de o painel dizer
  que entregou. Medido, não deduzido.
- **Permissão** → hook `PreToolUse`, que ESPERA a escolha chegar. Responder depois não destrava: com
  o modal aberto o turno não terminou e o `Stop` nunca chega. A espera cai em quem estiver na
  máquina, então o canal nasce desligado (`LRC_PERM=1` arma, `LRC_PERM_WAIT` limita, prazo estourado
  abre o modal como sempre). Não precisou de protocolo novo: o painel já manda o rótulo do botão como
  reply comum, e o hook classifica — só o inequivocamente afirmativo vira `allow`, o resto volta ao
  inbox e chega como texto.
- **Detecção** → `SessionStart`/`SessionEnd` gravam `~/.lrc/sessions/claude-<sid>.json` com pid e
  start-time. É o que devolveu Claude Code ao `--probe` com `confiança=confirmed`, sem depender de
  qual versão da IDE está instalada.
- **Instalar o hook é passo manual do usuário** — `--settings <arquivo>` não carrega hook, só
  `settings.json` de disco. Sessão sem hook degrada para o comportamento antigo (`transcript-only`,
  `unknown`, sem entrega); a UI continua dizendo "enviada ao agente", nunca "respondida".
- **Kiro está fora**: nenhuma superfície de injeção equivalente foi encontrada, e o painel não
  promete entrega lá.
