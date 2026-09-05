# Journal — SPEC-20260904-2135

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-04 21:55
**Onde tô:** fase 1 (investigação) ENTREGUE. Nenhuma linha de produto tocada — de propósito.
**Próximo passo:** o usuário decide as 3 perguntas em "Dúvidas"; sem isso a fase 2 não começa.
**Última decisão:** canal = hooks `Stop`/`PreToolUse` do Claude Code; automação de teclado descartada.
**Bloqueio atual:** provar o hook exige instalar em settings.json de disco (ver [blocker] 21:55).
**Se retomar, ler:** main.md, depois os 3 LOGs de 21:54–21:55 (descoberta → decisão → blocker).

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | Investigação: qual o caminho viável por IDE | concluída | 2026-09-04 21:55 |
| 2 | Hook + spool + roteamento por sessão | bloqueada (decisão do usuário) | 2026-09-04 21:55 |
| 3 | Caso do prompt de permissão (PreToolUse) — ou declarar fora | pendente | 2026-09-04 21:55 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
<!-- anti-alucinação por estrutura: separe o que é SABIDO (verificado no código/teste) do que é CHUTE (inferido) do que está EM ABERTO. Nunca trate inferência como fato. -->
- fato: as sessões Claude do usuário são `claude.exe` da extensão, stream-json por pipe, SEM console
  → SendKeys/WriteConsoleInput não têm alvo. Automação de janela está descartada, não adiada.
- fato: `~/.claude/sessions/<pid>.json` não existe na 2.1.x (só `<pid>.<hash>.key` com peerToken +
  procStartFt, sem sessionId/cwd) → `--probe` acha 11 sessões, 0 Claude. Detecção de Claude morta.
- fato: doc oficial confirma `Stop` → `decision:block`+`reason` e `PreToolUse` → `permissionDecision`.
- fato: hook via `--settings <arquivo>` NÃO carrega (2 execuções reais, nem SessionStart nem Stop).
- fato: `replies` do /sync devolve uuid da tabela, não id nativo → agente não sabe rotear hoje.
- inferência: `~/.claude/session-env/` é o registro novo de pid↔sessionId (NÃO lido — bloqueado).
- inferência: Kiro não tem superfície de injeção equivalente (procurei, não achei; não é prova).
- dúvida: o usuário autoriza instalar o hook em `~/.claude/settings.json` para provar?
- dúvida: somar `external_id` ao reply do /sync (aditivo) ou o agente montar o mapa sozinho?
- dúvida: consertar a detecção de Claude aqui dentro ou abrir SPEC própria?

### Respostas-chave do usuário
- 2026-09-04 21:39 — "Abrir a 1. Seja autonomo e corrija"

### Tentativas que falharam
- hook por `--settings ./hooks-de-teste.json` (com e sem `--setting-sources`): nenhum hook rodou.
- escrever `.claude/settings.json` no fixture, redirecionar stderr p/ arquivo, ler `session-env/`:
  barrados pelo classifier de permissões. Não contornados.

### Arquivos tocados
- nenhum de produto. Só journal + `tmp/` (fixture `tmp/hooktest/`, corpos dos LOGs).

### Onde parei
Investigação fechada e registrada. Esperando as 3 decisões do usuário antes de codar.

### Sessões (máx 5 linhas + 1 agregada)
- 2026-09-04 21:39–21:55 — ativação + fase 1 inteira (investigação, decisão de canal, blocker).

## LOG (append-only — NUNCA editar entradas antigas)
<!-- tipos: ativação descoberta decisão tentativa blocker unblock refactor nota conclusão | entrada nova: specctl log -->

## 2026-09-04 21:39 — [ativação] SPEC ativada (branch feat/resposta-chega-no-cli, base main)

## 2026-09-04 21:54 — [descoberta] Fase 1: automacao de janela nao tem alvo; o caminho e hook; e a deteccao de Claude esta morta

Tudo abaixo foi verificado NESTA máquina (win32, 2026-09-04 21:40–21:50), não inferido.

**1. A automação de janela está morta para o setup real do usuário — não é frágil, é sem alvo.**
As sessões de Claude Code que o usuário roda são `claude.exe` (binário nativo da extensão
`anthropic.claude-code-2.1.260-win32-x64`), 4 processos vivos, todos filhos do MESMO extension host
(PPID 24532), com a linha de comando:
`claude.exe --output-format stream-json --input-format stream-json --permission-prompt-tool stdio ...`
Ou seja: stdin/stdout são PIPES do host da IDE. Não há console, não há janela de terminal, não há
buffer de entrada de console. `SendKeys`, `AttachConsole`+`WriteConsoleInput` e afins não têm em quem
escrever. O plano "automação de teclado por PID" descrito no main.md morre aqui — e morre por
ausência de superfície, não por fragilidade.
E o prompt de permissão que travou o usuário é servido por `--permission-prompt-tool stdio`: quem
desenha o modal é o host, não um TTY. Também não há tecla para mandar.

