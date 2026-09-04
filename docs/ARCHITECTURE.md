# ARCHITECTURE.md — mapa transversal região→feature

> Orçamento-alvo: ≤4.800 bytes. Nível 0.5 de leitura: responde "este trecho do código pertence a qual feature?".
> Cobre TODO o código, inclusive o que ainda não tem feature (marque `(sem feature)`).
> Atualize quando uma SPEC mover fronteiras. Detalhe fino vive em `docs/features/<area>.md`.

## Mapa região → feature

| Região (path) | Feature (TAXONOMY) | Nota (1 linha) |
|---|---|---|
| `public/agent/remote-agent.mjs` | dashboard | Agente local, Node puro, ARQUIVO ÚNICO servido por `?raw` — não dividir; config só por env `LRC_*` |
| `src/routes/api/public/agent/` | dashboard | API pública do agente: CORS `*`, autenticada pelo token no body |
| `src/routes/_authenticated/` | dashboard | Painel sob RLS, polling react-query (3s/2s) |
| `src/components/terminal.tsx` | dashboard | Primitivas visuais do painel — toda UI nova compõe daqui |
| `src/components/ui/` | (sem feature) | shadcn/ui (new-york) gerado — não editar à mão |
| `src/integrations/supabase/types.ts` | (sem feature) | GERADO por `supabase gen types` — não editar à mão |
| `src/routeTree.gen.ts` | (sem feature) | GERADO pelo TanStack Router — não editar à mão |
| `supabase/migrations/` | (sem feature) | DDL versionado |
| `vite.config.ts` | (sem feature) | Ordem de plugins é contrato — ver abaixo |
| `scripts/specctl.mjs` | (sem feature) | CLI do sistema SPEC — ferramenta, não produto |

## Fluxos transversais

- **Sincronização de sessão:** agente local lê transcrição (`~/.claude/projects/*.jsonl`,
  `~/.kiro/sessions/*/messages.jsonl`) → `POST /api/public/agent/sync` → Supabase → painel por
  polling. O POST devolve as `replies` pendentes no MESMO round-trip: **este round-trip É o
  protocolo**, não há websocket nem Realtime.
- **Resposta remota:** painel insere em `replies` → o agente recebe no próximo sync e entrega por
  `LRC_REPLY_FILE` / `LRC_REPLY_CMD`. O agente NÃO digita no CLI: a UI promete envio, nunca resposta.

## Regras duras por região

Cada uma vale ao tocar a região correspondente. Violar quebra o app ou a segurança, não o estilo.

- **`vite.config.ts`** — a lista de plugins é montada explicitamente, nesta ordem: devtools (só
  `mode=development`) → tailwind → tsConfigPaths → tanstackStart → nitro (só `command=build`) →
  viteReact. Ordem e unicidade importam: plugin duplicado ou fora de ordem quebra o app.
- **Handlers de rota** — `supabaseAdmin` (service role) só por `await import(...)` DENTRO do
  handler; no topo do módulo apenas em outros `*.server.ts`. Vazar a service role para o bundle do
  cliente é falha de segurança, não de organização.
- **`createServerFn` novo** — sempre `.middleware([requireSupabaseAuth])`, escrevendo por
  `context.supabase` / `context.userId`. Sem isso a função roda sem dono e a RLS não protege nada.
- **Tabela nova** — RLS `auth.uid() = user_id` mais `user_id` denormalizado na própria tabela;
  migration em `supabase/migrations/`.
- **UI nova** — compor as primitivas de `src/components/terminal.tsx`; cores só em oklch dentro de
  `src/styles.css` (`:root` + `.dark` + `@theme inline`); títulos por `sessionTitle()` /
  `projectName()`.
- **Transcrição de agente** — cada IDE tem envelope próprio (o Claude Code põe `role`/`content` na
  raiz ou em `message`; o Kiro envelopa tudo em `payload`). Formato novo exige adaptador em
  `normalize()`, nunca assumir o do Claude Code. Ver `docs/features/dashboard.md`.
