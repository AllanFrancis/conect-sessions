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

## 2026-09-06 19:50 — [descoberta] resposta para Kiro e marcada delivered e descartada; UI oferece botao sem canal

Diagnóstico do usuário em 2026-09-06, medido antes de abrir a SPEC.

A guarda que descarta tudo que não é Claude Code, em `public/agent/remote-agent.mjs`:

    function entregarNaSessao(externalId, reply) {
      if (typeof externalId !== "string") return;
      const sep = externalId.indexOf(":");
      const agent = externalId.slice(0, sep);
      const sessionId = externalId.slice(sep + 1);
      if (agent !== "claude-code" || !sessionId) return;

Efeito combinado com o `/sync`: o `UPDATE ... RETURNING` de `sync.ts` marca a reply como
`status='delivered'` no mesmo comando em que a entrega ao agente, e o
`sessions.$sessionId.tsx` só desenha bolha para `status === "pending"`. Numa sessão do Kiro a
resposta é portanto marcada entregue, descartada pelo agente, e a bolha desaparece da tela. A fala do
usuário some sem ter existido em lugar nenhum.

O painel, ao mesmo tempo, DESENHA botões clicáveis para o `pending_interaction` do Kiro (o
`normalizeKiro()` normaliza para o mesmo `meta.ask` do `AskUserQuestion`, e o `AskBlock` renderiza).
O texto do card é honesto ("escolha enviada ao agente — o terminal ainda precisa confirmar"), mas o
botão é uma afordância, e foi nela que o usuário bateu.

O `docs/features/dashboard.md` registra a decisão da SPEC-20260904-2135: "Kiro está fora: nenhuma
superfície de injeção equivalente foi encontrada, e o painel não promete entrega lá". A decisão está
documentada; a UI não a reflete.

A confirmar na fase 1 desta SPEC (documentação, ainda NÃO medido na máquina — tratar como hipótese):
os hooks do Kiro parecem se comportar diferente dos do Claude Code em três pontos que matam o truque
do `Stop`:

1. ação `agent` injeta prompt ESTÁTICO, não texto dinâmico;
2. stdout de ação `command` só é aproveitado em `SessionStart`, `UserPromptSubmit` e `PreToolUse` —
   não em `Stop`;
3. `permissionDecision` de `PreToolUse` aceita `ask` (pede confirmação ao usuário), e negar sai por
   `exit 2`; `allow` não aparece na superfície.

Se (2) se confirmar, não há como devolver a fala do usuário no fim do turno. Se (3) se confirmar,
decidir permissão remotamente no Kiro é estruturalmente impossível — dá para negar, não para
permitir.
⎿ commit 1a3a205+dirty · 2 files changed, 8 insertions(+), 1 deletion(-)
