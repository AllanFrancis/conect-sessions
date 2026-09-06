# Review: Task 2.0 - Entregar bootstrap e agente autossuficiente para Windows

**Revisor**: AI Code Reviewer
**Data**: 2026-09-06
**Arquivo da task**: 02_task.md
**Status**: APROVADO

## Resumo

A re-review confirmou a correção dos sete achados da revisão anterior. O bootstrap valida download, SHA-256 e `--version` antes de consumir o pareamento; processo, launcher e remoção usam identidade por caminho e horário de início; o instalador comprova processo vivo e `--probe --json`; endpoint, autostart, reparo, PID reciclado e desinstalação possuem cobertura comportamental; o build não depende mais de `docs/active/`; e launcher/desinstalador/biblioteca são embutidos a partir de fontes canônicas únicas. Os 41 testes de installer passaram no perfil real do Windows, assim como typecheck, lint, build web, build do agente e diff-check.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| public/agent/remote-agent.mjs | ✅ OK | 0 |
| public/agent/install-agent.ps1 | ✅ OK | 0 |
| public/agent/agent-process.ps1 | ✅ OK | 0 |
| public/agent/launcher.ps1 | ✅ OK | 0 |
| public/agent/uninstall-agent.ps1 | ✅ OK | 0 |
| scripts/build-agent.mjs | ✅ OK | 0 |
| src/lib/agent-installer.ts | ✅ OK | 0 |
| src/routes/api/public/agent/install[.]ps1.ts | ✅ OK | 0 |
| tests/installer/agent-build.test.ts | ✅ OK | 0 |
| tests/installer/agent-installer-endpoint.test.ts | ✅ OK | 0 |
| tests/installer/windows-installer.test.ts | ✅ OK | 0 |
| tests/installer/windows-e2e.test.ts | ✅ OK | 0 |
| package.json | ✅ OK | 0 |
| src/routeTree.gen.ts | ✅ Gerado | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

Nenhum problema minor encontrado.

## Revalidação dos Achados Anteriores

| # | Achado anterior | Evidência da correção | Status |
|---|-----------------|-----------------------|--------|
| 1 | Pareamento consumido antes da validação do artefato | `public/agent/install-agent.ps1:155-176` valida manifesto, SHA-256 e `--version` antes do POST de pareamento; `tests/installer/windows-installer.test.ts:228-237` fixa a ordem e `:280-300` prova que hash inválido preserva binário, config e pareamento | ✅ Resolvido |
| 2 | PID persistido podia atingir processo alheio | `public/agent/agent-process.ps1:132-159` confere caminho e horário de início; `:173-204` centraliza o encerramento; `tests/installer/windows-installer.test.ts:329-370` prova que PID reciclado não é encerrado nem confundido com o agente | ✅ Resolvido |
| 3 | Sucesso sem diagnóstico real | `public/agent/install-agent.ps1:225-250` exige processo vivo e JSON válido de `--probe --json`; o E2E também exige “Diagnóstico concluído” | ✅ Resolvido |
| 4 | Processo, autostart e remoção sem cobertura | `tests/installer/windows-installer.test.ts:239-278`, `:302-389` e `:428-446` exercitam chave Run única, launcher idempotente, reparo com agente vivo e remoção idempotente | ✅ Resolvido |
| 5 | Endpoint sem teste de renderização e headers | `tests/installer/agent-installer-endpoint.test.ts:33-91` valida origem/porta, placeholders, segredo, conteúdo embutido, Content-Type, no-store e CORS | ✅ Resolvido |
| 6 | Build acoplado à pasta efêmera da SPEC | `scripts/build-agent.mjs:15-22` aceita `--outfile`/`AGENT_OUTFILE` e usa `dist/agent` como padrão; o gate compilou com destino isolado | ✅ Resolvido |
| 7 | Duas implementações do desinstalador | `src/lib/agent-installer.ts:33-46` embute a fonte canônica; `tests/installer/windows-installer.test.ts:259-263` e `:391-426` comprovam igualdade byte a byte no bootstrap servido | ✅ Resolvido |

## ✅ Destaques Positivos

- O E2E executa o binário Bun compilado, troca a credencial protegida por DPAPI, sincroniza uma sessão e entrega a resposta ao `external_id` correto.
- O valor efetivamente gravado em HKCU Run é executado no teste para simular o logon, e a remoção confirma ausência de processo, pasta e valor de autostart.
- O launcher serializa partidas concorrentes com mutex por instalação e nunca considera PID cru como identidade suficiente.
- A falha de integridade ocorre antes da operação irreversível de pareamento e preserva a instalação saudável.
- O bootstrap público é autossuficiente e mantém BOM UTF-8 necessário ao PowerShell 5.1.
- O token permanente não aparece no comando, na configuração em claro nem nos logs verificados.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript estrito / TanStack Start | ✅ |
| PowerShell / Windows 10 e 11 | ✅ |
| Proteção de credencial / DPAPI CurrentUser | ✅ |
| Integridade SHA-256 | ✅ |
| Processo, HKCU Run e idempotência | ✅ |
| Endpoint HTTP público | ✅ |
| Testes | ✅ |

## Validação Executada

| Comando | Resultado |
|---------|-----------|
| `bun run test:installer` no sandbox | ⚠️ 33 passaram e 8 falharam somente porque o perfil DPAPI CurrentUser não é carregado nesse contexto |
| `bun run test:installer` com perfil real do Windows | ✅ 41 testes em 8 arquivos, 0 falhas (32 confirmados na execução completa + 9/9 da suíte Windows reexecutados integralmente) |
| `bunx tsc --noEmit` | ✅ exit 0 |
| `bun run lint` | ✅ exit 0; 6 warnings preexistentes de Fast Refresh fora do escopo |
| `bun run build` | ✅ exit 0; avisos não bloqueantes preexistentes |
| `bun run scripts/build-agent.mjs --outfile docs/active/SPEC-20260905-2251-instalacao-simples/tmp/task-review/conect-agent.exe` | ✅ exit 0, alvo Windows x64 baseline |
| `git diff --check` | ✅ exit 0 |

## Recomendações

1. Manter os testes comportamentais de PID reciclado, bootstrap servido e execução literal do valor de Run como regressões obrigatórias.
2. Executar suítes com DPAPI em contexto que carregue o perfil real do usuário; falha no sandbox é limitação de ambiente, não falha da implementação.
3. Preservar o destino configurável do build ao criar o workflow de release da Task 3.0.

## Veredito

**APROVADO.** A Task 2.0 atende RF-4, RF-5 e RF-9 no escopo automatizável, e todos os achados bloqueantes e não bloqueantes da revisão anterior foram corrigidos e cobertos por regressão. A validação manual do release real e do round-trip dentro do Claude Code permanece corretamente vinculada ao critério humano da SPEC e à implementação do plugin na Task 3.0, não sendo lacuna desta task.
