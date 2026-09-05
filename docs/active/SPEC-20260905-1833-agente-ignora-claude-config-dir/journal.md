# Journal — SPEC-20260905-1833

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-05 18:40
**Onde tô:** início — nada feito ainda
**Próximo passo:** <primeiro passo concreto>
**Última decisão:** —
**Bloqueio atual:** nenhum
**Se retomar, ler:** main.md desta SPEC

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | <fase> | pendente | 2026-09-05 18:33 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto
<!-- anti-alucinação por estrutura: separe o que é SABIDO (verificado no código/teste) do que é CHUTE (inferido) do que está EM ABERTO. Nunca trate inferência como fato. -->
- fato:
- inferência:
- dúvida:

### Respostas-chave do usuário

### Tentativas que falharam

### Arquivos tocados

### Onde parei

### Sessões (máx 5 linhas + 1 agregada)

## LOG (append-only — NUNCA editar entradas antigas)
<!-- tipos: ativação descoberta decisão tentativa blocker unblock refactor nota conclusão | entrada nova: specctl log -->

## 2026-09-05 18:33 — [ativação] SPEC criada e ativada (@AllanFrancis, branch fix/agente-le-claude-config-dir, base main)

## 2026-09-05 18:40 — [descoberta] CLAUDE_CONFIG_DIR ignorado tornava invisivel TODA transcricao atual; e explica a duvida da SPEC anterior

Achado rodando o teste de ponta a ponta pedido pelo usuário, não lendo código: o painel mostrou a
sessão de Claude Code viva, com status e pid certos, e a **conversa vazia**.

**A causa é uma linha.** `sourceOf()` classificava por `file.startsWith(CLAUDE_PROJECTS_DIR)`, com
`CLAUDE_PROJECTS_DIR = ~/.claude/projects` fixo. A string `CLAUDE_CONFIG_DIR` não aparecia uma vez
no agente. Nesta máquina ela vale `D:\VSCodeProfiles\Vinci\Claude`, então:

    sourceOf(arquivo em D:) → "unknown" → nativeIdOf → null → tick() pula antes de ler uma linha

Medido no dia: **15** transcrições tocadas em `D:` contra **1** em `C:`. E a única sessão de Claude
Code com mensagens no painel era justamente a dessa transcrição antiga em `C:`. O painel estava
mostrando resíduo, não a sessão em uso.

**Isto fecha uma dúvida que ficou aberta na SPEC-20260904-2135 (resposta-chega-no-cli).** Lá eu
registrei que `~/.claude/sessions/<pid>.json` "parecia morto na 2.1.260" — 4 sessões vivas e o probe
achando zero — e a [nota] das 22:14 já dizia que a causa não estava provada. Agora está: o registro
sempre existiu, só estava em `D:`. O agente olhava para `C:`. Não era a versão do Claude Code, era o
agente. Com a correção, o `--probe` mostra a sessão desta conversa com
`fontes=claude:pid-registry+claude:process+claude:ide-lock+claude:transcript`.

**Alcance:** vale para toda máquina que define `CLAUDE_CONFIG_DIR` — que é justamente quem move o
perfil de disco, caso comum em Windows com SSD pequeno. Nessas máquinas o produto entregava metade
do que promete: status sim, conversa não.
⎿ commit ca30d3f+dirty · 2 files changed, 85 insertions(+), 25 deletions(-)
