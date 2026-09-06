# Template de Especificação Técnica

## Resumo Executivo

A solução evolui `agents` e adiciona `agent_pairing_codes`. O navegador autenticado cria um código aleatório de dez minutos e recebe apenas esse segredo temporário. O bootstrap PowerShell troca o código por um token permanente em uma operação transacional, protege o token com DPAPI no perfil do usuário, baixa executáveis autossuficientes publicados pelo GitHub Actions e registra um launcher em `HKCU\...\Run`. Não há privilégio administrativo nem Node.js na máquina de destino.

O hook existente será compilado como segundo executável e invocado por um plugin Claude Code versionado no próprio repositório. O instalador usa a CLI oficial para adicionar o marketplace e instalar o plugin em escopo de usuário; sessões abertas recebem a orientação `/reload-plugins`. Agentes antigos continuam aceitos porque os novos campos do payload são opcionais.

## Arquitetura do Sistema

### Visão Geral dos Componentes

- `agents.functions.ts`: cria/cancela pareamentos, cria pareamento de reparo e revoga agentes sob autenticação existente.
- `agent_pairing_codes`: guarda somente hash, dono, destino opcional, expiração, consumo e agente resultante.
- `consume_agent_pairing`: função Postgres transacional que bloqueia o código, valida estado e cria ou gira a credencial do agente uma única vez.
- `/api/public/agent/pair`: valida o código, gera token permanente, chama a função atômica e o devolve apenas ao instalador.
- `/api/public/agent/install.ps1`: serve bootstrap legível com a URL de origem derivada da requisição.
- `install-agent.ps1`/`launcher.ps1`: instala/repara em `%LOCALAPPDATA%\Conect Sessions`, aplica DPAPI, registra `HKCU Run`, instala plugin e executa diagnóstico.
- `remote-agent.mjs`: aceita `agent.version/platform/plugin_status` no sync sem alterar descoberta de Claude/Kiro.
- `.claude-plugin/marketplace.json` e `plugins/conect-sessions`: distribuem wrapper e hooks `SessionStart`, `Stop`, `SessionEnd` e `PreToolUse`.
- `.github/workflows/agent-release.yml`: compila `remote-agent.mjs` e `claude-hook.mjs` para Windows x64 baseline, calcula SHA-256 e publica assets em tag `agent-v*`.
- `agents.tsx`: substitui tokens crus pela jornada, polling de estado, reparo, revogação e instruções de remoção.

## Design de Implementação

### Interfaces Principais

```ts
type PairingResult = {
  pairingId: string;
  code: string;
  expiresAt: string;
  installCommand: string;
};

type PairExchange = {
  token: string;
  agentId: string;
  apiUrl: string;
  release: { version: string; agentUrl: string; hookUrl: string };
};
```

`createAgentPairing({name, targetAgentId?})` usa `requireSupabaseAuth`, gera 32 bytes aleatórios e persiste SHA-256. Reparos validam que o agente de destino pertence ao mesmo `user_id`. O endpoint público nunca aceita `user_id` do cliente.

### Modelos de Dados

`agent_pairing_codes(id uuid PK, user_id uuid, agent_name text, code_hash text unique, target_agent_id uuid null, expires_at timestamptz, consumed_at timestamptz null, agent_id uuid null, created_at timestamptz)`. Índice parcial em `(user_id, created_at desc) where consumed_at is null`. RLS permite ao autenticado selecionar/inserir/invalidar somente linhas próprias; `anon` não recebe grants.

`agents` ganha `revoked_at`, `installed_at`, `agent_version`, `platform`, `plugin_status`, `install_error` e `updated_at`, todos compatíveis com linhas antigas. `sync` rejeita `revoked_at is not null` e atualiza telemetria opcional. Revogar preserva sessões históricas.

A função pública `consume_agent_pairing(p_code_hash, p_token_hash, p_token_prefix, p_version, p_platform)` é `security invoker`, executável apenas por `service_role`. `SELECT ... FOR UPDATE` serializa concorrência; expiração/consumo gera exceção e rollback.

### Endpoints de API

