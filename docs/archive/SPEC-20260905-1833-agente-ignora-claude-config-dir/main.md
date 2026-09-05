# SPEC-20260905-1833: agente ignora claude config dir

**Status:** done
**Porte:** P
**Owner:** @AllanFrancis
**Criada:** 2026-09-05 18:33
**Ativada:** 2026-09-05 18:33
**Concluída:** 2026-09-05 18:42
**Pausada em:** —
**Commit final:** `7c9d04d`
**Keywords:** dashboard
**Features:** dashboard
**Branch:** fix/agente-le-claude-config-dir
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-05 18:33 ("sim" ao achado do teste de ponta a ponta)
**Resumo:** O agente passa a ler as transcrições de onde o Claude Code de fato as escreve (`CLAUDE_CONFIG_DIR`), em vez de só em `~/.claude`.

## Objetivo

Achado no teste de ponta a ponta de 2026-09-05: o painel mostrou uma sessão de Claude Code viva,
com status e pid corretos, e a **conversa vazia**. Nenhuma mensagem tinha sido sincronizada.

A causa é uma linha: `sourceOf()` classifica a transcrição por
`file.startsWith(CLAUDE_PROJECTS_DIR)`, e `CLAUDE_PROJECTS_DIR` é `~/.claude/projects` fixo. A
variável `CLAUDE_CONFIG_DIR`, que é como o Claude Code decide onde guardar tudo, não aparece uma vez
sequer no agente. Nesta máquina ela vale `D:\VSCodeProfiles\Vinci\Claude`: toda transcrição atual
cai fora do caminho procurado, `sourceOf()` devolve `unknown`, `nativeIdOf()` devolve `null` e o
`tick()` pula o arquivo antes de ler uma linha.

Medido no dia do achado: 15 transcrições tocadas em `D:` contra 1 em `C:` — e a única sessão de
Claude Code com mensagens no painel era justamente a dessa transcrição antiga em `C:`. O painel
estava mostrando resíduo, não a sessão em uso.

## Escopo

**DENTRO:**

- O agente honra `CLAUDE_CONFIG_DIR` para achar `projects/`, `ide/` e `sessions/`.
- Continuar lendo `~/.claude` quando a variável não existe — que é o caso da maioria das máquinas.

**FORA:**

- Mudar o formato do payload de `/sync`.
- Kiro: `~/.kiro` não tem variável equivalente conhecida e não foi medida. Fica como está.
- Fazer o hook honrar a variável: ele não precisa: o Claude Code lhe entrega `transcript_path`
  pronto no stdin.

## Invariantes

- SEMPRE ler as duas origens quando ambas existirem: máquina que já sincronizou por `~/.claude` não
  pode perder o histórico só porque a variável passou a existir.
- NUNCA classificar como `claude-code` um arquivo que não veio de um diretório de projeto do Claude
  Code — o `source` errado manda a transcrição para o adaptador errado.

## Implementação

`CLAUDE_HOME` deixa de ser um caminho e passa a ser uma LISTA, alimentada por `CLAUDE_CONFIG_DIR`
(que aceita vários caminhos separados por vírgula, como o próprio Claude Code faz) mais o
`~/.claude` de sempre, sem repetir e ficando só com as que existem em disco.

- `sourceOf()` passa a testar contra todas as pastas `projects/` da lista.
- as varreduras de `ide/*.lock` e `sessions/<pid>.json` passam a percorrer a lista.
- `DEFAULT_DIRS` ganha todas as `projects/` existentes, então o tail lê as duas origens.

Comparação de caminho em Windows é `case-insensitive` e mistura `/` com `\`: a normalização tem que
ser explícita, senão `D:\VSCode...` não casa com `D:/VSCode...` e o bug volta com outra cara.

### Modelo de dados

| Entidade | Campos / mudança |
| --- | --- |
| — | Nenhuma. Mudança só na descoberta de arquivos no disco do agente. |

## Riscos

- Ler duas origens pode ressincronizar transcrição antiga que já estava no banco — mitigação: o
  upsert de `messages` usa `ignoreDuplicates` com `UNIQUE (session_id, external_id)`, então reenvio
  não duplica; e a sessão agora é única por `(user_id, external_id)`.
- `CLAUDE_CONFIG_DIR` apontando para lugar inexistente ou sem permissão — mitigação: a lista só
  guarda o que existe em disco; vazio volta ao comportamento de hoje.

## Sinais de sucesso

- Abrir no painel a sessão de Claude Code que está rodando agora e ver a conversa, não um vazio.

## Critério de aceite

- [x] `--probe`/agente reconhecem transcrição sob `CLAUDE_CONFIG_DIR` (hoje: `source=unknown`, arquivo pulado) (2026-09-05 18:40, commit `9c8917c`, evidence: arquivo em D:/.../projects: sourceOf ANTES=unknown, DEPOIS=claude-code; --probe passou a listar a sessao desta conversa (f4d59edd, pid 9964) com claude:transcript)
- [x] Mensagens de uma sessão de Claude Code viva chegam ao painel nesta máquina, provado com sessão real (2026-09-05 18:40, commit `9c8917c`, evidence: sessao real com CLAUDE_CONFIG_DIR isolado: 3 mensagens no banco (antes 0) e o painel renderizou o ensaio inteiro em http://localhost:8080/sessions/02f8baef)
- [x] Máquina SEM `CLAUDE_CONFIG_DIR` continua lendo `~/.claude` como hoje (2026-09-05 18:40, commit `9c8917c`, evidence: env -u CLAUDE_CONFIG_DIR: probe segue achando d2b3ef12 em ~/.claude com pid-registry+transcript)
- [x] Typecheck limpo (2026-09-05 18:40, commit `9c8917c`, verify: exit 0) | verify: `bunx tsc --noEmit`
- [x] Lint limpo (2026-09-05 18:40, commit `9c8917c`, verify: exit 0) | verify: `bun run lint`
