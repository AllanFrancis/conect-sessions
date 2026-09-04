# Remote Session Monitor

Monitore e responda as sessões de IA (Claude Code, Kiro) que rodam nas suas máquinas,
pelo celular ou pelo navegador.

Três camadas:

1. **Agente local** — [public/agent/remote-agent.mjs](public/agent/remote-agent.mjs), Node puro,
   arquivo único. Faz tail dos logs e prova a vida de cada sessão (PID + start-time do processo).
2. **API pública** — [src/routes/api/public/agent/sync.ts](src/routes/api/public/agent/sync.ts).
   O agente envia o que há de novo e recebe as respostas pendentes no mesmo round-trip.
3. **Dashboard** — rotas `_authenticated/*`, lendo o Supabase no browser sob RLS com polling.

## Desenvolvimento

Requer [bun](https://bun.sh) e Node.js.

```sh
git clone <url-deste-repositorio>
cd conect-sessions
bun install
cp .env.example .env   # preencha com as chaves do seu projeto Supabase
bun run dev
```

Outros comandos: `bun run build`, `bun run lint`, `bun run format`, `bunx tsc --noEmit`.

### Login com Google (opcional)

A tela `/auth` chama `supabase.auth.signInWithOAuth({ provider: "google" })`. Para o botão
funcionar, habilite o provider no seu projeto Supabase:

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um
   **OAuth client ID** do tipo _Web application_ e registre como _Authorized redirect URI_:
   `https://<ref>.supabase.co/auth/v1/callback`
2. No dashboard do Supabase, em **Authentication → Sign In / Providers → Google**: ative o
   provider e cole o _Client ID_ e o _Client Secret_ do passo anterior.
3. Em **Authentication → URL Configuration**, coloque a URL de produção em _Site URL_ e
   adicione em _Redirect URLs_ os destinos que o app usa:
   `http://localhost:8080/dashboard` e `<sua-url-de-producao>/dashboard`.

Sem o passo 3 o Google devolve o usuário para a Site URL em vez de `/dashboard`.

> `supabase config push` existe, mas o `supabase/config.toml` deste repo declara só o
> `project_id` — um push sobrescreveria a config de auth remota com os defaults do CLI.
> Configure o provider pelo dashboard.

## Stack

TanStack Start 1.x · React 19 · TypeScript · Vite 8 · Tailwind v4 · shadcn/ui (new-york) ·
Supabase · Nitro (preset `cloudflare-module`).

## Documentação

- [CLAUDE.md](CLAUDE.md) — convenções e regras duras do projeto
- [docs/session-monitoring.md](docs/session-monitoring.md) — como a vida de sessão é provada
- [docs/RULES.md](docs/RULES.md) — processo SPEC-driven
