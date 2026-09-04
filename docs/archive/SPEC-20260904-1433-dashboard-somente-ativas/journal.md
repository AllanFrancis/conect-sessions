# Journal — SPEC-20260904-1433

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-04 14:44
**Onde tô:** entrega feita e commitada (fc53ff4); fechando a SPEC
**Próximo passo:** close; depois merge da branch em main é decisão do usuário
**Última decisão:** filtrar `status = 'active'` no servidor, não no cliente
**Bloqueio atual:** nenhum — critério 3 aceito incompleto pelo usuário (gates repo-wide vermelhos por trabalho de terceiros em voo)
**Se retomar, ler:** main.md desta SPEC e docs/features/dashboard.md

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | Filtro na query do dashboard + textos coerentes | concluído | 2026-09-04 14:36 |
| 2 | Feature dashboard + área na TAXONOMY (R.4/R.13) | concluído | 2026-09-04 14:45 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
- fato: `eslint src/routes/_authenticated/dashboard.tsx` sai exit 0 após prettier no arquivo.
- fato: `bunx tsc --noEmit` só reporta vite.config.ts, arquivo alterado por terceiros no working tree.
- fato: `bun run lint` acusa ~8.7k erros prettier `Delete ␍` em 72 arquivos — CRLF do checkout Windows, pré-existente.
- fato: CLAUDE.md passou de 6.000B (R.16) por edição de terceiros não-commitada, não por esta SPEC.
- inferência: o refactor em voo remove o Lovable do projeto; não toquei nele.
- dúvida: sessão recém-aberta fica `idle` — se incomodar na prática, o filtro pode virar `active|idle` numa SPEC futura.

### Respostas-chave do usuário
- 2026-09-04 14:43 — "Aceitar incompleto" para o critério 3; criar `docs/features/dashboard.md` (área `dashboard` = confirmação R.13).

### Tentativas que falharam
- Primeira escrita do bloco `TermHints` saiu com indentação errada — prettier no arquivo resolveu.

### Arquivos tocados
- src/routes/_authenticated/dashboard.tsx · docs/features/dashboard.md · docs/TAXONOMY.md

### Onde parei
Tudo entregue; só falta o close e a decisão de merge.

### Sessões (máx 5 linhas + 1 agregada)
- 2026-09-04 14:33–14:45 — abertura, filtro, feature, fechamento.

## LOG (append-only — NUNCA editar entradas antigas)
<!-- tipos: ativação descoberta decisão tentativa blocker unblock refactor nota conclusão | entrada nova: specctl log -->

## 2026-09-04 14:33 — [ativação] SPEC criada e ativada (@AllanFrancis, branch feat/dashboard-somente-ativas, base main)

## 2026-09-04 14:36 — [descoberta] working tree tem refactor de terceiros em voo (des-Lovable)

Ao rodar os gates encontrei modificações não-commitadas que não são desta SPEC:
vite.config.ts reescrito sem @lovable.dev/vite-tanstack-config, .lovable/project.json
e src/integrations/lovable/* deletados, package.json/bun.lock/README/auth alterados.

Consequência para o critério 3: `bunx tsc --noEmit` falha em vite.config.ts (defineConfig
async), e `bun run lint` acusa ~8.7k erros prettier `Delete ␍` em 72 arquivos (CRLF do
checkout no Windows) — ambos alheios a esta mudança. Escopo desta SPEC verificado
isoladamente: eslint em src/routes/_authenticated/dashboard.tsx sai exit 0 e tsc não
reporta nada fora de vite.config.ts.
⎿ commit fc53ff4+dirty · 21 files changed, 233 insertions(+), 415 deletions(-)

## 2026-09-04 14:44 — [conclusão] painel lista apenas sessões active

Query do dashboard passou a filtrar `status = 'active'` no servidor (uma cláusula .eq),
com contador, estado vazio e hints reescritos para falar de sessões ativas. Sessões
idle/finished/unknown continuam no banco e acessíveis por URL direta — só saíram da lista.
Feature `dashboard` criada em docs/features/ e área registrada na TAXONOMY (R.4/R.13).
⎿ commit fc53ff4+dirty · 25 files changed, 277 insertions(+), 430 deletions(-)
