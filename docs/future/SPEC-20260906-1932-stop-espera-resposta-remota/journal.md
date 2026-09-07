# Journal — SPEC-20260906-1932

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-06 19:49
**Onde tô:** início — nada feito ainda
**Próximo passo:** <primeiro passo concreto>
**Última decisão:** —
**Bloqueio atual:** nenhum
**Se retomar, ler:** main.md desta SPEC

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | <fase> | pendente | 2026-09-06 19:49 |

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

## 2026-09-06 19:49 — [descoberta] Stop e o unico dreno do inbox e nao dispara em sessao parada

Diagnóstico do usuário em 2026-09-06, medido antes de abrir a SPEC.

Cadeia de entrega: painel → Supabase `replies` → agente (tick 2s) → `state/inbox/claude-<sid>.jsonl`
→ hook `Stop` drena com `rename` → `decision:"block"` + `reason`.

O `Stop` é o ÚNICO dreno, e ele dispara só no fim de um turno. Hooks registrados pelo plugin:
`SessionStart`, `Stop`, `SessionEnd`, `PreToolUse`. Nenhum ocorre em sessão parada esperando o
usuário.

Testes contra o hook real (`public/agent/claude-hook.mjs`, via `.scratch/diag-entrega.mjs`):

| # | cenário | resultado |
|---|---|---|
| T1 | `Stop` com resposta no inbox | entrega, `decision:block` — o mecanismo funciona |
| T2 | `Stop` com inbox vazio | retorna em **613ms**, sem esperar |
| T3 | resposta entra no inbox DEPOIS do `Stop` | fica lá; nenhum evento dispara |

Evidência em disco, `C:\Users\allan\.lrc\inbox\claude-f4d59edd-cb4d-40e0-a808-6c1bcb9715be.jsonl`
(196 bytes, mtime 2026-09-06 00:21, ainda não drenado às 19:45 — ~19h):

    {"id":"b17207c9-…","content":"Sim abra","at":"2026-09-06T00:21:18.998Z"}
    {"id":"8c3c76f7-…","content":"Ola!!!",  "at":"2026-09-06T00:21:46.435Z"}

Agravante: `status = idleMs < 60000 ? "active" : "idle"` no agente + `.eq("status","active")` no
dashboard. Na janela em que a sessão é alcançável pela lista, o turno já terminou. `--probe` às
19:45 mostrou a sessão de Claude no VS Code como `[IDLE]` (atividade 19:36).

Segundo defeito do mesmo caminho: `sync.ts` marca `status='delivered'` no mesmo `UPDATE` que devolve
a resposta ao agente, e o painel só desenha bolha para `pending`. A bolha "✳ enviada ao agente…"
desaparece quando o agente RECEBE, não quando a sessão recebe.

Cobertura atual: `bun test tests/plugin tests/onboarding` = 51/51 verde. O
`tests/plugin/hook-runtime.test.ts` semeia o inbox ANTES do `Stop` — testa só a ordem que funciona.
A ordem que falha não tem teste.
⎿ commit 1a3a205+dirty · 2 files changed, 8 insertions(+), 1 deletion(-)
