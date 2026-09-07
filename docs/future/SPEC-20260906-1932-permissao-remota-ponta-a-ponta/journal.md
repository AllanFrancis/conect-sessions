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

## 2026-09-06 19:50 — [descoberta] LRC_PERM nasce desligado e nada no produto o liga; pending nao e sincronizado

Diagnóstico do usuário em 2026-09-06, medido antes de abrir a SPEC.

O canal de permissão do `PreToolUse` funciona, mas exige `LRC_PERM=1` e **nada no produto instalado
define essa variável**. Conferido por busca nos três arquivos que injetam ambiente:

- `public/agent/launcher.ps1` define `LRC_TOKEN`, `LRC_URL`, `LRC_AGENT_VERSION`,
  `LRC_AGENT_PLATFORM`, `LRC_PLUGIN_STATUS`, `LRC_STATE_DIR`. Não define `LRC_PERM`.
- `plugins/conect-sessions/scripts/invoke-hook.ps1` define só `LRC_STATE_DIR`.
- `public/agent/install-agent.ps1` — busca por `LRC_PERM` retorna zero ocorrências.

Não há chave no painel. O recurso é inalcançável para quem instalou pelo comando único.

Testes contra o hook real (`.scratch/diag-entrega.mjs`):

| # | cenário | resultado |
|---|---|---|
| T4 | `PreToolUse` com ambiente PADRÃO, escolha "Sim, permitir" no inbox | stdout vazio em **50ms**; `pending/` NÃO publicado; inbox intacto |
| T5 | `PreToolUse` com `LRC_PERM=1`, mesma escolha | `permissionDecision: "allow"` em **55ms** |
| T6 | `PreToolUse` com `LRC_PERM=1` e `LRC_PERM_WAIT=3`, sem escolha | bloqueou **3116ms** e saiu calado |

T4 explica o resíduo em disco: a escolha `"Sim abra"` do usuário ficou no inbox como texto comum
(ver o journal da SPEC-20260906-1932-stop-espera-resposta-remota), para ser entregue como fala em vez
de virar decisão.

Caminho de volta ao painel: inexistente. Busca por `pending` em `public/agent/remote-agent.mjs`
retorna só `payload.type === "pending_interaction"` — que é parsing de transcrição do Kiro, não
leitura do `state/pending/`. O `sessionPayload()` não tem campo para pedido pendente.

No Kiro o agente DETECTA o pedido (`last.includes("ToolApproval] Requesting permission")`) mas só
empurra para `s.evidence[]`, um array que o `sessionPayload()` não envia. O painel nunca fica sabendo.

T6 é o custo a decidir: com o canal armado, a sessão local fica bloqueada pelo prazo da espera antes
de o modal abrir. Quem está na máquina paga isso a cada pedido de permissão.
⎿ commit 1a3a205+dirty · 2 files changed, 8 insertions(+), 1 deletion(-)
