# Journal — SPEC-20260906-1932

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-06 22:20
**Onde tô:** implementação completa; 6/6 critérios com evidência de máquina, suítes verdes
**Próximo passo:** commitar, carimbar os critérios com `check` e levar o fechamento ao usuário
**Última decisão:** o agente vira dono de agent.log; launcher.ps1 para de redirecionar (ver LOG 21:51)
**Bloqueio atual:** nenhum
**Se retomar, ler:** main.md desta SPEC + as entradas [descoberta] 21:50 e [decisão] 21:51 do LOG

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | Escritor de log no agente (caminho por env, níveis, rotação, redação do token) | concluída | 2026-09-06 22:20 |
| 2 | Converter as saídas de diagnóstico do laço/postSync/tick para o escritor | concluída | 2026-09-06 22:20 |
| 3 | Rastro de entrega em `entregarNaSessao` (sucesso, descarte, falha) | concluída | 2026-09-06 22:20 |
| 4 | launcher.ps1: tira o redirect, passa `LRC_LOG_FILE`, cede a rotação ao agente | concluída | 2026-09-06 22:20 |
| 5 | Testes: 5 casos novos em agent-log.test.ts + asserção no E2E do binário compilado | concluída | 2026-09-06 22:20 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
<!-- anti-alucinação por estrutura: separe o que é SABIDO (verificado no código/teste) do que é CHUTE (inferido) do que está EM ABERTO. Nunca trate inferência como fato. -->
- fato: o agente não conhece o install root — só `LRC_STATE_DIR`, que o launcher define (remote-agent.mjs:115, launcher.ps1:73)
- fato: `launcher.ps1:76-79` redireciona stdout/stderr para `agent.log`/`agent.err.log` e o handle fica preso no filho
- fato: `remote-agent.mjs:1501` imprime `reply.content` — texto do usuário, não pode ir a arquivo
- fato: rotação do launcher é `-gt 2MB` → `Move-Item "$file.1" -Force`, uma geração, só no start (launcher.ps1:53-58)
- fato: `entregarNaSessao` tem dois `return` silenciosos (1529, 1533) — resposta para Kiro morre sem rastro
- inferência: o rename da rotação falha no Windows enquanto o handle do redirect estiver aberto (FILE_SHARE_DELETE); por isso o redirect sai
- dúvida: critérios 1, 2, 3 e 6 exigem máquina instalada — quem observa é o usuário, depois do comando de reparo

### Respostas-chave do usuário
- 2026-09-06 21:45 — "a": backlog do programa entra por commit direto na `main`, não por PR dedicado

### Tentativas que falharam
- 1ª execução de `agent-log.test.ts`: o caso esperava `tick 1` logo após `sync recusado`, mas a linha do tick é escrita DEPOIS do tick inteiro — a espera passou a ser por `tick 1`.
- Mesma execução, achado mais sério: o teste não era hermético. `CLAUDE_HOMES` sempre acrescenta `~/.claude` e `DEFAULT_DIRS` inclui `~/.kiro`, então o agente do teste listou as transcrições REAIS da máquina e começou a enviá-las ao servidor de mentira. Resolvido redirecionando `USERPROFILE`/`HOME` para a raiz do caso (e o caso ficou 3x mais rápido).

### Arquivos tocados
- `public/agent/remote-agent.mjs` — helper `log()`, `LRC_LOG_FILE`/`LRC_LOG`, rotação, redação do token, rastro de entrega
- `public/agent/launcher.ps1` — sai o redirect e a rotação; entra `LRC_LOG_FILE`
- `public/agent/install-agent.ps1` — mensagem de falha aponta `agent.log` (não mais `agent.err.log`)
- `tests/installer/agent-log.test.ts` — NOVO, 5 casos executando o agente contra servidor de mentira
- `tests/installer/windows-e2e.test.ts` — asserção de `agent.log` no binário compilado iniciado pelo launcher

