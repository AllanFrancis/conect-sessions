# SPEC-20260904-1433: dashboard somente ativas

**Status:** active
**Porte:** P
**Owner:** @AllanFrancis
**Criada:** 2026-09-04 14:33
**Ativada:** 2026-09-04 14:33
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** dashboard, somente, ativas
**Features:** —
**Branch:** feat/dashboard-somente-ativas
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-04 14:33
**Resumo:** O painel passa a listar somente sessões com status `active`, escondendo idle/finished/unknown.

## Objetivo

O painel hoje lista toda sessão já vista pelo agente, e o histórico (finished/unknown) domina a tela. O usuário quer olhar o painel e ver só o que está rodando agora. Entrega: a lista do dashboard filtra por `status = 'active'`.

## Escopo

**DENTRO:**
- Filtro por `status = 'active'` na query do dashboard.
- Contador do cabeçalho e estado vazio coerentes com o filtro.

**FORA:**
- Página de sessão individual (segue acessível por URL/link direto, sem filtro).
- Qualquer alteração no agente local, na API de sync ou na derivação de status.
- Toggle/filtro configurável na UI — não pedido.

## Invariantes

- NUNCA alterar como o status é derivado: o filtro é de apresentação, o dado permanece intacto no banco.

## Implementação

Uma cláusula `.eq("status", "active")` na query react-query de [dashboard.tsx](src/routes/_authenticated/dashboard.tsx) — filtro no servidor (Postgres/RLS), não no cliente, para não trafegar linhas que serão descartadas. Textos do cabeçalho e do estado vazio ajustados para dizer "ativa(s)".

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| — | nenhuma mudança de schema |

## Riscos

- Sessões idle/finished ficam invisíveis no painel (só por URL direta) — mitigação: escopo explícito do pedido; reverter é remover uma cláusula.

## Sinais de sucesso

- O painel mostra só sessões rodando agora; nada de histórico a rolar.

## Critério de aceite

- [ ] A query do dashboard filtra `status = 'active'` no servidor e a lista não exibe sessão de outro status
- [ ] Contador do cabeçalho e estado vazio falam de sessões ativas, coerentes com o filtro
- [ ] `bun run lint` e `bunx tsc --noEmit` sem erros
