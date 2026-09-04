# Feature: dashboard

**Keywords:** painel, sessões, polling, react-query, status, resposta remota
**Arquivos principais:**
  - src/routes/_authenticated/dashboard.tsx
  - src/routes/_authenticated/sessions.$sessionId.tsx
  - src/components/terminal.tsx
  - src/lib/session-display.ts
**Resumo:** Painel autenticado que lista as sessões de IA das máquinas do usuário e abre a conversa de cada uma, com resposta remota.

## Specs desta feature
### Concluídas
- SPEC-20260904-1433 | 2026-09-04 | `fc53ff4` | Painel lista apenas sessões ativas
### Planejadas (future/)

## Estado atual

Duas rotas sob `_authenticated`, ambas lendo o Supabase direto do browser sob RLS
(`supabase` publishable) e mantendo frescor por `refetchInterval` do react-query — não há
Realtime nem websocket.

- **Lista** (`dashboard.tsx`, polling 3s): consulta `sessions` ordenada por `last_activity_at desc`,
  mostrando status, ícone da origem, título, IDE, pid e confiança da detecção. Título e nome de
  projeto passam por `sessionTitle()`/`projectName()`, que caem para a primeira mensagem do usuário
  e para o último segmento do `cwd` quando o título é uuid/hash. As primeiras mensagens vêm de uma
  segunda query em `messages` (`role = 'user'`, limite 500) usada só para esse fallback.
- **Sessão** (`sessions.$sessionId.tsx`, polling 2s): três queries em paralelo (`sessions`,
  `messages`, `replies`), transcrição com markdown nas mensagens do assistente, auto-scroll para o
  fim e textarea que envia com Enter. Respostas ainda `pending` aparecem otimistas na transcrição —
  a entrega real só acontece quando o agente local faz o próximo sync.

A UI é composta pelas primitivas de `terminal.tsx` (`TermScreen`, `TermBox`, `TermButton`,
`TermHints`, `StatusDot`, `SourceIcon`); a estética de terminal não é re-estilizada em cada rota.

## Decisões arquiteturais ativas

- DEC-20260904-1443-lista-somente-ativas [ativa] (SPEC-20260904-1433) — a lista filtra
  `status = 'active'` no servidor, não no cliente: as sessões idle/finished/unknown nem trafegam.
  Trade-off aceito: elas deixam de ser alcançáveis pelo painel e só abrem por URL direta.

## Alternativas consideradas e rejeitadas

- SPEC-20260904-1433 | filtrar no cliente e manter todas as linhas no cache — rejeitada em
  2026-09-04 14:43. Traria linhas que seriam descartadas na renderização, a cada 3 segundos.

## Gotchas

- SPEC-20260904-1433 | sessão recém-aberta aparece como `idle`, não `active` (o processo está vivo
  mas a transcrição ainda não se moveu) — com o filtro de ativas, ela só surge no painel depois do
  primeiro turno. Não é bug do painel: a derivação de status vive no agente local.
