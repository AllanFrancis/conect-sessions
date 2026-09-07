# Journal — SPEC-20260906-1932

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-07 00:36
**Onde tô:** CONCLUÍDA — implementada, testada e commitada (`4b6796f`, `94e63cd`)
**Próximo passo:** nenhum nesta SPEC. No programa: investigar-injecao-no-kiro (escolha do usuário em 00:34)
**Última decisão:** aprovação de ferramenta pendente publica `waiting`, não campo novo
**Bloqueio atual:** nenhum
**Se retomar, ler:** o `[conclusão]` no fim do LOG; para conferir o critério 2, `tmp/checar-painel.ps1`

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | Medir o caso real antes de codar | feito | 2026-09-07 00:06 |
| 2 | Braços de `waiting_on_user` no adaptador do Kiro | feito | 2026-09-07 00:10 |
| 3 | Lista do painel e leitura do estado | feito | 2026-09-07 00:25 |
| 4 | Testes, docs e memória de feature | feito | 2026-09-07 00:30 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
- fato: as duas sessões reais (`sess_896799a5`, `sess_98f85109`) saíram de `[UNKNOWN]` para
  `[WAITING]` no `--probe` — `evidence/probe-depois.txt`; nenhuma outra sessão mudou de estado.
- fato: `waiting_on_user` real NÃO caía no `else` final da cadeia de `declared`, como o main.md
  supunha — caía no braço "Kiro vivo, sessão ausente do log desta execução".
- fato: `waiting` já era aceito pelo zod de `/sync` e não houve mudança de schema.
- inferência: a sessão em `waiting`/`inferred` ainda está respondível na IDE. O disco prova que o
  Kiro parou numa pergunta e que ele segue vivo com o workspace aberto; não prova que a aba
  continua carregada. É o que o `inferred` diz, e o falso positivo está registrado em
  `docs/session-monitoring.md` §7.
- dúvida: nenhuma aberta. A que havia (aprovação de ferramenta = status ou campo?) virou `[decisão]`.

### Respostas-chave do usuário
- 2026-09-07 00:35 — "pode fechar" (critério 2, aceite do gap sem a conferida visual)
- 2026-09-07 00:34 — escolheu `investigar-injecao-no-kiro` como próxima, depois de eu corrigir o
  diagnóstico: o print dele era do Kiro, não do Claude Code, e a SPEC de permissão não cobre Kiro.

### Tentativas que falharam
- Nenhuma tentativa de implementação falhou. O que falhou foi a PREMISSA do main.md sobre onde o
  `waiting_on_user` caía na cadeia — corrigida por medição antes de escrever código.

### Arquivos tocados
- `public/agent/remote-agent.mjs` — três braços novos + `--probe` (ordem e resumo de vivas)
- `src/lib/session-display.ts` — `STATUS_NO_PAINEL`, `statusTone`
- `src/routes/_authenticated/dashboard.tsx` — filtro, tom e copy
- `src/components/terminal.tsx` — `waiting` com marcador `!` e cor deliberada
- `docs/session-monitoring.md` — tabela de derivação e falso positivo novo
- `docs/features/dashboard.md` — delta, DEC-20260907-0030, DEC-20260904-1443 ampliada
- `tests/installer/kiro-waiting.test.ts`, `tests/onboarding/painel-waiting.test.tsx` — novos

### Onde parei
Fechamento. Critério 2 com marcador de aceite; os outros quatro com evidência de máquina.

### Sessões (máx 5 linhas + 1 agregada)
- 2026-09-07 00:03–00:36 — ativação, medição, implementação, testes, docs e fechamento.

## LOG (append-only — NUNCA editar entradas antigas)
<!-- tipos: ativação descoberta decisão tentativa blocker unblock refactor nota conclusão | entrada nova: specctl log -->

## 2026-09-06 19:50 — [descoberta] waiting_on_user cai em unknown; o resto do caminho ja aceita waiting

Diagnóstico do usuário em 2026-09-06, medido antes de abrir a SPEC.

`remote-agent.mjs --probe` às 19:45 (state dir da instalação real):

    [UNKNOWN] kiro sess_896799a5-bc8c-482b-b0e8-818d3971526d
      ide=Kiro  pid=n/a  confiança=unknown
      · session.json status=waiting_on_user

Valores de `status` presentes nos `~/.kiro/sessions/*/session.json` desta máquina:
`idle` (7), `in_progress` (2), `failed` (1), `waiting_on_user` (1).

O adaptador do Kiro em `public/agent/remote-agent.mjs` só tem braço para `in_progress`, `idle` e
`failed`. `waiting_on_user` cai no `else` final: `status = "unknown"`, `confidence = "unknown"`.
O `dashboard.tsx` consulta `.eq("status", "active")`. Somados, a sessão que está esperando o usuário é
a única invisível na lista.

