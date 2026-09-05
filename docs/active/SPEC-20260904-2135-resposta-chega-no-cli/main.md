# SPEC-20260904-2135: resposta chega no cli

**Status:** active
**Porte:** G
**Owner:** @AllanFrancis
**Criada:** 2026-09-04 21:35
**Ativada:** 2026-09-04 21:39
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** dashboard
**Features:** dashboard
**Branch:** feat/resposta-chega-no-cli
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-04 21:35
**Resumo:** A resposta enviada do celular deixa de morrer no console do agente e chega de fato à sessão de IA, inclusive desbloqueando um prompt de permissão.

## Objetivo

Hoje o round-trip entrega a resposta ao agente e para ali: o `deliverReplies()` imprime no console e, só se configurado, grava em `LRC_REPLY_FILE` ou roda `LRC_REPLY_CMD`. Quem está no celular vê "resposta enviada" e nada acontece na máquina. Em 2026-09-04 o usuário bateu nisso duas vezes em 20 minutos, a segunda com um prompt de permissão do Claude Code aberto: clicou "Always allow" no painel, a escolha chegou ao agente (console) e o terminal seguiu bloqueado. O painel é honesto — o card diz "escolha enviada ao agente — o terminal ainda precisa confirmar" —, mas a promessa útil é a outra.

## Escopo

**DENTRO:**

- Entregar o texto da resposta na sessão de IA que a originou, não só no console do agente.
- Caso do prompt de permissão (`AskUserQuestion` / aprovação de ação): é MODAL e bloqueante, e precisa de uma tecla, não de uma linha de texto. Se o caminho escolhido não cobrir isso, dizer explicitamente que não cobre.
- Descobrir e registrar QUAL é o caminho viável por IDE (Claude Code e Kiro têm superfícies diferentes) antes de implementar.
- **[somado 2026-09-04 22:00, decisão do usuário]** Voltar a detectar sessões de Claude Code. A detecção por `~/.claude/sessions/<pid>.json` está inoperante nesta máquina (4 sessões vivas, `--probe` achando zero). Sem sujeito não há como provar os critérios 1 e 3 — é pré-requisito, não item paralelo.
- **[somado 2026-09-04 22:00, decisão do usuário]** Somar `external_id` a cada reply na RESPOSTA do `/sync`. Sem isso o agente recebe o uuid da tabela e não sabe para qual sessão nativa é — o invariante de nunca escrever na sessão errada fica impossível de honrar.

**FORA:**

- Websocket/Realtime — o round-trip do POST continua sendo o protocolo.
- Redesenhar o protocolo do `/sync`: corpo da requisição e fluxo não mudam. (O `external_id` na resposta é aditivo e entrou por decisão explícita do usuário — ver DENTRO.)
- Prometer entrega em IDE que não tenha caminho comprovado: o que não for provável fica de fora e a UI não promete.
- **Kiro.** Nenhuma superfície de injeção equivalente foi encontrada na investigação. Fica de fora até existir prova, e a UI não promete entrega para sessão do Kiro.

## Invariantes

- NUNCA prometer na UI o que não foi provado na máquina: se a injeção não é confiável para aquele IDE, o painel continua dizendo "enviada ao agente", não "respondida".
- NUNCA digitar em processo que não seja o da sessão que originou a resposta — o usuário tem duas máquinas e várias sessões por máquina; escrever no terminal errado é pior que não escrever.
- SEMPRE manter `LRC_REPLY_FILE`/`LRC_REPLY_CMD` funcionando: quem já depende deles não pode quebrar.

## Implementação

Porte G, e a primeira fase é INVESTIGAÇÃO, não código. **Fase 1 fechada em 2026-09-04 21:55** — o
resultado derrubou a hipótese que este parágrafo trazia. Registro do que caiu e do que ficou:

- ~~Sobra automação de janela no SO (`SendKeys` para a janela do terminal por PID)~~ — **descartado, não adiado.** As sessões que o usuário roda são `claude.exe --input-format stream-json --permission-prompt-tool stdio`, filhas do host da IDE: stdin é pipe, não há console nem janela. Não é frágil, é sem alvo. E o modal de permissão é desenhado pelo host, não por um TTY: também não há tecla para mandar.
- `claude --resume <id> -p` segue descartado pelo motivo original: abre processo novo, não fala com a sessão aberta.
- **Caminho escolhido: hooks do Claude Code.** O hook roda DENTRO da sessão e recebe o `session_id` dela.
  - `Stop` → `{"hookSpecificOutput":{"hookEventName":"Stop","decision":"block","reason":"<fala do usuário>"}}`: a sessão não para e recebe o texto como instrução. É a entrega.
  - `SessionStart`/`SessionEnd` → registram sessão, PID e start-time em `~/.lrc/sessions/`, que é o que devolve a detecção de Claude ao monitor.
  - `PreToolUse` → aceita `permissionDecision: allow|deny`; é por onde o prompt de permissão é
    destravado. **Fase 3 fechada em 2026-09-05, provada em sessão real.** Desenho: o hook publica o
    pedido em `~/.lrc/pending/` e ESPERA a escolha chegar ao inbox, porque quando o modal abre o turno
    não terminou e o `Stop` nunca chega — responder depois não destrava nada. Esperar custa a quem
    está sentado na máquina, então o canal nasce DESLIGADO: `LRC_PERM=1` arma e `LRC_PERM_WAIT`
    (padrão 120s) limita a espera. Prazo estourado = sai calado e o modal abre como sempre.
  - Correção medida na fase 2: em `Stop`, `decision`/`reason` são TOP-LEVEL. Aninhados em
    `hookSpecificOutput` (a forma do `PreToolUse`) o inbox é drenado e a decisão ignorada — a fala do
    usuário some depois de o painel dizer que entregou.