**2. A detecção de sessões Claude do agente está morta nesta versão.**
`public/agent/remote-agent.mjs` procura `~/.claude/sessions/<pid>.json` com `sessionId`/`cwd`/`procStart`.
Esse arquivo NÃO EXISTE mais. O que existe em `~/.claude/sessions/` são 8 arquivos
`<pid>.<hash>.key` com `{"peerToken":"...","procStartFt":"134320979894294095"}` — tem procStart,
NÃO tem sessionId nem cwd — e os 8 são de 20–25/ago, nenhum dos 4 `claude.exe` vivos hoje.
Medido: `node public/agent/remote-agent.mjs --probe` → "sessões encontradas: 11", TODAS `kiro`,
ZERO `claude`. Claude Code só aparece pela camada de transcrição, como `transcript-only` /
`status=unknown` / `pid=null`.
Consequência para esta SPEC: sem pid nem prova de vida, o critério "resposta chega na sessão de
origem" não tem nem sujeito. Isto é pré-requisito, não item paralelo.
Pista não fechada: `~/.claude/session-env/` é candidato a registro novo desta versão. Não inspecionado
— a leitura foi bloqueada pelo classifier de permissões nesta sessão.

**3. O canal limpo existe e é o sistema de hooks — confirmado na doc oficial**
(https://code.claude.com/docs/en/hooks, lida em 2026-09-04):
- `Stop` recebe no stdin `{session_id, transcript_path, cwd, last_assistant_message, ...}` e aceita na
  saída `{"hookSpecificOutput":{"hookEventName":"Stop","decision":"block","reason":"<texto>"}}`.
  Bloquear a parada faz a sessão CONTINUAR com `reason` entrando como instrução. Timeout padrão 600s.
  É exatamente "injetar a fala do usuário na sessão que está rodando" — e o `session_id` vem de graça,
  então a sessão A nunca recebe a resposta da B: o hook roda DENTRO da sessão.
- `PreToolUse` recebe `{session_id, tool_name, tool_input, tool_use_id, permission_mode, ...}` e aceita
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow|deny|ask", ...}}`.
  Timeout padrão 600s. É onde o prompt de permissão pode ser destravado — e ANTES do modal abrir.
- `Notification` com matcher `permission_prompt` avisa que o modal abriu, mas só devolve
  `terminalSequence`: serve para AVISAR o painel, não para responder.

**4. Tentativa que falhou: `--settings` não carrega hooks.**
Duas execuções reais de `claude -p "Responda apenas: OI" --settings ./hooks-de-teste.json --model haiku`
(a segunda com `--setting-sources user,project,local`), com hooks `SessionStart` E `Stop` apontando para
um script que só faz `appendFileSync`. O arquivo de prova nunca foi criado — nenhum dos dois hooks
rodou. Hook só vale vindo de settings.json em disco (`~/.claude/settings.json` ou `.claude/settings.json`
de projeto confiável). Fixture em `tmp/hooktest/`.
Isso é uma decisão de segurança do produto, não um bug: instalar hook = permitir execução de código.
E é o que trava a prova desta SPEC (ver [blocker]).

**5. Roteamento: o agente hoje não consegue saber para QUAL sessão nativa é a resposta.**
`src/routes/api/public/agent/sync.ts:206` devolve `replies` com `session_id` = uuid da tabela `sessions`.
O agente só conhece o uuid da sessão que ACABOU de sincronizar (`data.session_id`); para as demais,
`deliverReplies` só sabe imprimir "outra sessão (<uuid>)". Sem um mapa uuid→id nativo não dá para honrar
o invariante "NUNCA digitar em processo que não seja o da sessão que originou a resposta".

**6. Kiro: nenhuma superfície equivalente encontrada.** O lock `~/.claude/ide/11356.lock` é do Kiro como
IDE (`{"pid":21816,"ideName":"Kiro","transport":"ws"}`) — é servidor MCP para o Claude Code consumir,
não entrada para injetar prompt numa sessão do agente do Kiro.
⎿ commit 35b501b

## 2026-09-04 21:54 — [decisão] Canal = hooks Stop/PreToolUse; automacao de teclado descartada por ausencia de superficie

**Caminho escolhido: hooks do Claude Code. Automação de teclado está descartada.**

O main.md deixava as duas em aberto ("sobra automação de janela no SO... funciona, e é frágil por
natureza"). A investigação fecha isso: para o setup REAL do usuário — Claude Code hospedado pela
extensão, falando stream-json por pipe, sem console — a automação de janela não é frágil, é
impossível. Não existe janela para mirar. Fica descartada, não "adiada".

**Desenho que decorre disso** (a implementar, ainda NÃO provado — ver [blocker]):

- Canal de texto = hook `Stop`. Ao fim de cada turno o hook pergunta ao agente local se há resposta
  pendente para `session_id` (o próprio hook recebe o id). Se há, devolve
  `decision: "block"` + `reason: <texto do usuário>` e a sessão continua com a fala dele dentro.
  Se não há, sai calado (exit 0, sem JSON) e nada muda. Custo para quem está na máquina: uma
  checagem local por turno.
- Canal de permissão = hook `PreToolUse`. Mesma pergunta ao agente; resposta vira
  `permissionDecision: allow|deny`. Isso destrava o caso do "Always allow" ANTES do modal abrir.
  Só entra se explicitamente armado (env), porque um hook que espera em TODA chamada de ferramenta
  congelaria quem está sentado na máquina.
- Transporte hook↔agente = arquivo em disco, não porta. O agente já é processo único e o hook é
  processo curto; um spool `<dir>/<external_id>.jsonl` resolve sem porta, sem conflito e sem
  quebrar `LRC_REPLY_FILE`/`LRC_REPLY_CMD`, que continuam sendo chamados como hoje.

**Por que este desenho honra os invariantes do contrato, e a automação de teclado não honrava:**
o hook roda DENTRO da sessão de destino e recebe o `session_id` dela. "Digitar na sessão errada"
deixa de ser um risco a mitigar e passa a ser estruturalmente impossível — some o risco #1 do main.md.

**Duas tensões com o escopo escrito, para o usuário decidir (não decidi sozinho):**

1. O main.md põe FORA "mudar o formato do payload de /sync", e diz que "a resposta já viaja com o
   `session_id` de origem". Viaja, mas é o uuid da tabela `sessions` — o agente não consegue traduzir
   para a sessão nativa (descoberta #5). Para honrar o invariante "NUNCA digitar em processo que não
   seja o da sessão que originou a resposta" preciso de um de dois:
   (a) somar `external_id` a cada reply na RESPOSTA do /sync (aditivo, ~3 linhas), ou
   (b) o agente montar o mapa uuid→nativo sozinho ao longo dos ticks, com spool para o que chegar
   antes do mapa existir (não toca o /sync, mas é mais código e tem janela de corrida no 1º tick).
2. A detecção de sessões Claude está morta (descoberta #2). Sem consertar, não há sessão Claude
   para receber resposta nenhuma. É pré-requisito desta SPEC ou SPEC própria?
⎿ commit 35b501b+dirty · 1 file changed, 63 insertions(+), 1 deletion(-)

## 2026-09-04 21:55 — [blocker] Provar o hook exige instalar em settings.json de disco — decisao do usuario

**Não consigo provar o canal escolhido sem instalar um hook em settings.json de disco.**

O critério de aceite #1 exige prova "com a sessão real rodando (não simulada)". A descoberta #4 mostra
que hook passado por `--settings <arquivo>` NÃO é carregado — só vale `~/.claude/settings.json` ou
`.claude/settings.json` do projeto. Instalar hook é permitir execução de código a cada turno: é decisão
do usuário, e nesta sessão a escrita nesses arquivos foi barrada pelo classifier de permissões
(3 tentativas: `.claude/settings.json` do fixture, redirecionamento de stderr para arquivo, e leitura
de `~/.claude/session-env/`).

Não contornei e não vou contornar — a barreira está certa. Precisa de decisão explícita do usuário.

**Duas coisas travadas pela mesma permissão:**
1. Provar `Stop` → `decision: block` numa sessão real (o desenho inteiro depende disso).
2. Ler `~/.claude/session-env/`, única pista aberta de onde a versão 2.1.x guarda o par pid↔sessionId
   que a detecção de Claude perdeu (descoberta #2).

**Estado:** fase 1 (investigação) entregue. Fase 2 (implementação) não começou de propósito — o
main.md manda investigar antes de codar, e o invariante "NUNCA prometer na UI o que não foi provado na
máquina" vale primeiro para mim. Nada de UI foi tocado, nada foi prometido.
Fixture da tentativa preservado em `tmp/hooktest/` (script do hook + settings de teste).
⎿ commit 35b501b+dirty · 1 file changed, 104 insertions(+), 1 deletion(-)