### Onde parei

### Sessões (máx 5 linhas + 1 agregada)

## LOG (append-only — NUNCA editar entradas antigas)
<!-- tipos: ativação descoberta decisão tentativa blocker unblock refactor nota conclusão | entrada nova: specctl log -->

## 2026-09-06 19:50 — [descoberta] agent.log com 0 bytes: windows-hide-console descarta o stdout do agente

Diagnóstico do usuário em 2026-09-06, medido antes de abrir a SPEC.

Agente instalado e vivo: `agent.pid` aponta PID 27996, `Get-Process` confirma
`conect-agent`, StartTime 2026-09-06 12:14:44, `start` do registro casa
(`134331848845375573`).

Estado dos logs às 19:45, ~7h30 depois do start:

    Name           Length LastWriteTime
    agent.err.log       0 06/09/26 12:14:44
    agent.log           0 06/09/26 12:14:44

Zero bytes, `LastWriteTime` congelado no instante do start. Causa: `scripts/build-agent.mjs` compila
com `--windows-hide-console`, e o `Start-Process -RedirectStandardOutput` do `launcher.ps1` não
recupera o que um processo sem console não escreve.

Consequência: nenhuma das linhas de diagnóstico que o fonte já tem chega a disco —
`sync recusado: <status> <corpo>`, `sync falhou: <motivoDaFalha>` (que já extrai o `cause` do
undici: ECONNRESET, UND_ERR_SOCKET, ETIMEDOUT), `não consegui enfileirar a resposta para o hook`.

Este diagnóstico teve que ser feito lendo estado em disco (`state/inbox`, `state/sessions`,
`agent.pid`, `install.log`) e rodando o hook à mão, porque não havia log. `install.log` existe e é
útil (11 linhas, do download ao "Agente em execução"), mas cobre só a instalação.
⎿ commit 1a3a205+dirty · 2 files changed, 8 insertions(+), 1 deletion(-)

## 2026-09-06 21:45 — [ativação] SPEC ativada (branch feature/log-do-agente-observavel, base main)

## 2026-09-06 21:50 — [descoberta] o redirecionamento do launcher impede a rotacao, e o agente nao sabe onde fica o install root

Mapa do código lido nesta sessão, com arquivo:linha. Fatos verificados no fonte, não inferência.

**O agente não conhece o install root.** Não há `process.execPath`, `import.meta.url` nem `__dirname`
em `public/agent/remote-agent.mjs`. O único vínculo com a pasta de instalação é indireto:
`STATE_DIR = process.env.LRC_STATE_DIR || path.join(HOME, ".lrc")` (linha 115), e é o
`launcher.ps1:73` que define `LRC_STATE_DIR = <installRoot>\state`. Ou seja: hoje o agente NÃO tem
como saber onde gravar `agent.log` — o caminho tem que ser dado a ele.

**O launcher mantém um handle aberto em `agent.log` pela vida inteira do processo.**
`launcher.ps1:76-79` faz `Start-Process -RedirectStandardOutput (Join-Path $installRoot 'agent.log')
-RedirectStandardError (... 'agent.err.log')`. O arquivo é criado e o handle passado ao filho como
stdout/stderr. No Windows, renomear arquivo com handle aberto que não foi aberto com
FILE_SHARE_DELETE falha. Consequência direta: **enquanto o redirecionamento existir, a rotação do
critério 6 não pode funcionar no mesmo nome de arquivo** — o `rename` do agente bate no handle do
próprio processo.

**Rotação do launcher, esquema exato** (`launcher.ps1:53-58`), para reusar igual: limite `2MB`
(2.097.152 bytes), comparação `-gt` (estritamente maior), `Move-Item -Destination "$file.1" -Force`
— renomeia, **uma geração só** (não existe `.2`), nunca trunca. Roda UMA vez por start do launcher,
nunca durante a execução. Não há teste cobrindo isso (`grep agent\.log|2MB|RedirectStandardOutput`
em `tests/**` volta vazio).

