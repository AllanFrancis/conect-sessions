# Journal — SPEC-20260905-2251

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-05 23:31
**Onde tô:** bypass de TTL da segunda review corrigido; aguardando terceira review da task 1
**Próximo passo:** obter aprovação da task 1 e iniciar bootstrap/agente Windows da task 2
**Última decisão:** cliente autenticado não insere pareamento nem escolhe validade; a RPC define dez minutos internamente
**Bloqueio atual:** nenhum
**Se retomar, ler:** main.md, prd.md, techspec.md e esta SNAPSHOT

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | PRD e contrato | concluído | 2026-09-05 22:56 |
| 2 | TechSpec e pesquisa | concluído | 2026-09-05 23:03 |
| 3 | Tasks | concluído | 2026-09-05 23:05 |
| 4 | Implementação | em progresso (task 1/5) | 2026-09-05 23:05 |
| 5 | QA, review e fechamento | pendente | 2026-09-05 22:56 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
<!-- anti-alucinação por estrutura: separe o que é SABIDO (verificado no código/teste) do que é CHUTE (inferido) do que está EM ABERTO. Nunca trate inferência como fato. -->
- fato: o agente atual já autentica com token permanente armazenado apenas como SHA-256 em `agents.token_hash`.
- fato: o Claude Code suporta hooks empacotados em plugin e recarga via `/reload-plugins`.
- fato: o Supabase deixará de expor novas tabelas do Data API automaticamente; grants explícitos são necessários.
- fato: Bun 1.4 suporta executável Windows x64 baseline autossuficiente e opção de ocultar console.
- fato: `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run` inicia por usuário sem instalação em nível de máquina.
- inferência: binário sem assinatura poderá gerar alerta do SmartScreen; precisa comunicação explícita no onboarding.
- dúvida: nenhuma dúvida de arquitetura bloqueante.

### Respostas-chave do usuário

- “Faça isso então! da forma que planejou” — autorizou a implementação do plugin e onboarding de um comando.
- “confirmado” — confirmou dashboard, porte G, @allan, pipeline completo autônomo.
- “sim” — confirmou Windows 10/11 + Claude Code, múltiplas máquinas, diagnóstico/reparo/remoção; Kiro inalterado e macOS/Linux fora.
- “sim pode” — autorizou `.exe` autossuficiente compilado/publicado por GitHub Actions e sem assinatura comercial nesta SPEC.

### Tentativas que falharam

- Primeira criação da branch falhou porque `.git` exige permissão elevada; repetida com autorização e concluída.
- `specctl new` recebeu `@allan` sem aspas no PowerShell e gravou owner incorreto; `main.md` corrigido e fato preservado no LOG.

### Arquivos tocados

- docs/active/SPEC-20260905-2251-instalacao-simples/main.md
- docs/active/SPEC-20260905-2251-instalacao-simples/prd.md
- docs/active/SPEC-20260905-2251-instalacao-simples/techspec.md
- docs/active/SPEC-20260905-2251-instalacao-simples/tasks.md e 01_task.md..05_task.md
- docs/active/SPEC-20260905-2251-instalacao-simples/journal.md

### Onde parei

Task 1 com 22 testes verdes, typecheck e lint aprovados; terceira review pendente.

### Sessões (máx 5 linhas + 1 agregada)

## LOG (append-only — NUNCA editar entradas antigas)
<!-- tipos: ativação descoberta decisão tentativa blocker unblock refactor nota conclusão | entrada nova: specctl log -->

## 2026-09-05 22:51 — [ativação] SPEC criada e ativada (--features, branch codex/instalacao-simples, base main)

## 2026-09-05 22:52 — [decisão] Pipeline e enquadramento confirmados

⎿ commit 69881ca

## 2026-09-05 22:57 — [nota] PRD concluído e escopo confirmado

PRD gerado após esclarecimento obrigatório. O usuário confirmou literalmente “sim” para Windows 10/11 + Claude Code, instalação de um comando, múltiplas máquinas, diagnóstico/reparo/remoção, Kiro inalterado e macOS/Linux fora. RF-1..RF-12 cobrem jornada, pareamento, segredo, persistência, plugin, recarga, atomicidade, reparo, estado, remoção e compatibilidade. Pesquisa do changelog do Supabase encontrou a mudança de 2026 em que novas tabelas deixam de ser expostas automaticamente ao Data API; a migration deverá usar grants explícitos e RLS.
⎿ commit 69881ca

## 2026-09-05 23:02 — [decisão] Arquitetura da instalação definida

TechSpec concluída após pesquisa do código, Context7 e fontes oficiais. Decisão autorizada pelo usuário: “sim pode” para entregar executáveis autossuficientes compilados pelo GitHub Actions, sem assinatura comercial nesta SPEC. O desenho usa pareamento de dez minutos consumido por RPC transacional, token permanente protegido por DPAPI CurrentUser, inicialização por HKCU Run, executáveis Bun Windows x64 baseline, marketplace/plugin oficial do Claude Code e compatibilidade aditiva no `/sync`. Trade-offs: binário maior e possível SmartScreen; política empresarial pode bloquear plugin, mas o agente permanece operacional.
⎿ commit 69881ca