Boa notícia medida: o resto do caminho JÁ aceita o estado, então a correção é pequena.

- `src/lib/agent-sync-api.ts` — o zod de `/sync` já admite `"waiting"` no enum de `status`.
- `supabase/migrations/20260904171500_session_monitoring.sql` — não há CHECK em `sessions.status`,
  só um índice `(user_id, status, last_activity_at DESC)`. Nenhuma migração necessária.
- `src/components/terminal.tsx` — o mapa do `StatusDot` já tem `waiting: "text-destructive"`, hoje
  comentado como "valores legados de agentes ainda não atualizados".

Falta apenas o agente EMITIR e a lista NÃO FILTRAR.

Cuidado registrado: incluir o estado na lista encosta na DEC-20260904-1443 (lista só de ativas). A
inclusão deve ser explícita para `waiting`, não remoção do filtro.
⎿ commit 1a3a205+dirty · 2 files changed, 8 insertions(+), 1 deletion(-)

## 2026-09-07 00:04 — [ativação] SPEC ativada (branch feature/kiro-aguardando-usuario-visivel, base main)

## 2026-09-07 00:06 — [descoberta] waiting_on_user real não cai no else final: cai no braço sem-log-vivo

Medido agora com `--probe --json` (2026-09-07 01:05), com o Kiro VIVO (code.lock + log travado
20260906T123308492):

- sess_98f85109-… `status=waiting_on_user` → unknown, evidência "workspace aberto mas sessão ausente
  do log desta execução"
- sess_896799a5-… `status=waiting_on_user` → unknown, mesma evidência

Ou seja: a SPEC assumia que `waiting_on_user` caía no `else` final da cadeia de `declared` (o braço
com instância viva E sessão presente no log). Não cai. As duas sessões reais desta máquina são
barradas ANTES, no `if (!inLiveLog)`, que decide por presença no log e por workspace aberto sem
sequer olhar o `declared`.

Consequência para a implementação: mapear só a cadeia de `declared` não move NENHUMA sessão real
desta máquina de `unknown` — os critérios 1 e 2 continuariam falhando. O braço `!inLiveLog` com
`wsOpen === true` precisa passar a olhar `declared`.
⎿ commit a28a7f6

## 2026-09-07 00:06 — [decisão] aprovação de ferramenta do Kiro vira status waiting, não campo novo

A SPEC deixou em aberto: `ToolApproval] Requesting permission` vira status ou campo próprio?

**Decisão: status `waiting`.**

Porquê:

- É literalmente o mesmo estado que `waiting_on_user`: o turno parou e não anda sem o usuário. Dois
  nomes para a mesma coisa no painel só obrigariam a pessoa a aprender a diferença entre elas.
- Campo próprio custaria coluna nova em `sessions` + zod + tipos gerados — e mudança de schema está
  declarada FORA do escopo desta SPEC.
- `waiting` já é aceito pelo zod de `/sync` e já tem cor no `StatusDot`. Nada a inventar.
- A distinção "parou por pergunta" vs "parou por aprovação de ferramenta" não se perde: continua em
  `evidence[]`, visível no `--probe`, que é onde essa granularidade é usada (diagnóstico local).

Consequência: `declared === "in_progress"` deixa de ser sempre `active`. Quando a última linha da
sessão no log da instância viva é a de aprovação pendente, o estado emitido é `waiting`.
⎿ commit a28a7f6+dirty · 1 file changed, 20 insertions(+), 1 deletion(-)

## 2026-09-07 00:13 — [nota] medição depois: as duas sessões reais saíram de unknown para waiting

`--probe` com o Kiro vivo, saída completa em `evidence/probe-depois.txt`:

```
[WAITING] kiro sess_896799a5-…  confiança=inferred   projeto=c:\dev\vinci-stack
    · session.json status=waiting_on_user
    · Kiro vivo com o workspace aberto e session.json parado em waiting_on_user; sessão ausente do log desta execução
[WAITING] kiro sess_98f85109-…  confiança=inferred   projeto=c:\dev\meus projetos\conect-sessions
```

Antes: as duas em `[UNKNOWN]`, confiança `unknown`.

Conferido linha a linha contra a medição anterior: nenhuma outra sessão mudou de estado. As 15
sessões do Kiro seguem com o mesmo `status` e a mesma `confidence`, exceto essas duas.

O que NÃO deu para medir na máquina, e por quê:

- `waiting_on_user` SEM Kiro vivo (critério 3) — exigiria matar o Kiro do usuário. Coberto por
  `tests/installer/kiro-waiting.test.ts`, que semeia um `~/.kiro` de mentira num perfil redirecionado
  (sem `code.lock` ⇒ sem instância viva) e roda o agente de verdade contra ele.