**`deliverReplies` imprime o texto da resposta no console.** `remote-agent.mjs:1501`:
`console.log(\`\n>> resposta remota para ${origem}:\n${reply.content}\n\`)`. Isso é conteúdo do
usuário. Trocar `console.*` por escrita em arquivo em bloco colocaria o texto da resposta em disco —
viola o invariante "NUNCA gravar o texto da resposta em claro" e o critério 4. Esta linha tem que
ficar de fora do que vai ao arquivo.

**As três mensagens citadas no main.md, localizadas.** Em `postSync` (1438-1479):
`1461` `sync recusado: <status> <corpo>` (4xx, não retenta) · `1465` `sync falhou: <status> <corpo>`
(5xx última tentativa) · `1468` retentativa com backoff · `1471` `sync falhou: <motivoDaFalha>`
(transporte, última) · `1474-1477` transporte com backoff. Em `entregarNaSessao`:
`1546` `não consegui enfileirar a resposta para o hook: <err.message>` — usa `err.message` cru, NÃO
`motivoDaFalha`. Em `tick`: `1636` `erro em <file>` · `1654` `erro ao sincronizar <key>`. No laço:
`1735` exceção que escapou do tick. `motivoDaFalha` está em `1425-1428` e devolve
`` `${err.message} (${err.cause.code ?? err.cause.message})` ``.

**Escrita no inbox — o que virar linha de log.** `entregarNaSessao(externalId, reply)` em
`1528-1549`: endereçamento por `external_id` no formato `"claude-code:<sessionId>"`, arquivo
`<STATE_DIR>/inbox/claude-<sessionId sanitizado 120 chars>.jsonl`, append de uma linha JSON com
`{id, content, at}`. Id da resposta = `reply.id`; sessão de destino = `sessionId` extraído do
`external_id` (nunca o uuid do banco). **Há dois `return` silenciosos** — `1529` (`externalId` não é
string) e `1533` (agente ≠ `claude-code`, ou sessionId vazio). Hoje uma resposta destinada ao Kiro
sai por `1533` sem deixar rastro nenhum: é exatamente o buraco que o critério 3 fecha.

**`--probe` não pode ir para arquivo.** `probe()` (1663-1709) tem ~20 `console.log` e é o modo
foreground; `tests/installer/agent-build.test.ts:46-51` parseia o stdout de `--probe --json`.
Escrever isso em arquivo quebraria o teste e sujaria o log. O `probe` retorna antes do laço, então
basta não instrumentar esse caminho.

**Convenção de env do agente** (`remote-agent.mjs:44-56`): `process.env.LRC_X || default` para
string, `Number(process.env.LRC_X || n)` para número, `process.env.LRC_X !== "0"` para liga/desliga
(`MONITOR_ON`, linha 55), constante em MAIÚSCULA, cada uma documentada no docblock do topo (24-33).

**Onde os testes do agente rodam:** `tests/installer/agent-build.test.ts` executa o agente pelo
FONTE (`resolve("public/agent/remote-agent.mjs")`, linha 14) via `Bun.spawn`, capturando
stdout/stderr — não pelo binário compilado (compilar leva dezenas de segundos e gera ~100MB). É o
lugar natural para provar os critérios 4 e 5 sem instalar nada. Comandos:
`bun test tests/installer` / `tests/plugin` / `tests/onboarding` (`package.json:12-14`).
⎿ commit 2dbd065+dirty · 2 files changed, 152 deletions(-)

## 2026-09-06 21:51 — [decisão] o agente vira dono de agent.log; o launcher para de redirecionar

Duas decisões forçadas pela descoberta anterior, mais o desenho do escritor.

