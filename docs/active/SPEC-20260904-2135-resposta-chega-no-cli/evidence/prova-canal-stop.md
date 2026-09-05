# Prova do canal `Stop` — 2026-09-05

Tudo abaixo rodou com `claude` de verdade nesta máquina, não simulado. As sessões de teste usaram um
projeto descartável no scratchpad com o hook em `.claude/settings.json` PRÓPRIO daquele projeto — o
`~/.claude/settings.json` do usuário continua intocado (a escrita nele segue barrada pelo classifier).

## 1. A forma aninhada NÃO funciona (defeito encontrado e corrigido)

Primeira execução, hook emitindo `{"hookSpecificOutput":{"hookEventName":"Stop","decision":"block",...}}`:

    num_turns: 1 | stop_reason: end_turn | result: 'PRONTO'
    inbox: DRENADO (vazio)

O hook rodou e drenou, o Claude Code ignorou a decisão — e a fala do usuário sumiu junto. `decision`
e `reason` são TOP-LEVEL no evento `Stop`; aninhado é a forma do `PreToolUse`.

## 2. Com `decision`/`reason` no topo, a sessão continua sozinha — critério #1

Inbox semeado ANTES da sessão subir (`--session-id` fixo torna o teste determinístico):

    {"id":"prova-3","content":"responda apenas a palavra ABACAXI",...}
    claude --session-id 33333333-... -p "Diga apenas: PRONTO" --model haiku
    → num_turns: 2 | result: 'ABACAXI'

Dois turnos: o primeiro respondeu PRONTO, o `Stop` entregou a fala do painel, a sessão continuou sem
ninguém digitar e obedeceu. É a entrega.

## 3. Resposta de A não chega em B — critério #3

Inbox semeado para a sessão A, sessão B executada:

    SESSAO B -> num_turns: 1 | result: 'PRONTO'
    inbox de A: INTACTO

## 4. `--probe` enxerga a sessão viva — critério #5

Sondagem durante o turno de uma sessão com hook:

    [ACTIVE] claude-code eeeeeeee-...
      ide=desconhecida  pid=34836  confiança=confirmed
      fontes=claude:hook+claude:process+claude:transcript

## 5. Sessão SEM hook degrada, não mente — critério #6

Projeto sem `.claude/settings.json`, inbox semeado para aquele id:

    num_turns: 1 | result: '# O Cultivo do Abacaxi: Guia Completo...'
    inbox: INTACTO (nada entregue)
    ~/.lrc/sessions/: nenhum registro criado

Comportamento idêntico ao de antes desta SPEC. Nada foi prometido e nada foi entregue.

## 6. `LRC_REPLY_FILE` e `LRC_REPLY_CMD` continuam — critério #4

Agente real contra um servidor falso local, em HOME isolado:

    LRC_REPLY_FILE  → "resposta vinda do painel"
    LRC_REPLY_CMD   → "CMD RODOU: resposta vinda do painel | sessao=uuid-do-banco-1"
    inbox do hook   → {"id":"r1","content":"resposta vinda do painel","at":"..."}

Os três canais na mesma entrega: o novo não substituiu os antigos.

## 7. Prompt de permissão destravado pela escolha do painel — critério #2

Mesmo projeto descartável, agora com `PreToolUse` (matcher `Bash|Write|Edit`) no settings.

**Baseline — hook desarmado** (`LRC_PERM` ausente), pedindo uma escrita que exige permissão:

    result: "Preciso de permissão para criar o arquivo. O sistema está pedindo autorização
             para escrever em `alvo.txt` no diretório atual. Você pode: 1. Aprovar..."
    alvo.txt: NÃO existe

**Armado** (`LRC_PERM=1 LRC_PERM_WAIT=60`), com a escolha do painel semeada no inbox
(`"Sim, permitir sempre"` — o rótulo do botão, que é exatamente o que o painel manda hoje):

    result: "Arquivo `alvo.txt` criado com sucesso no diretório atual com o conteúdo \"OK\"."
    alvo.txt: existe, conteúdo OK
    duration_ms: 8263

O `PreToolUse` devolveu `permissionDecision: "allow"` e a ação passou sem modal. É o sinal de
sucesso do contrato: a escolha feita no celular tira o terminal do prompt sem ninguém encostar
no teclado.

**Comportamento defensivo, verificado no hook direto:**

    desarmado (padrão)         → sai calado em 65ms, não espera nada
    "Always allow"             → {"hookSpecificOutput":{...,"permissionDecision":"allow",...}}
    "segue o plano" (não é     → saída vazia E a mensagem VOLTA para o inbox, para ser entregue
     decisão)                    pelo `Stop` como texto — não vira autorização por chute
