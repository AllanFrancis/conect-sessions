# Journal — SPEC-20260906-1932

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-07 00:13
**Onde tô:** início — nada feito ainda
**Próximo passo:** <primeiro passo concreto>
**Última decisão:** —
**Bloqueio atual:** nenhum
**Se retomar, ler:** main.md desta SPEC

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | <fase> | pendente | 2026-09-06 19:50 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
<!-- anti-alucinação por estrutura: separe o que é SABIDO (verificado no código/teste) do que é CHUTE (inferido) do que está EM ABERTO. Nunca trate inferência como fato. -->
- fato:
- inferência:
- dúvida:

### Respostas-chave do usuário

### Tentativas que falharam

### Arquivos tocados

### Onde parei

### Sessões (máx 5 linhas + 1 agregada)

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
