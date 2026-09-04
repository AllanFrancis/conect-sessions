# CLAUDE.md — Remote Session Monitor

> Regra dura de posicionamento: este bloco imperativo fica SEMPRE no TOPO, antes de qualquer outra seção. `specctl entrypoints` garante isso em regeneração/merge.

## HARD BANS (TIER-0) — valem em TODA resposta

1. **R.6.2** — só o USUÁRIO aceita entrega incompleta, defere ou adia (qualquer "deixar pra depois", em QUALQUER momento) — NUNCA a IA por conta própria. PERGUNTE item a item (implementar agora / SPEC nova / aceitar gap), com citação do usuário.
2. **LOG append-only** — NUNCA editar entradas antigas do `## LOG` do journal.md; correção = nova entrada.
3. **`docs/active/` VAZIO em `main`** — SPEC ativa vive só em branch (CI bloqueia).
4. **Temporários na pasta da SPEC** — `tmp/` (descartável) ou `evidence/` (persistente); sem SPEC → `.scratch/`. Nunca na raiz.
5. **PROIBIDO varrer `scripts/specctl.mjs` ou re-ler `docs/rules/*` só para "garantir compliance"** — os gates dizem o que falta (`close <id> --dry`). Ler a rule DA TAREFA no momento do uso é o caminho certo, não viola este ban.

**R.9 — 1ª linha de TODA resposta = classificação:** `[continuidade: SPEC-x]` (trabalho de SPEC existente) | `[nova]` (demanda que muda comportamento/código do produto → exige SPEC) | `[livre]` (pergunta, análise, leitura, config de ferramenta, bump de harness — nada que altere o produto; sem SPEC). Ambíguo? PERGUNTE. `/spec` abre os fluxos guiados.

## Estrutura docs/

- `docs/RULES.md` — núcleo do processo (R.1–R.17); detalhe situacional em `docs/rules/*`
- `docs/features/<area>.md` — memória viva por área · `docs/INDEX.md` — mapa (GERADO)
- `docs/active|future|archive|discard/SPEC-<ts>-<slug>/` — main.md (contrato) + journal.md (SNAPSHOT + LOG)
- `docs/claims/` — trabalho em voo visível em main · `docs/programs/` — DAGs de SPECs · `docs/PROGRAMS.md` (GERADO) + `docs/ROADMAP.md` — o que pegar a seguir (`specctl next`) · `docs/DEFERRED.md` (GERADO) — deferidos R.6.2
- `docs/TAXONOMY.md` — áreas canônicas · `docs/ARCHITECTURE.md` — mapa região→feature
- `docs/CONSTITUTION.md` — princípios · manifesto: `docs/.spec-system.json`

## Comandos

- typecheck: `bunx tsc --noEmit`
- lint: `bun run lint`
- dev: `bun run dev`

Labels `test/typecheck/lint/dev/e2e` espelhados em `docs/.spec-system.json` — hooks, CI e `verify:` consomem de lá; não hardcode.

## Skills e quando disparar

| Situação | Skill |
|---|---|
| Implementar contra lib/framework/API externa cuja API atual você não domina | **Context7 MCP** — confirme assinatura/versão antes de codar (se indisponível: vendor docs / WebSearch) |
| UI / frontend / estilização | frontend-design (se instalada) |
| Porte G — fase PRD (se pipeline instalado) | cria-prd |
| Fases seguintes (se instalado) | cria-techspec → criar-tasks → executar-task → executar-qa/review/bugfix |

## Mapa de referências — ler SÓ no momento do uso

`docs/rules/`: formats (criar/editar artefato) · lifecycle (transições de ciclo de vida) · programs (DAG de SPECs) · interop (workspace externo / pipeline prd) · context (compactação/orçamentos) · retrieval (archive N3) · verification (`verify:` e gates) · team (claims/multi-dev/onboarding) · ci (gates de CI).

<!-- projeto:início -->
## Projeto — Remote Session Monitor

Monitorar e responder sessões de IA (Claude Code, Kiro) rodando nas suas máquinas, pelo celular ou navegador. UI em pt-BR.

**Stack:** TanStack Start 1.x + React 19 + TS + Vite 8 + Tailwind v4 + shadcn/ui (new-york) + Supabase + Nitro/Cloudflare · bun (`bun install`, `bun run dev|build|lint|format`, `bunx tsc --noEmit`). Sem test runner. `bunfig.toml` tem `minimumReleaseAge=86400` — excluir pacote exige confirmar com o usuário.

**Três camadas:** agente local `public/agent/remote-agent.mjs` (Node puro, arquivo único servido por `?raw` — não dividir; tail de logs + session monitor, config só por env `LRC_*`) → API pública `src/routes/api/public/agent/sync.ts` (CORS `*`, autenticada pelo token do agente no body, devolve `replies` pendentes no mesmo round-trip — este round-trip É o protocolo; não há websocket) → dashboard `_authenticated/*` lendo Supabase no browser sob RLS, com polling react-query (3s/2s), **não** Realtime.

**Session monitoring:** vida de sessão se PROVA (PID + start-time do processo, handle do log do Kiro), nunca por existência de arquivo — registro órfão de kill abrupto é real. Status `active|idle|finished|unknown`; o que não for provável fica `unknown` até o banco e a UI. Confira com `node remote-agent.mjs --probe`. Detalhe e evidências: `docs/session-monitoring.md`.

**Regras duras — sempre:**
- tsconfig estrito: env por bracket notation (`process.env['X']`). Nunca importar `server-only` — use `*.server.ts`.
- `src/routeTree.gen.ts` e `src/integrations/supabase/types.ts` são GERADOS — não editar à mão; o resto de `src/integrations/` é código do projeto.

**Regras duras POR REGIÃO** (ordem de plugins do `vite.config.ts`, `supabaseAdmin` só dentro do handler, `createServerFn` com `requireSupabaseAuth`, RLS de tabela nova, UI pelas primitivas do terminal, adaptador de transcrição por IDE): `docs/ARCHITECTURE.md` — ler ao tocar a região.

Notas longas preservadas em `CLAUDE.md.pre-spec.bak` (destino: `docs/features/*` no bootstrap brownfield).
<!-- projeto:fim -->

---
GERADO por `specctl entrypoints` — edite apenas o bloco projeto (entre marcadores).
