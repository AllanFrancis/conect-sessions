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
