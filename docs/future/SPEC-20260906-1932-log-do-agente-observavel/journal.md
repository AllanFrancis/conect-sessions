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