- Os braços COM a sessão presente no log da instância viva (`waiting_on_user` declarado e aprovação
  de ferramenta pendente) — dependem de um `kiro.exe` real cujo PID bate com o lock E de a sessão
  estar carregada nesta execução. Não fabricável em teste; é o mesmo caminho de código dos braços
  medidos.
⎿ commit a28a7f6+dirty · 6 files changed, 172 insertions(+), 39 deletions(-)

## 2026-09-07 00:36 — [nota] critério 2 aceito incompleto pelo usuário, sem a conferida visual

Pedi a conferida no painel (o critério exige ver a sessão na lista, e isso precisa de navegador
logado — não roda daqui). O usuário respondeu `"pode fechar"` às 00:35 sem dizer que olhou, então o
critério fica `[aceito-incompleto: "pode fechar" 2026-09-07 00:35]` e NÃO `[x]`: marcar como
verificado seria afirmar uma evidência que não existe.

O que está provado por máquina, e que sustenta as duas metades do critério separadamente:

- o agente EMITE `waiting` para as duas sessões reais do Kiro (`--probe`, `evidence/probe-depois.txt`)
- a lista BUSCA `waiting` — `STATUS_NO_PAINEL` foi extraído para `src/lib/session-display.ts`
  justamente para poder ser testado, já que a consulta inline não era provável sem navegador
- a linha RENDERIZA legível — `tests/onboarding/painel-waiting.test.tsx` monta o `StatusDot` de
  verdade e checa marcador (`!`), cor (`text-destructive`) e distinção de `active`/`finished`

O que fica sem prova: as três coisas juntas, na tela, com dado real vindo do banco sob RLS.

Ferramenta pronta para quando ele quiser conferir: `tmp/checar-painel.ps1` (para o agente instalado,
roda o agente novo do fonte por 20s contra o dev local, religa o instalado no fim). Se a conferida
reprovar, o caminho é `reopen`, não SPEC nova.
⎿ commit 94e63cd+dirty · 1 file changed, 1 insertion(+), 1 deletion(-)

## 2026-09-07 00:36 — [conclusão] a sessão do Kiro que espera o usuário sai de unknown e chega ao painel como waiting

**Entregue** (commits `4b6796f`, `94e63cd`):

- `public/agent/remote-agent.mjs` — `waiting_on_user` ganhou os três braços que faltavam: com a
  sessão no log da instância viva → `waiting`/`confirmed`; com Kiro vivo e o workspace dela aberto,
  mas ausente do log → `waiting`/`inferred`; sem Kiro vivo → `finished` (pergunta congelada não
  espera ninguém). Aprovação de ferramenta pendente passou a ser `waiting` também, em vez de só
  evidência num array que nunca era transportado.
- `src/lib/session-display.ts` — `STATUS_NO_PAINEL` e `statusTone` extraídos do route file, para o
  filtro da lista ser testável sem navegador.
- `src/routes/_authenticated/dashboard.tsx` — a consulta passou de `.eq("status","active")` para
  `.in("status", STATUS_NO_PAINEL)`; título, estado vazio e dicas passaram a dizer a verdade nova.
- `src/components/terminal.tsx` — `waiting` saiu de "valor legado" e ganhou marcador `!` próprio.
- `docs/session-monitoring.md` — a tabela de derivação do Kiro, com a linha `waiting`/`inferred` e o
  porquê de ela ser a exceção deliberada ao `unknown`.
- Testes: `tests/installer/kiro-waiting.test.ts` (agente roda de verdade contra um `~/.kiro` semeado
  num perfil redirecionado) e `tests/onboarding/painel-waiting.test.tsx` (render real do `StatusDot`).

**Critérios:** 1, 3, 4 e 5 `[x]` com evidência de máquina. O 2 fica
`[aceito-incompleto: "pode fechar" 2026-09-07 00:35]` — exige olhar o painel logado, o que não roda
daqui; as duas metades estão provadas em separado, o conjunto na tela não.

**O que a SPEC aprendeu e o main.md não previa:** as sessões reais não caíam no `else` final da
cadeia de `declared`. Caíam antes, no braço que decide por presença no log sem olhar o status
declarado. Ter medido com `--probe --json` ANTES de codar é a única razão de a entrega ter mexido
no lugar certo — a implementação que a SPEC descrevia teria passado nos próprios testes e não teria
tirado nenhuma sessão real de `unknown`.

**Efeito colateral útil:** ao abrir a lista para `waiting`, esta SPEC removeu o que de fato
bloqueava a `permissao-remota-ponta-a-ponta` — um pedido de permissão pendente agora tem onde
aparecer, em vez de cair da lista após 60s por `idleMs`.
⎿ commit 94e63cd+dirty · 2 files changed, 24 insertions(+), 2 deletions(-)