- `POST /api/public/agent/pair`: `{code, version, platform}` → `PairExchange`; respostas genéricas 400/409/410 evitam revelar dono.
- `GET /api/public/agent/install.ps1`: bootstrap PowerShell, `no-store`, CORS público; nenhuma credencial embutida.
- `POST /api/public/agent/sync`: payload atual + `agent?`; mantém compatibilidade retroativa.
- Marketplace: GitHub `AllanFrancis/conect-sessions`, plugin `conect-sessions@conect-sessions`, escopo `user`.

## Pontos de Integração

Claude Code exige versão com plugin marketplace e `/reload-plugins`; hooks usam `${CLAUDE_PLUGIN_ROOT}` para chamar o wrapper, que localiza o executável instalado. Ausência da CLI ou política empresarial restritiva não aborta o agente: marca `plugin_status=attention` e mostra correção. O GitHub Release fornece os dois binários; cada download é verificado por SHA-256 antes de substituir a versão local.

## Abordagem de Testes

### Testes Unidade

- Geração/hash/expiração e erros indistinguíveis do pareamento.
- Bootstrap sem token permanente, DPAPI, caminhos com espaço, `HKCU Run` e idempotência.
- Manifesto/hook do plugin, `${CLAUDE_PLUGIN_ROOT}` e saída fail-open.
- Derivação dos quatro estados visuais e nomes acessíveis.

### Testes de Integração

- Migration/RPC: consumo único, corrida, expiração, reparo sem novo agente, RLS entre dois usuários e revogação bloqueando sync.
- Executáveis compilados respondem a `--probe`; agente antigo continua aceito pelo endpoint.

### Testes de E2E

Playwright cobre criar pareamento, copiar comando, polling até conectado, erro/expiração, reparo e confirmação de revogação em viewport móvel e desktop. Passe real no Windows valida login automático e round-trip Claude Code.

## Sequenciamento de Desenvolvimento

### Ordem de Construção

1. Migration, tipos e contrato transacional.
2. Funções/endpoints e testes de segurança.
3. Empacotamento dos executáveis, bootstrap e plugin.
4. Jornada visual e estados.
5. Testes integrados, instalação real, QA e review.

### Dependências Técnicas

Supabase remoto/local para provar RPC; Claude Code compatível com plugins; GitHub Actions/Release para assets; Windows 10/11 x64 para o passe real.

## Monitoramento e Observabilidade

O painel usa `last_seen_at`, versões, `plugin_status` e `install_error`; não se adiciona stack. O instalador escreve `%LOCALAPPDATA%\Conect Sessions\install.log` sem código/token, e o agente mantém stderr/stdout em logs rotativos simples. API registra apenas `pairing_id`, resultado e duração, nunca códigos ou tokens.

## Considerações Técnicas

### Decisões Principais

- Executável Bun x64 baseline elimina Node e amplia compatibilidade de CPU; trade-off é asset maior e sem assinatura nesta SPEC.
- DPAPI CurrentUser + launcher preserva segredo fora de disco em claro; trade-off é instalação vinculada ao usuário Windows.
- `HKCU Run` evita administrador e senha de tarefa agendada; pode iniciar com pequeno atraso definido pelo Windows.
- Marketplace GitHub mantém plugin auditável e atualizável; a primeira versão depende de repositório/release públicos.
- RPC transacional vence duas chamadas sequenciais porque garante uso único sob concorrência.

### Riscos Conhecidos

SmartScreen pode alertar para binário não assinado; a UI explica editor/origem e SHA-256. `HKCU Run` depende de login do usuário, coerente com sessões interativas. Política empresarial pode bloquear plugins não gerenciados; o agente continua monitorando e o painel não promete resposta no Claude. Uma tag/release precisa existir antes de testar o comando de produção.

### Conformidade com Skills Padrões

- `supabase` e `supabase-postgres-best-practices`: grants explícitos, RLS, função sem acesso público e teste de concorrência.
- `context7-mcp`: assinaturas atuais de TanStack Start, Supabase e Bun confirmadas antes do código.
- `frontend-design`, `ui-ux-pro-max` e `ui-styling`: jornada responsiva, acessível e coerente com os componentes existentes.

### Arquivos relevantes e dependentes

`src/lib/agents.functions.ts`, `src/routes/_authenticated/agents.tsx`, `src/routes/api/public/agent/*`, `public/agent/*`, `src/integrations/supabase/types.ts`, `supabase/migrations/*`, `.claude-plugin/marketplace.json`, `plugins/conect-sessions/*`, `.github/workflows/agent-release.yml`, `package.json`.