**1. O `launcher.ps1` para de redirecionar stdout/stderr; o agente passa a ser o único escritor de
`agent.log`.** Alternativa era o agente escrever num nome novo (`agent-runtime.log`) e deixar o
redirecionamento em paz — mas o main.md pede explicitamente "no mesmo arquivo" e "uma superfície só",
e o redirecionamento está comprovadamente produzindo 0 byte (é a causa raiz da SPEC). Manter um
redirecionamento que não entrega nada e que ainda bloqueia o `rename` da rotação seria manter o
defeito por simetria. A rotação sai do launcher e passa a ser do agente, que é quem sabe quando o
arquivo cresceu.

Consequência de implantação, sem rodeio: `launcher.ps1` é gravado na pasta de instalação pelo
instalador a partir do fonte embutido. Máquina já instalada só ganha o launcher novo rodando o
comando de reparo do painel. Sem o reparo, o launcher antigo continua redirecionando e o agente novo
vai encontrar o handle preso — a rotação falha em silêncio (fail-open, ver invariante) e o log ainda
assim tem conteúdo, porque a escrita é em append por handle próprio. Degradação aceitável, não é
quebra.

**2. O caminho do log vem por env, não por dedução.** `LRC_LOG_FILE=<installRoot>\agent.log`,
definido pelo launcher junto das outras `LRC_*`. Fallback quando ausente mas `LRC_STATE_DIR` existe:
`path.dirname(STATE_DIR)/agent.log`. Sem nenhuma das duas (agente rodado à mão do repositório):
NÃO grava arquivo, só console — é o comportamento de hoje e é o certo para desenvolvimento, ninguém
quer um `agent.log` aparecendo em `~/.lrc/..` porque rodou o fonte.

**3. `LRC_LOG` controla o nível:** `0` desliga o arquivo · `error` só stderr-equivalente · `info`
(default) · `debug` inclui o detalhe por tick. Segue a convenção `process.env.LRC_X` do topo do
arquivo.

**4. `console.*` NÃO é substituído em bloco.** Um helper `log(nivel, msg)` escreve em arquivo E no
console; as chamadas convertidas são as do laço, `postSync`, `tick` e a entrega. Ficam FORA do
arquivo, como `console.log` puro:
- `1501` (`>> resposta remota para …` com `reply.content`) — é texto do usuário, invariante proíbe.
- `probe()` (1663-1709) e `--version` — foreground e parseados por teste.
- `1719-1723` (cabeçalho) vão ao arquivo: é o que prova "tem conteúdo depois do primeiro tick" e não
  contém segredo (`URL_BASE`, HOME, lista de pastas).

**5. Entrega ganha rastro nos três desfechos**, porque o buraco do diagnóstico foi não saber separar
"não chegou" de "chegou e ficou no inbox": sucesso → `sessão=<sessionId> resposta=<reply.id>
bytes=<content.length> arquivo=<nome>`; descartada por agente não suportado (o `return` de 1533,
caso Kiro) → linha dizendo isso; falha de escrita → a mensagem que já existe em 1546, agora com
`motivoDaFalha` em vez de `err.message` cru.

**6. Redação defensiva do token.** Antes de escrever, toda linha passa por uma substituição do valor
de `TOKEN` por `***` quando `TOKEN` não é vazio. O corpo de resposta do servidor (`corpo` em 1461 e
1465) é conteúdo de terceiro; não custa nada garantir. É o que sustenta o critério 5 por construção
em vez de por esperança.

**Sobre os critérios que só a máquina do usuário fecha:** 1, 2, 3 e 6 falam de "agente instalado e
iniciado pelo launcher". Vou cobrir por teste automático o que dá (crítérios 4 e 5 via
`tests/installer/agent-build.test.ts`, que já roda o agente pelo fonte capturando stdout; rotação a
nível de função), mas a observação final em máquina instalada é do usuário. Isso NÃO é deferral: os
critérios continuam `[ ]` até a evidência existir.
⎿ commit 2dbd065+dirty · 2 files changed, 152 deletions(-)
