# Journal — SPEC-20260905-2251

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-06 11:29
**Onde tô:** fechando — critério 5 transferido para SPEC-20260906-1122, R.7 registrado, gate pronto: SIM
**Próximo passo:** merge na main e, depois, executar SPEC-20260906-1122 para viabilizar o passe real
**Última decisão:** "Transferir para a SPEC-20260906-1122 (Recomendado)" — critério 5 sai daqui
**Bloqueio atual:** nenhum para fechar; o passe real em Windows vive agora na SPEC-20260906-1122
**Se retomar, ler:** main.md, prd.md, techspec.md, 05_task.md, 04_task_review.md e esta SNAPSHOT

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | PRD e contrato | concluído | 2026-09-05 22:56 |
| 2 | TechSpec e pesquisa | concluído | 2026-09-05 23:03 |
| 3 | Tasks | concluído | 2026-09-05 23:05 |
| 4 | Implementação | concluído (tasks 1–4 aprovadas em review) | 2026-09-06 10:20 |
| 5 | QA, review e fechamento | em progresso (task 5 é a próxima) | 2026-09-06 10:20 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
<!-- anti-alucinação por estrutura: separe o que é SABIDO (verificado no código/teste) do que é CHUTE (inferido) do que está EM ABERTO. Nunca trate inferência como fato. -->
- fato: `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run` inicia por usuário sem instalação em nível de máquina.
- fato: o binário responde `--version` (0.1.0) e `--probe --json`, contrato do diagnóstico do instalador.
- fato: `renderToStaticMarkup` testa componente real sem runner de DOM, mas não abre diálogo do Radix nem aplica CSS — geometria só no navegador (foi assim que o nome truncado escapou).
- fato: `/api/public/agent/pair` só aceita `windows-x64`; sem `createAgent`, máquina nova fora do Windows não tem caminho. Inferência: binário sem assinatura deve alertar o SmartScreen.
- dúvida: nenhuma dúvida de arquitetura bloqueante.

### Respostas-chave do usuário

- “Faça isso então! da forma que planejou” — autorizou plugin e onboarding de um comando.
- “sim” — Windows 10/11 + Claude Code, múltiplas máquinas, diagnóstico/reparo/remoção; Kiro inalterado, macOS/Linux fora.
- “sim pode” — `.exe` autossuficiente publicado por GitHub Actions, sem assinatura comercial nesta SPEC.
- “Passe no navegador na task 5 (QA)” — E2E de navegador da task 4 transferido para a subtarefa 5.1.
- “Remover agora (Recomendado)” — `createAgent` removido, aceitando que máquina nova fora do Windows fica sem caminho.

### Tentativas que falharam

- Nada em aberto; as falhas das tasks 1–4 estão resolvidas e registradas no LOG.

### Arquivos tocados