## 2026-09-05 23:04 — [nota] Tasks geradas e execução iniciada

Decomposição aprovada pelo modo autônomo: (1) pareamento seguro e revogação, (2) bootstrap/agente Windows, (3) plugin/release, (4) onboarding no painel, (5) integração/QA/review. A ordem põe contrato e segurança antes de distribuição e UI; cada task possui testes próprios e mapeia RFs do PRD.
⎿ commit 69881ca

## 2026-09-05 23:16 — [descoberta] Review da Task 1 solicita mudancas

Review da Task 1.0 encontrou: [CRITICAL] `createAgentPairing` ignora erros ao excluir pareamentos pendentes antes de inserir o novo, podendo retornar sucesso enquanto um código anterior continua válido; a invalidação deve falhar de forma explícita e idealmente ser atômica com a emissão. [MAJOR] a migration não revoga explicitamente privilégios de `anon`, então projetos com defaults legados podem conservar grants apesar da RLS. [MAJOR] o teste de corrida usa uma única conexão PGlite e comprova replay sequencial, não concorrência entre transações. [MAJOR] faltam testes dos handlers `/pair` e `/sync` para revogação, telemetria opcional e payload legado.
⎿ commit 69881ca+dirty · 6 files changed, 225 insertions(+), 23 deletions(-)

## 2026-09-05 23:23 — [refactor] Achados da primeira review da Task 1 corrigidos

A emissão substitui o código anterior e cria o novo dentro de `create_agent_pairing`, usando advisory lock por usuário/destino e índices únicos parciais como garantia estrutural contra dois pendentes. `anon` e `public` perdem privilégios explicitamente, `user_id` ganhou índice completo, e a suíte passou a verificar privilégios efetivos no PGlite. Os contratos HTTP usados pelos endpoints foram extraídos e testados diretamente: sucesso, expirado, consumido, revogado 403, telemetria opcional e payload legado. O antigo teste chamado de concorrência foi renomeado para o que de fato prova (replay sequencial); concorrência fica assegurada no banco por lock + unicidade e verificada pelo contrato da migration. Resultado: 21 testes, typecheck e lint aprovados; lint conserva seis warnings preexistentes de Fast Refresh nos componentes shadcn.

## 2026-09-05 23:27 — [descoberta] Segunda review encontra bypass do TTL de pareamento

Segunda review confirmou como resolvidos os achados anteriores (emissão atômica, REVOKE explícito, índices, teste renomeado e contratos HTTP cobertos), mas encontrou novo [CRITICAL]: `authenticated` conserva `INSERT` direto na tabela e `EXECUTE` na RPC `create_agent_pairing`, enquanto tabela/política/RPC só exigem `expires_at > created_at` ou data futura. Assim, um cliente autenticado pode criar pareamento válido por prazo arbitrário e contornar o TTL de dez minutos, violando RF-2 e o invariante de expiração curta. O banco deve impor o TTL máximo em todos os caminhos e testes negativos devem cobrir RPC e inserção direta, inclusive `created_at` manipulado. Gates da revisão: 21 testes, typecheck, lint e diff-check aprovados.
⎿ commit 69881ca+dirty · 6 files changed, 219 insertions(+), 104 deletions(-)

## 2026-09-05 23:29 — [refactor] TTL passa a ser inegociável no banco

A assinatura de `create_agent_pairing` não recebe mais expiração: a própria função define `now() + interval '10 minutes'`. A função virou `security definer` com validação de usuário e destino, enquanto `authenticated` perdeu `INSERT` direto na tabela e mantém apenas leitura/cancelamento sob RLS e execução da RPC. A tabela também limita `expires_at` a no máximo dez minutos após `created_at`. Testes negativos comprovam que inserção direta, inclusive com `created_at` futuro, é recusada; a RPC retorna exatamente 600 segundos. Resultado: 22 testes, typecheck e diff-check aprovados; lint permanece sem erros e com seis warnings preexistentes.

## 2026-09-05 23:31 — [conclusão] Task 1 aprovada na terceira review

Terceira revisão da Task 1.0 aprovada. O bypass de TTL foi fechado: `create_agent_pairing` não recebe prazo do cliente e deriva dez minutos no banco; `authenticated` perdeu `INSERT` direto; a função `SECURITY DEFINER` mantém `search_path` vazio, valida `auth.uid()` e ownership; a tabela limita `expires_at` a `created_at + 10 minutes`. Testes confirmam negação da inserção direta mesmo com `created_at` futuro e TTL exato de 600 segundos. Todos os achados anteriores permanecem resolvidos. Gates: 22 testes, typecheck, lint e diff-check aprovados; apenas seis warnings preexistentes fora do escopo.
⎿ commit 69881ca+dirty · 6 files changed, 216 insertions(+), 104 deletions(-)
