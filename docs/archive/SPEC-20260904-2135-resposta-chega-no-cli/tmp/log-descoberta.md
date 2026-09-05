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
