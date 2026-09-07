# Journal — SPEC-20260906-1932

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-06 19:50
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