- docs/active/SPEC-20260905-2251-instalacao-simples/: main.md, prd.md, techspec.md, tasks.md, 01..05_task.md, 01..04_task_review.md, journal.md
- public/agent/: install-agent.ps1, launcher.ps1, uninstall-agent.ps1, agent-process.ps1, remote-agent.mjs
- src/lib/: agent-installer, agent-onboarding, agent-pairing*, agents.functions · src/routes/api/public/agent/* · supabase/migrations/*
- src/components/agent-onboarding.tsx, src/components/ui/progress.tsx, src/routes/_authenticated/agents.tsx
- tests/installer/*, tests/onboarding/* (agent-onboarding, onboarding-ui, pairing-lifecycle, version-contract, credential-surface), tests/support/pairing-db.ts
- scripts/build-agent.mjs, package.json

### Onde parei

Tasks 1–4 aprovadas e commitadas. Task 5 em curso: a migration de pareamento foi aplicada no remoto
(estava faltando, e por isso todo `/sync` respondia 401 em produção) e o passe de navegador rodou em
390px e 1280px, com evidência em `evidence/task5-*.png`. Dois defeitos de layout achados e corrigidos.
Pendente: passe real em Windows (critério 5, evidência do usuário) e registrar em features/dashboard.md.

### Sessões (máx 5 linhas + 1 agregada)

- 2026-09-06 08:28→11:10: task 4 (2 reviews) + migration em produção + passe de navegador. 4 commits.

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

## 2026-09-05 23:38 — [nota] Task 2 pronta para review

O agente passou a enviar versão/plataforma/estado do plugin e ganhou `--version`; o bootstrap público troca o código, baixa manifesto e executável, valida SHA-256 antes de substituir, protege o token com DPAPI CurrentUser, escreve launcher com logs rotativos e registra um único valor em HKCU Run. Reexecução para reparo foi testada em pasta isolada, sem token/código em config, launcher ou log; hash incorreto preserva o binário conhecido. O endpoint `/api/public/agent/install.ps1` injeta a origem da requisição. Executável Bun `windows-x64-baseline` compilado e executado com `--version` e `--probe --json`. Gates: 27 testes, typecheck, lint, build web e diff-check aprovados; teste DPAPI exige perfil Windows real e passou fora do sandbox.

## 2026-09-06 00:32 — [refactor] Achados da review da Task 2 corrigidos

Ordem do bootstrap invertida: manifesto, download em staging, SHA-256 e `--version` do candidato acontecem ANTES da troca do código de pareamento. Causa-raiz do achado crítico: consumir o código gira a credencial no servidor, então qualquer falha posterior de rede ou integridade deixava a máquina com token já invalidado — reparo destruindo instalação saudável. Depois da troca, a credencial protegida é gravada de imediato e só então o agente antigo é parado e os arquivos trocados.

Identidade de processo virou biblioteca única (`public/agent/agent-process.ps1`), consumida pelo instalador, pelo launcher e pelo desinstalador. PID cru nunca mais é alvo de Stop-Process: o par (caminho do executável, horário de criação) decide, e o que não confere é registro stale. `agent.pid` passou de número para JSON com pid/path/start, com aceitação do formato antigo por igualdade de caminho. O launcher ganhou mutex local por instalação, porque a checagem de processo vivo sozinha não impede dois arranques simultâneos. O instalador encerra com varredura por caminho, para o caso de registro perdido com agente ainda segurando o .exe.

Diagnóstico deixou de ser presumido: `--version` valida o artefato antes do swap, o instalador espera o processo aparecer com identidade conferida e `--probe --json` precisa devolver JSON válido; qualquer etapa falha com mensagem acionável. Launcher e desinstalador passaram a ser arquivos versionados embutidos em base64 pelo endpoint, então o que é instalado é byte a byte a fonte do repositório — fim das duas implementações do desinstalador. `build:agent:windows` virou `scripts/build-agent.mjs` com destino configurável (AGENT_OUTFILE/--outfile, padrão dist/agent), desacoplado da pasta da SPEC.

gotcha (dashboard): PowerShell 5.1 lê `.ps1` sem BOM usando a página de código ANSI, e todo acento das mensagens chega quebrado ao usuário. Os quatro scripts passaram a ter BOM e o renderizador o repõe, porque o carregador `?raw` do bun o remove na importação. TextDecoder também remove BOM por padrão: usar `ignoreBOM: true` quando o BOM é conteúdo.

gotcha (dashboard): processo iniciado por `Start-Process` herda os handles do pai, então um neto vivo mantém o pipe do Bun aberto e `new Response(child.stdout).text()` nunca chega a EOF. Nos testes o PowerShell roda com stdout ignorado e todos os fluxos redirecionados para arquivo (UTF-16LE), com try/catch no wrapper para capturar a mensagem do erro terminante, que o host escreve fora do escopo do redirecionamento.

Cobertura: agente falso agora é executável real compilado por `Add-Type -OutputAssembly`, chave Run isolada por `-RunKeyPath` e testes exercitando launcher duas vezes, PID reciclado por processo alheio, reparo com agente em execução, remoção idempotente, bootstrap servido sozinho e headers/renderização do endpoint. Gates: 40 testes de installer, typecheck, lint, build web, build do agente e `git diff --check` aprovados; binário compilado responde `--version` e `--probe --json`. Falta a validação manual em Windows real (critério com evidência do usuário) e a re-review da task 2.
⎿ commit 4fb7ac9+dirty · 4 files changed, 54 insertions(+), 9 deletions(-)

## 2026-09-06 00:49 — [conclusão] E2E do comando único com o binário compilado

Fechado o único item que a review deixou fora do alcance automático: `tests/installer/windows-e2e.test.ts` roda o produto, não o instalador. Compila o agente com `scripts/build-agent.mjs`, serve o bootstrap renderizado pelo endpoint, instala com um comando em raiz, chave Run e USERPROFILE isolados, e prova o caminho completo da credencial — protegida pelo instalador, descriptografada pelo launcher, usada pelo agente no `/sync` com a telemetria de versão vinda do manifesto. Uma sessão de Claude Code semeada como o hook a deixaria recebe do servidor uma resposta endereçada por `external_id`, e o teste confirma a entrega em `state/inbox/claude-<id>.jsonl`. O valor gravado em Run é executado literalmente para simular o logon, e a remoção não deixa processo, pasta nem valor.

gotcha (dashboard): aninhar `powershell.exe` dentro de outro PowerShell trava quando o neto sobrevive — a chamada de comando nativo espera EOF dos fluxos do filho, e o agente herda esses handles. O logon real não tem shell intermediário: o teste cria o processo direto da linha de comando gravada em Run, que também é a simulação fiel.

gotcha (dashboard): com USERPROFILE apontado para perfil descartável, o agente não enxerga as sessões reais da máquina (os testes ficam rápidos e determinísticos) e o DPAPI continua funcionando, porque a chave-mestra é carregada por APPDATA, que fica intacto.

Gates: 41 testes de installer (8 arquivos), typecheck, lint e build do agente aprovados; E2E completo em ~6s. Segue manual no critério de aceite 5: download do release real do GitHub e round-trip dentro do Claude Code, que depende do plugin da task 3.
⎿ commit 4fb7ac9+dirty · 5 files changed, 86 insertions(+), 22 deletions(-)

## 2026-09-06 08:36 — [conclusão] Task 2 aprovada na re-review

A re-review integral da Task 2.0 confirmou a resolução dos sete achados anteriores: validação do artefato antes do pareamento; identidade de processo por caminho e horário de início; diagnóstico pós-instalação; cobertura comportamental de processo, HKCU Run e remoção; endpoint renderizado e headers; build com destino configurável; e fonte única para launcher, desinstalador e biblioteca de processo.

Gates: 41 testes de installer em 8 arquivos aprovados no perfil real do Windows, incluindo E2E com binário compilado, DPAPI, sync, resposta endereçada, execução literal do valor de Run e remoção sem rastro. Typecheck, lint, build web, build do agente Windows x64 baseline e git diff --check passaram. O sandbox isolado não carrega o perfil DPAPI CurrentUser e, por isso, falhou em 8 testes dependentes de DPAPI; a repetição no contexto real passou. Veredito: APROVADO, sem achados críticos, major ou minor.
⎿ commit 4fb7ac9+dirty · 5 files changed, 97 insertions(+), 22 deletions(-)

## 2026-09-06 08:52 — [descoberta] Review da Task 3 solicita mudanças

A review da Task 3.0 encontrou um bloqueante funcional: o launcher inicia o agente com `LRC_STATE_DIR=<InstallRoot>/state`, mas o wrapper do plugin não define essa variável para `conect-hook.exe`; o hook cai no fallback `~/.lrc`. Em produção, agente e hook leem/escrevem sessions e inbox em árvores diferentes, impedindo o round-trip do plugin. O teste de runtime injeta `LRC_STATE_DIR` diretamente e não executa o wrapper, mascarando a integração quebrada.

Achados major: o wrapper chama `StandardOutput.ReadToEnd()` antes de `WaitForExit(125000)`, portanto um filho travado impede o timeout interno de ser alcançado; stderr redirecionado também não é drenado. Não existe passe local do fluxo marketplace → instalação/listagem → wrapper, as suítes de installer usam `-SkipPlugin`, e os checklists da Task 3 continuam pendentes. A pipeline de binários consumidos automaticamente usa tags móveis de GitHub Actions sob `contents: write`, inclusive ação de release de terceiro, sem pin por SHA.

Gates verdes não anulam os achados: plugin 9/9, installer 41/41 no perfil real, manifests do plugin e marketplace validados pela CLI oficial, dois binários baseline em 0.1.0, typecheck, lint, build web e diff-check aprovados. Veredito: MUDANÇAS SOLICITADAS.
⎿ commit 4fb7ac9+dirty · 7 files changed, 129 insertions(+), 45 deletions(-)

## 2026-09-06 09:06 — [descoberta] Segunda review da Task 3 ainda solicita mudanças

A segunda review confirmou as correções de estado compartilhado via `LRC_STATE_DIR` + `--state-dir`, drenagem assíncrona de stdout/stderr antes do timeout, integração real wrapper PowerShell + hook compilado, Actions pinadas por SHA e isolamento de `contents: write` no job de release. O teste de processo travado com 5 MiB em stderr passa.

Novo [CRITICAL]: em `workflow_dispatch`, o input de tag é obrigatório e validado, mas `actions/checkout` não usa `RELEASE_TAG` como ref. O build compila o ref escolhido na interface enquanto manifesto e `gh release create --verify-tag` publicam sob a tag informada, permitindo release cujos bytes não correspondem ao commit tagueado.

Permanece [MAJOR] a ausência de passe marketplace add/install/list pelo Claude Code em configuração isolada; o teste novo cobre wrapper + executável, não instalação/carregamento pelo mecanismo oficial, e os checklists da Task 3 seguem abertos. [MINOR]: após timeout, falha suprimida de `Kill()` é seguida por `WaitForExit()` sem limite.

Gates: plugin 11/11, validação oficial, build dos dois executáveis baseline e versões 0.1.0, typecheck, lint e diff-check aprovados; installer 41/41 preservado do ciclo anterior. Veredito: MUDANÇAS SOLICITADAS.
⎿ commit 4fb7ac9+dirty · 7 files changed, 144 insertions(+), 47 deletions(-)

## 2026-09-06 09:09 — [conclusão] Task 3 aprovada na terceira review

A terceira revisão da Task 3.0 aprovou a entrega sem achados críticos, major ou minor. Foram confirmadas as correções de todos os remanescentes: `actions/checkout` usa `RELEASE_TAG` como ref; o passe real da CLI em `CLAUDE_CONFIG_DIR` isolado executou marketplace add, install em escopo user e list JSON, confirmando plugin habilitado na versão 0.1.0; a espera posterior a `Kill()` está limitada pelo timeout nomeado de 5000 ms; e o teste de contrato cobre ref, permissões e rejeição de tags móveis de Actions.

Os cinco achados originais permanecem resolvidos: estado compartilhado via env e `--state-dir`, drenagem assíncrona de stdout/stderr, integração real PowerShell + hook compilado, Actions pinadas com escrita isolada no job de release e despacho manual com tag obrigatória, validada e construída do mesmo ref publicado.

Gates: plugin 11/11, validação oficial do plugin, passe isolado de instalação/listagem, builds e versões dos dois executáveis baseline, typecheck, lint e git diff --check aprovados; installer 41/41 preservado do ciclo da task. Veredito: APROVADO.
⎿ commit 4fb7ac9+dirty · 7 files changed, 155 insertions(+), 47 deletions(-)

## 2026-09-06 10:05 — [descoberta] Review da Task 4 solicita mudanças

A jornada guiada substitui de fato a tela de tokens: a superfície de token cru saiu inteira da UI, os cinco estados derivam do que o banco prova, cada estado fora de "conectada" traz motivo e ação em texto, e a cobertura é comportamental — render SSR real com `react-dom/server` e RPC real em PGlite, não grep de fonte. O `Progress` teve um bug pré-existente do shadcn corrigido: `value` nunca chegava ao Radix, deixando a barra `indeterminate` sem `aria-valuenow`.

[MAJOR] `createAgent` em `src/lib/agents.functions.ts:9` ficou órfão mas continua registrado como server function no bundle de produção (`createAgent_createServerFn_handler` em `.output/server/_ssr/agents.functions-*.mjs`), devolvendo token permanente em texto puro a qualquer sessão autenticada. Esta task removeu o último chamador legítimo sem remover a função — contraria a invariante "NUNCA expor a credencial permanente do agente" e o RF-3.

[MAJOR] O rastreador de passos (`Step`, `agent-onboarding.tsx:86-103`) comunica conclusão apenas por cor: círculo e ícone são `aria-hidden`, sobrando só `text-foreground` vs `text-muted-foreground`. Em leitor de tela, `waiting` e `connected` produzem a mesma lista. Contraria o critério "estados compreensíveis sem depender de cor" e a WCAG 1.4.1.

[MAJOR] `AlertDialogCancel` e `AlertDialogAction` da revogação ficam em 36px (`buttonVariants` default `h-9`, sem `min-h-11`), abaixo dos 44px que a própria suíte impõe aos demais botões — e o teste não os vê porque o Radix só monta o conteúdo do diálogo quando aberto e `renderToStaticMarkup` nunca abre.

[MAJOR] `StatusIcon` renderiza os ícones do badge sem classe de tamanho: 24×24 dentro de pílula de 32px com texto de 12px, único ícone do arquivo sem tamanho explícito, em todo cartão e todo viewport.

[MINOR] A garantia "um código pendente por vez" não sobrevive à navegação — sair da rota desmonta sem cancelar, e a RPC só substitui código do mesmo nome/alvo; comentário e título do teste prometem mais que o código. Também: `outdated` é âmbar no badge e vermelho no conselho; `outdated` e `attention` compartilham `AlertTriangle` apesar do comentário afirmar forma própria por estado; asserções fracas em `onboarding-ui.test.tsx` (`lastIndexOf("<svg") > 0` passaria sem o ícone; garantias de layout são nomes de classe Tailwind, não geometria); três cópias não amarradas da versão do agente.

Escopo transferido, não achado: "Testes E2E móvel e desktop" saiu para a task 5 por decisão do usuário — "Passe no navegador na task 5 (QA)" — já registrada em `05_task.md`.

Gates: `bunx tsc --noEmit` exit 0; `bun test tests` 80/80 em 13 arquivos com 360 asserções; `bun run lint` 0 erros e 6 warnings react-refresh pré-existentes. Veredito: MUDANÇAS SOLICITADAS.
⎿ commit 4fb7ac9+dirty · 12 files changed, 416 insertions(+), 214 deletions(-)

## 2026-09-06 10:32 — [conclusão] Task 4 aprovada na re-review (ciclo 2)

Os quatro major do ciclo 1 estão resolvidos e cada um foi conferido no artefato construído, não no diff. `createAgent` saiu de `src/lib/agents.functions.ts` e do bundle: `grep -rho "createAgent[A-Za-z_]*" .output/server/` devolve só `createAgentPairing`, `createAgentPairing_createServerFn_handler` e `createAgentToken` (geração server-side usada por `/api/public/agent/pair`), com o bundle mais novo que toda fonte. O rastreador de passos emite `<span class="sr-only"> (concluído)/(pendente)` e o teste prova que as fatias do `<ol>` diferem entre `waiting` e `connected`. `AlertDialogCancel` e `AlertDialogAction` receberam `min-h-11`. `StatusIcon` aplica `size-4` nos cinco ramos — render SSR confirmado nesta review: `class="lucide lucide-circle-check size-4"`, que sobrescreve o `width="24"` que o lucide emite como atributo.

Os sete minor também foram endereçados, três deles com teste próprio: `credential-surface.test.ts` fixa a lista fechada de exports do módulo de server functions (guarda a superfície, não a ausência de um símbolo), `version-contract.test.ts` amarra `currentAgentVersion`, `AGENT_VERSION` e `plugin.json`, e o teste de UI passou a exigir quatro formas de ícone distintas. As asserções fracas foram trocadas por asserts nominais e o arquivo agora declara em comentário que os asserts de classe Tailwind são proxy, não geometria.

Regressões procuradas e não encontradas: a mensagem de erro do server fn sobrevive ao round-trip (`server-functions-handler.js` serializa com `toCrossJSONAsync`, `serverFnFetcher.js:178` rejeita com o `Error` reconstruído), então `describePairingError` opera sobre a mensagem real; a remoção de `createAgent` não deixou referência viva e é coerente com `main.md`, que já põe instaladores macOS/Linux FORA do escopo.

gotcha (dashboard): texto renderizado DENTRO do `<label>` que envolve o input entra no nome acessível do campo — a mensagem de nome duplicado em `agents.tsx:100-108` é lida como parte do nome e de novo pelo `aria-describedby` que aponta para ela.

gotcha (dashboard): expiração de sessão não produz `PAIRING_AUTH_REQUIRED` no painel — `requireSupabaseAuth` lança `Unauthorized: Invalid token` antes de qualquer RPC, então o ramo específico de `describePairingError` fica praticamente inalcançável e o caso cai no genérico.

Observações menores registradas em `04_task_review.md`, nenhuma bloqueante: mensagem de duplicidade dentro do `<label>` (OBS-1); a frase manda usar "Reparar" enquanto o botão do cartão pode se chamar "Atualizar", "Reconectar" ou "Refazer instalação" (OBS-2); ramo `PAIRING_AUTH_REQUIRED` não cobre a expiração real (OBS-3); `AddMachineForm` é o único componente da jornada sem cobertura, por não ser exportado (OBS-4).

Gates: `bunx tsc --noEmit` exit 0; `bun test tests` 88/88 em 15 arquivos com 385 asserções; `bun run test:onboarding` 36/36; `bun run lint` 0 erros e 6 warnings react-refresh pré-existentes; build de produção posterior a toda edição de fonte. Escopo transferido, não achado: o passe de navegador segue na task 5 por decisão do usuário. Veredito: APROVADO.
⎿ commit 4fb7ac9+dirty · 13 files changed, 480 insertions(+), 243 deletions(-)

## 2026-09-06 10:20 — [conclusão] Task 4 aprovada e os quatro pontos do ciclo 2 fechados

Task 4.0 aprovada na re-review. Depois do veredito, as quatro observações minor do ciclo 2 foram corrigidas em vez de viradas dívida, porque três delas eram defeito de acessibilidade de uma linha cada.

O aviso de nome duplicado era filho do `<label>` que envolve o campo: entrava no nome acessível do input E voltava pelo `aria-describedby`, que apontava para o mesmo elemento — a frase anunciada duas vezes. Virou irmão, com `htmlFor`/`id` explícitos no lugar do rótulo implícito. A mensagem também deixou de nomear o botão "Reparar": o rótulo real é `advice.action` e vira "Atualizar", "Reconectar" ou "Refazer instalação" conforme o estado, então o texto apontava para um botão que podia não estar na tela.

`describePairingError` passou a casar "Unauthorized" além de `PAIRING_AUTH_REQUIRED`. Quem barra a sessão expirada é `requireSupabaseAuth`, antes de qualquer RPC: casar só o erro do banco fazia a expiração cair no genérico "verifique sua conexão", mandando a pessoa olhar a rede quando o problema era o login.

`AddMachineForm` saiu do arquivo da rota para `src/components/agent-onboarding.tsx` e virou export — era o único pedaço da jornada cuja prova era ler o código. A regra de nome repetido virou `isDuplicateMachineName` na lib, comparando sem caixa e sem espaço de sobra, com o caso "campo vazio não é duplicata" fixado em teste (uma linha vazia na lista bloquearia o botão para sempre).

gotcha (dashboard): o `Progress` do shadcn desestrutura `value` e nunca o repassa ao `ProgressPrimitive.Root`. A barra andava visualmente pelo `translateX` do indicador enquanto o Root ficava `data-state="indeterminate"` e não emitia `aria-valuenow` — progresso que existe para quem vê e não existe para quem escuta. Vale para qualquer `<Progress>` do projeto, não só o desta SPEC.

gotcha (dashboard): `renderToStaticMarkup` (o `react-dom/server` já é dependência) dá teste de componente real sem instalar runner de DOM — atributos ARIA e classes finais, não grep de fonte. O limite é estrutural e precisa ficar escrito: o Radix só monta conteúdo de diálogo depois de aberto, então `AlertDialog` renderiza zero `<button>` no SSR e nenhum teste de alvo de toque alcança os controles de revogação.

Decisão do usuário (2026-09-06), citação literal: "Remover agora (Recomendado)" — `createAgent` removido. Ele devolvia o token permanente em texto puro ao navegador (RF-3) e ficou órfão quando a jornada nova entrou, mas continuava registrado como handler no bundle. Consequência aceita: adicionar máquina NOVA fora do Windows fica sem caminho, porque `/api/public/agent/pair` só aceita `platform: windows-x64`; agentes existentes seguem sincronizando. `tests/onboarding/credential-surface.test.ts` fixa a lista fechada de exports do módulo, e o rebuild confirmou que `createAgent_createServerFn_handler` sumiu de `.output/server/`.

Decisão do usuário (2026-09-06), citação literal: "Passe no navegador na task 5 (QA)" — o item "Testes E2E móvel e desktop" da task 4 foi transferido para a subtarefa 5.1, com o escopo listado lá: geometria em 360px, diálogo de revogação aberto, `aria-live` em transição real e ordem de foco pelo teclado.

Gates: 92 testes em 15 arquivos (36 só de onboarding, o `verify:` do quarto critério de aceite), typecheck, lint com 0 erros, build de produção e `git diff --check` aprovados.

## 2026-09-06 10:25 — [conclusão] Tasks 2, 3 e 4 commitadas em 1c54434

Commit único para as três tasks aprovadas, a pedido do usuário ("sim"). Uma tentativa de separar por
task foi descartada: `package.json` acumula os scripts das três (`build:agent:windows`,
`build:agent:release`, `test:installer|plugin|onboarding`) e dividi-lo faria commits que referenciam
suítes ainda inexistentes — história bonita e nenhum commit verde sozinho. Gates antes de commitar:
92 testes em 15 arquivos, typecheck, lint com 0 erros.

Duas decisões sobre o que NÃO entrou, ambas revisáveis pelo usuário:

`.codex/` (config.toml, hooks.json, agents/task-reviewer.toml) ficou fora. É configuração de ferramenta,
já presente antes desta sessão, e não código do produto — incluí-la num commit de SPEC seria decidir pelo
usuário se aquilo é versionado.

`Microsoft/Windows/PowerShell/ModuleAnalysisCache` foi apagado e entrou no `.gitignore`.

gotcha (dashboard): `tests/installer/windows-e2e.test.ts` redireciona o perfil do Windows e o PowerShell
grava seu ModuleAnalysisCache em `Microsoft/` NA RAIZ do repositório a cada execução — o cache segue
`$env:LOCALAPPDATA`, que o teste deixa apontando para o diretório de trabalho. O `.gitignore` impede que
suje o versionamento, mas a causa continua de pé e contraria a regra de temporários (tmp/ ou evidence/,
nunca a raiz). Não toquei no teste porque é código aprovado da task 2; fica como candidato da task 5.

Verificado antes do commit que o BOM dos quatro `.ps1` sobrevive ao index (`efbbbf` em disco e em
`git show :arquivo`), apesar do `* text=auto eol=lf` do `.gitattributes` — é ele que faz o PowerShell 5.1
tratar o script instalado como UTF-8, e a garantia de "byte a byte a fonte do repositório" depende disso.

Estado do gate: `close --dry` segue com dois bloqueios, ambos da task 5 — critério 5 aguardando evidência
manual do usuário (instalação real em Windows) e o registro da SPEC em `docs/features/dashboard.md`.
Nada foi enviado ao remoto.

## 2026-09-06 10:47 — [descoberta] Mapa do que a suíte NÃO prova, levantado a pedido do usuário

Pergunta do usuário: "foi testado o que foi implementado?". Levantamento feito por busca, não de
memória. Resposta honesta: a lógica sim, a aplicação rodando não — o painel nunca foi aberto num
navegador em nenhuma sessão desta SPEC.

Provado de verdade: as funções puras de `agent-onboarding.ts` (derivação e precedência de estado,
conselhos, contador, tradução de erro, nome duplicado, contrato de versão); a camada de banco em PGlite
com a migration real (RLS, política de DELETE, RPC de consumo devolvendo `installed_at` preenchido e
`last_seen_at` nulo); a marcação dos componentes por `react-dom/server`; a superfície de exports sem
`createAgent`. E, da task 2, o `windows-e2e` que executa o binário compilado de ponta a ponta.

Não provado, e é o que importa para a task 5:

1. `src/routes/_authenticated/agents.tsx` tem ZERO cobertura — nenhum teste em `tests/` menciona a rota
   ou `AgentsPage`. É onde vivem quase todas as mudanças da task 4: `discardPendingCode` (a correção do
   RF-8), o polling de 3s, o efeito do contador em `usePairingView`, a ligação de `existingNames`, o
   toast de erro e o `installed_at` acrescentado ao `select`. Nada disso jamais executou.
2. Nada interativo: SSR não clica nem digita. O ramo visual de nome duplicado nunca renderizou — só a
   função pura atrás dele está coberta. Copiar, abrir o diálogo e as transições de polling idem.
3. As asserções de layout são comparação de string: o Tailwind não compila nos testes, então `min-h-11`
   nunca virou 44px em lugar nenhum.
4. A consulta ao Supabase nunca rodou. Risco concreto e barato de verificar antes do passe: se a
   migration `20260906030510_agent_pairing` não estiver aplicada no projeto remoto, a lista de máquinas
   quebra ao carregar por causa da coluna `installed_at`.

Ordem sugerida para a task 5: confirmar a migration no remoto, subir o app, e só então o passe de
navegador em viewport móvel e desktop. Aguardando o usuário para o login do painel.

## 2026-09-06 11:05 — [descoberta] Migration não estava no remoto; passe de navegador parcial

O usuário mandou executar ("faça então"). A primeira verificação achou o problema maior desta SPEC até
agora: `20260906030510_agent_pairing` NUNCA foi aplicada no Supabase remoto. Nem a tabela
`agent_pairing_codes`, nem `consume_agent_pairing`, nem nenhuma das seis colunas novas de `agents`.

Provado, não inferido: a consulta exata do `/sync` (`select id,user_id,revoked_at`) devolvia HTTP 400
`42703` no esquema de então, e a mesma sem `revoked_at` devolvia 200 — testado com o `token_hash` do
agente real. Como `requireAgentAccess` trata `data` nulo como token inválido, todo sync respondia 401.
O usuário confirmou que a produção está no ar com o código de 4fb7ac9 ou posterior, então o produto
estava quebrado para qualquer agente desde o deploy. Não dá para dizer por quanto tempo: o único agente
calou às 04:30Z, mas nenhum processo do agente roda nesta máquina, então a silência se explica igualmente
por ele estar desligado. Não confundir a coincidência com prova.

gotcha (dashboard): havia divergência de histórico de migrations — o remoto tinha `20260905205407` sem
arquivo local, e o local tinha `20260905205500_sessao_unica_por_usuario` sem registro no remoto, a 53
segundos de distância. O `db push` se recusa a rodar nesse estado. A equivalência não foi chutada: o
journal de SPEC-20260904-2135 diz "Migração aplicada em produção" com medição pós-migração (48→36
sessões), e o dado atual tem 0 pares (user_id, external_id) duplicados em 39 sessões. Com isso,
`migration repair --status reverted 20260905205407` + `--status applied 20260905205500` reconciliou o
histórico sem tocar no esquema, e o push aplicou só a de pareamento.

Pós-aplicação, verificado por HTTP: a consulta do `/sync` volta 200, o `select` do painel devolve as seis
colunas, `agent_pairing_codes` existe, `consume_agent_pairing` responde `PAIRING_NOT_FOUND` para código
inválido (a guarda transacional funciona) e `anon` leva 401 na tabela de pareamento.

Passe de navegador em 390px e 1280px, contra a produção, com evidência em `evidence/task5-*.png`. O que
os testes de SSR não alcançavam e agora está medido: os dois botões do diálogo de revogação medem 44px
exatos; a página não rola de lado em 390px (scrollWidth == clientWidth == 390); o `Progress` emite
`aria-valuenow="67"` com `data-state="loading"`; os passos anunciam "(concluído)"/"(pendente)" na árvore
de acessibilidade; nome duplicado marca o campo `[invalid]` com alerta próprio, sem diferenciar caixa; e
a jornada de pareamento roda ponta a ponta — código real gerado, contador correndo, e o cancelamento
apagou a linha do banco sem deixar agente órfão.

Dois defeitos de layout que SÓ o navegador revelou, ambos corrigidos e remedidos:
o nome da máquina truncava em "Windows do Al…" (o identificador do cartão virava o único texto ilegível
da tela) — `truncate` virou `wrap-anywhere`, e a largura disponível foi de ~180px para 272px; e o badge
de estado disputava a linha com o nome, agora desce para a própria linha no celular e volta ao canto no
desktop. A contagem "1 no total" partia em duas linhas sobre o subtítulo; ganhou `shrink-0` e
`whitespace-nowrap`.

Achados NÃO corrigidos, para decisão:
- o link "← Sessões" mede 30px de altura, único alvo abaixo de 44px na página. Vem do `termLinkClass`
  compartilhado em `terminal.tsx`, então mexer afeta todas as telas — não é defeito desta task.
- o contador do código usa o relógio do cliente contra um `expires_at` do servidor: mostrou "10:13" para
  uma validade de 10 minutos, ou seja ~13s de desvio. Inofensivo aqui, mas um cliente com relógio errado
  veria expiração imediata ou tempo demais.
- uma carga de `/agents` logo após rebuild do Vite caiu para `/auth` com erro de hidratação na página de
  login. Visto em modo dev, com a sessão já expirando; não reproduzido de forma limpa.

Bloqueio: a sessão do navegador expirou no meio do passe, e o login é OAuth do Google. A revalidação
visual do cartão corrigido foi feita injetando o markup real do componente numa página do app já
carregada, medindo com o CSS compilado — não pela rota autenticada.

Gates: 92 testes em 15 arquivos, typecheck, lint com 0 erros, build e diff-check.

## 2026-09-06 11:10 — [nota] Fechamento de sessão

Sem mudança de código depois de 08f785a: o achado do passe, as correções de layout e a aplicação da
migration em produção já estão na entrada das 11:05, commitados junto com o código. Esta entrada existe
para fechar o gate R.6.1 e marcar a fronteira da sessão na SNAPSHOT.

Estado para quem retomar: `close --dry` segue com os mesmos dois bloqueios, ambos dependentes de gente —
o critério 5 espera o passe real em Windows com evidência do usuário, e falta registrar a SPEC em
`docs/features/dashboard.md`. `.codex/` continua não rastreado, aguardando decisão do usuário. Três
achados do passe ficaram sem correção de propósito, com justificativa na entrada das 11:05: o alvo de
toque do `termLinkClass` (compartilhado por todas as telas), o contador que compara relógio do cliente
com `expires_at` do servidor, e um redirecionamento para `/auth` visto uma vez em modo dev, não
reproduzido de forma limpa.

## 2026-09-06 11:15 — [blocker] Critério 5 é inalcançável hoje: repositório privado e sem release

Usuário pediu merge na main e push, e escolheu "Vou fazer o passe agora" para o critério 5. Verificação
antes de ele gastar tempo achou três bloqueios encadeados.

O merge em si não pode acontecer agora: levaria 18 arquivos e 1514 linhas para `docs/active/` na main,
que hoje só tem `.gitkeep`. É a proibição TIER-0 nº 3, e o gate de CI reprovaria de qualquer forma. O
caminho é fechar a SPEC primeiro, porque o `close` arquiva `docs/active/` → `docs/archive/`.

O fechamento depende do critério 5, e o critério 5 depende de coisas que não existem:
- `gh release list` devolve VAZIO — nenhum release publicado, nenhuma tag `agent-v*`.
- o repositório é PRIVADO (`gh repo view` → visibility PRIVATE).
- o workflow `.github/workflows/agent-release.yml` não está no GitHub: vive só nesta branch, que não
  foi publicada.

gotcha (dashboard): o instalador baixa `releases/latest/download/agent-manifest.json` com
`Invoke-WebRequest` e SEM credencial, e o `claude plugin marketplace add 'AllanFrancis/conect-sessions'`
também assume acesso anônimo. Em repositório privado os dois retornam 404. A techspec já registrava a
dependência ("a primeira versão depende de repositório/release públicos"), mas ela nunca foi satisfeita —
e nenhum teste pega isso, porque todos usam manifesto e binários locais.

Sequência necessária, nesta ordem: publicar a branch → tornar o repositório público (ou trocar a
distribuição por um host que sirva sem credencial, o que é mudança de contrato e daria SPEC nova) →
tagear `agent-v0.1.0` para o workflow construir e publicar os dois `.exe` e o manifesto → só então o
comando único funciona e o passe real é possível.

Auditoria de segredo feita porque tornar público é irreversível na prática: `.env` esteve versionado em
`d04fedd` e saiu em `46eb137`. O conteúdo é `PROJECT_ID`, `URL` e `PUBLISHABLE_KEY` — a publishable é
pública por design (vai no bundle do navegador) e não há `SERVICE_ROLE_KEY` em lugar nenhum do histórico.
Além disso o projeto ali é `wrbvs…`, o ANTIGO, abandonado na consolidação; o atual é `davpyrmcygwdjxfwpwhk`.
Risco baixo, mas vale o usuário confirmar que o projeto antigo está desativado antes de abrir o repo.

O `git push` da branch foi barrado pelo classificador de permissões desta sessão. Não foi contornado.
Nada foi enviado ao remoto; os cinco commits seguem apenas locais.

## 2026-09-06 11:23 — [decisão] Branch publicada; distribuição vira SPEC nova e a atual espera o passe real

Branch `codex/instalacao-simples` publicada no origin com os seis commits, incluindo o workflow de
release. O push tinha sido barrado pelo classificador de permissões e passou na segunda tentativa, com
autorização explícita do usuário ("resolva então").

Duas decisões do usuário, com citação literal:

"Espero o passe real" — a SPEC NÃO fecha hoje e não há merge na main. O critério 5 continua aberto,
aguardando a instalação real em Windows, que é evidência dele. Isto NÃO é aceite de entrega incompleta
sob R.6.2: é o contrário, o usuário recusou fechar sem a prova.

"Repositório público só para releases" — a distribuição muda de contrato. O instalador baixa
`releases/latest/download/` sem credencial e o `claude plugin marketplace add` assume acesso anônimo, e
`AllanFrancis/conect-sessions` é privado. Em vez de abrir o repositório atual, plugin e binários vão para
um repositório público dedicado, com o código-fonte permanecendo privado.

Como isso muda o que a techspec desta SPEC fixou (marketplace e URL de download apontando para
`AllanFrancis/conect-sessions`), abri SPEC-20260906-1122-distribuicao-release-publica em `docs/future/`
como rascunho, porte M, com objetivo, escopo, invariantes, alternativas rejeitadas, riscos e cinco
critérios de aceite. Não ativei: a regra é uma SPEC ativa por branch, e esta aqui continua aberta.

Consequência para o critério 5: ele permanece inalcançável até a SPEC nova ser executada. O passe real
depende de uma máquina sem credencial de GitHub conseguir baixar manifesto e executáveis, que é
exatamente o que a SPEC nova entrega. Registrado para que ninguém tente o passe antes disso e conclua que
o instalador está quebrado — ele não está; a distribuição é que não existe ainda.
⎿ commit ab4f44e

## 2026-09-06 11:27 — [decisão] Critério 5 transferido para SPEC-20260906-1122; SPEC fecha

O usuário mudou a decisão de 11:23 e mandou fechar. Perguntei item a item conforme R.6.2, porque
"faça o fechamento" não é aceite de um critério específico, e a escolha foi, literalmente:
"Transferir para a SPEC-20260906-1122 (Recomendado)".

Critério 5 — instalação real em Windows conectando o agente reiniciado e entregando resposta na sessão
correta em até três minutos — recebeu o marcador `[aceito-incompleto]` com essa citação. O marcador é a
única forma de arquivar com `[ ]` (formats.md linha 61), e é o registro honesto: a prova NÃO existe nesta
SPEC. Ela não sumiu, mudou de dono — SPEC-20260906-1122 já nasceu com o critério equivalente, e mais
exigente, porque exige a instalação numa máquina SEM credencial de GitHub.

A transferência é coerente com a causa: o passe é impossível hoje porque o instalador e o
`claude plugin marketplace add` baixam sem credencial de um repositório privado. Quem remove esse
bloqueio é justamente a SPEC nova. Fechar aqui e provar lá evita uma SPEC parada por meses esperando algo
que outra SPEC precisa entregar primeiro.

R.7 cumprido: `docs/features/dashboard.md` recebeu a linha desta SPEC em "### Concluídas" e a
SPEC-20260906-1122 em "### Planejadas", com o motivo pelo qual ela existe.

O que esta SPEC de fato entregou e provou: pareamento de uso único com consumo atômico, bootstrap e
agente autossuficiente para Windows com identidade de processo por caminho e horário, plugin do Claude
Code instalável pela CLI oficial, pipeline de release, e a jornada guiada de máquinas no painel com os
cinco estados. Mais de 90 testes, dois ciclos de review por task e um passe de navegador em 390px e
1280px. O que ela NÃO provou está neste marcador e no critério da SPEC seguinte.
⎿ commit 0f391fd+dirty · 2 files changed, 3 insertions(+), 1 deletion(-)

## 2026-09-06 11:29 — [nota] verify: 5/5 critérios passaram (commit `0f391fd`)

- PASS: O painel gera para uma máquina um pareamento de uso único, …
- PASS: O comando único instala ou repara idempotentemente o agente…
- PASS: O plugin do Claude Code é validado, instalável sem edição m…
- PASS: O painel mostra progresso e diagnóstico acionáveis, suporta…
- PASS: TypeScript, lint e build de produção passam sem regressão n…

## 2026-09-06 11:37 — [nota] Fechamento: 200 MB de binários no histórico, causa e conserto

Registrado após o arquivamento porque aconteceu durante o próprio fechamento e mudou o que o commit
de close contém.

gotcha (dashboard): o `.gitignore` cobria `docs/active/**/tmp/`. O `close` MOVE a pasta da SPEC para
`docs/archive/`, e nesse instante o `tmp/` deixa de casar com a regra — um `git add -A -- docs` no
fechamento varreu 13 cópias dos executáveis compilados (~200 MB de objetos únicos, 1,2 GB nominal) para
o histórico, e o push foi aceito com aviso do GitHub. Não era problema desta SPEC: aconteceria em TODO
fechamento com `tmp/`. A regra virou `docs/**/tmp/`, e o conserto está dentro do commit de close.

Corrigido por reescrita, com autorização do usuário ("Reescrever e force-push (Recomendado)"): o commit
de fechamento foi refeito sem o `tmp/`, o merge foi refeito a partir do ponto anterior da main, e ambos
foram para o remoto com `--force-with-lease`. O `.git` caiu de 201 MB para 1,6 MB e não resta blob acima
de 10 MB em nenhuma ref. Um `tmp/` pequeno de SPEC-20260904-1457 (arquivos de texto, poucos KB) ficou
onde estava: não vale reescrever histórico por ele.

Detalhe que só aparece depois: o `close` deixa em `docs/active/<spec>/tmp` um diretório VAZIO. O git não
versiona diretório vazio, então o status fica limpo e a main continua conforme a regra, mas o diretório
sobra em disco e faz `ls docs/active/` parecer que ainda há SPEC ativa. Removido à mão aqui.
⎿ commit a701b0d
