# Journal — SPEC-20260905-1833 (agente-ignora-claude-config-dir)

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-05 18:41
**Onde tô:** 5/5 critérios provados com sessão real e painel no navegador. Pronta para close.
**Próximo passo:** fechar. Nada pendente.
**Última decisão:** `CLAUDE_HOMES` é lista (variável + `~/.claude`), não caminho único.
**Bloqueio atual:** nenhum.
**Se retomar, ler:** a [descoberta] de 18:40 — ela também fecha a dúvida da SPEC-20260904-2135.

### Fases

| #   | Descrição                          | Status                       | Atualizado       |
| --- | ---------------------------------- | ---------------------------- | ---------------- |
| 1   | Correção + prova em sessão real    | concluída                    | 2026-09-05 18:41 |

### Fatos confirmados / Inferências prováveis / Dúvidas em aberto

- fato: `CLAUDE_CONFIG_DIR` não aparecia uma vez no agente; nesta máquina vale
  `D:\VSCodeProfiles\Vinci\Claude` e derrubava 15 transcrições do dia para `unknown`.
- fato: com a correção, `sourceOf` do arquivo em `D:` vai de `unknown` para `claude-code`, e o
  `--probe` passa a listar a sessão desta conversa (`f4d59edd`, pid 9964) por transcrição.
- fato: sessão real com config isolado → 3 mensagens no banco (antes 0) e o painel renderizou o
  ensaio inteiro, com markdown.
- fato: `env -u CLAUDE_CONFIG_DIR` → volta a ler `~/.claude` e continua achando `d2b3ef12`.
- fato: isso explica o `pid-registry` que parecia morto na SPEC-20260904-2135. Estava no outro disco.
- dúvida: Kiro pode ter variável equivalente. Não procurei, não medi — ficou FORA no contrato.
- cosmético não tratado: na página da sessão a última mensagem repete o prompt do usuário com marca
  de assistente. Não é desta SPEC; não toquei.

### Respostas-chave do usuário

- 2026-09-05 17:05 "faça o teste de ponta a ponta! usando playwrigth" — foi o teste que achou o bug
- 2026-09-05 18:32 "sim" à pergunta de abrir SPEC para o `CLAUDE_CONFIG_DIR`

### Tentativas que falharam

- primeira sessão de prova com `--session-id cfg11111-…`: recusada, `g` não é hex e o id tem que ser
  UUID válido.

### Arquivos tocados

- `public/agent/remote-agent.mjs` · `.gitignore` (saída do Playwright MCP) ·
  `docs/features/dashboard.md` · main.md

### Onde parei

Provado, gates limpos, banco limpo do lixo de teste (26 sessões, 0 duplicatas). Falta só o close.

### Sessões (máx 5 linhas + 1 agregada)

- 2026-09-05 18:33–18:41 — abertura, correção, prova no navegador e limpeza.

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

## 2026-09-05 18:40 — [nota] verify: 2/2 critérios passaram (commit `9c8917c`)

- PASS: Typecheck limpo | verify: `bunx tsc --noEmit`
- PASS: Lint limpo | verify: `bun run lint`