- Transporte agente↔hook por arquivo (`~/.lrc/inbox/claude-<sessionId>.jsonl`), não por porta. O agente escreve com append, o hook drena com `rename` atômico. `LRC_REPLY_FILE`/`LRC_REPLY_CMD` continuam sendo chamados como sempre.
- Efeito colateral bom: o invariante "nunca digitar na sessão errada" deixa de ser risco a mitigar. O hook só existe dentro da sessão de destino.
- Restrição de instalação, medida: hook passado por `--settings <arquivo>` NÃO é carregado. Só vale `settings.json` em disco — logo, instalar o hook é passo manual do usuário (`evidence/instalar-hook.md`).

### Modelo de dados

| Entidade                      | Campos / mudança                                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabelas                       | Nenhuma mudança. A resposta já viaja com o `session_id` de origem desde a SPEC-20260904-2036.                                                                                             |
| Resposta do `/sync` (aditivo) | cada reply ganha `external_id`; a raiz ganha `external_id` da sessão sincronizada. É o dicionário uuid→id nativo que faltava ao agente. Sai da consulta que já existia, sem query a mais. |
| `~/.lrc/` (novo, em disco)    | `sessions/claude-<sid>.json` escrito pelo hook (pid, proc_start, cwd, transcript, last_seen, ended_at) · `inbox/claude-<sid>.jsonl` escrito pelo agente e drenado pelo hook.              |

## Riscos

- ~~Automação de teclado digita na janela errada~~ — risco extinto junto com a abordagem: o hook roda dentro da sessão de destino, não existe "janela errada" para acertar.
- Injetar texto numa sessão de IA é uma superfície de execução: quem tem o token do agente passa a poder digitar na máquina. Mitigação a desenhar — hoje o token já permite ler transcrições, mas escrever é um degrau acima. **Continua em aberto.**
- Pode não haver caminho confiável para algum IDE — confirmado para o Kiro, que ficou FORA.
- **Novo:** o hook roda em TODA sessão de Claude Code da máquina, a cada turno. Um erro nele para o trabalho do usuário em todos os repositórios. Mitigação implementada: qualquer falha termina em `exit 0` sem saída, e `LRC_HOOK=0` desliga sem desinstalar.
- **Novo:** instalar o hook é passo manual e o usuário pode esquecer numa das máquinas. Mitigação: sessão sem hook continua aparecendo como hoje (`transcript-only`, `unknown`) e não recebe entrega — degrada para o comportamento atual, não para um estado mentiroso.

## Sinais de sucesso

- O usuário clica uma opção no celular e o terminal na outra máquina sai do prompt sozinho, sem ele encostar no teclado.

## Critério de aceite

- [x] Resposta enviada do painel aparece na sessão de IA de origem, provada com a sessão real rodando (não simulada) (2026-09-05 16:28, commit `5c7cbef`, evidence: sessao real com --session-id, inbox semeado: num_turns 2, result ABACAXI (evidence/prova-canal-stop.md secao 2))
- [x] Prompt de permissão aberto é desbloqueado pela escolha feita no painel — OU está escrito no contrato que este caso ficou fora, e a UI não o promete (2026-09-05 16:40, commit `5c7cbef`, evidence: desarmado: negado, alvo.txt nao criado; armado com 'Sim, permitir sempre' no inbox: PreToolUse devolveu allow e o arquivo foi criado (evidence/prova-canal-stop.md secao 7))
- [x] Resposta para a sessão A nunca é digitada na sessão B, nem em outra máquina do mesmo usuário (2026-09-05 16:28, commit `5c7cbef`, evidence: inbox de A semeado, sessao B rodada: B respondeu o dela e o inbox de A ficou intacto (evidence/prova-canal-stop.md secao 3))
- [x] `LRC_REPLY_FILE` e `LRC_REPLY_CMD` continuam funcionando como hoje (2026-09-05 16:28, commit `5c7cbef`, evidence: agente real + servidor falso em HOME isolado: REPLY_FILE, REPLY_CMD e inbox do hook receberam a mesma resposta (evidence/prova-canal-stop.md secao 6))
- [x] **[somado 2026-09-04 22:00]** `--probe` volta a enxergar sessões de Claude Code vivas, com `confiança=confirmed` e prova de vida por PID + start-time (hoje enxerga zero) (2026-09-05 16:28, commit `5c7cbef`, evidence: probe durante o turno: [ACTIVE] claude-code pid=34836 confianca=confirmed fontes=claude:hook+claude:process+claude:transcript (evidence/prova-canal-stop.md secao 4))
- [x] **[somado 2026-09-04 22:00]** Sessão de Claude Code SEM o hook instalado continua aparecendo como hoje (`unknown`/`transcript-only`) e não recebe entrega — degradar não pode virar mentira (2026-09-05 16:28, commit `5c7cbef`, evidence: projeto sem hook, inbox semeado: nada entregue, inbox intacto, nenhum registro criado (evidence/prova-canal-stop.md secao 5))
- [x] Typecheck limpo (2026-09-05 16:40, commit `5c7cbef`, verify: exit 0) | verify: `bunx tsc --noEmit`
- [x] Lint limpo (2026-09-05 16:40, commit `5c7cbef`, verify: exit 0) | verify: `bun run lint`
