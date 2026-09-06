# SPEC-20260906-1122: distribuicao release publica

**Status:** discarded
**Porte:** M
**Owner:** @allan
**Criada:** 2026-09-06 11:22
**Ativada:** —
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** dashboard, release, plugin, marketplace, distribuição, GitHub
**Features:** dashboard
**Branch:** —
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-06 11:22
**Resumo:** Distribuir agente e plugin por um repositório público só de releases, para o comando único funcionar sem abrir o código-fonte.

## Objetivo

O instalador de SPEC-20260905-2251 baixa `releases/latest/download/agent-manifest.json` com
`Invoke-WebRequest` sem credencial, e o `claude plugin marketplace add` assume acesso anônimo ao
repositório. Como `AllanFrancis/conect-sessions` é privado, os dois recebem 404 e o comando único não
funciona em nenhuma máquina que não seja a de desenvolvimento. Esta SPEC move plugin e binários para um
repositório público dedicado, mantendo o código-fonte privado.

## Escopo

**DENTRO:**
- Repositório público novo contendo apenas o manifesto do marketplace, o plugin do Claude Code e os
  releases com os dois executáveis.
- Publicação automatizada do repositório privado para o público, sem passo manual.
- Atualização das URLs consumidas pelo instalador e pelo comando de marketplace.
- Garantia de que a versão publicada bate com a do agente, do plugin e da constante do painel.

**FORA:**
- Tornar `AllanFrancis/conect-sessions` público.
- Assinatura comercial do executável, Winget ou Microsoft Store.
- Servir os binários pelo próprio app (alternativa considerada e rejeitada abaixo).
- Qualquer mudança no protocolo de pareamento ou no `/sync`.

## Invariantes

- NUNCA publicar código-fonte, `.env`, migrations ou documentação interna no repositório público.
- NUNCA guardar no repositório público qualquer segredo; ele contém só artefato e manifesto.
- SEMPRE publicar as duas plataformas de um release juntas, com SHA-256, ou não publicar nenhuma —
  manifesto apontando para binário inexistente quebra instalação no meio, depois do pareamento.
- SEMPRE manter versão única entre agente, hook, plugin e a constante do painel.

## Implementação

Um repositório público novo (nome a definir na ativação) recebe `.claude-plugin/marketplace.json` e
`plugins/conect-sessions/`, e passa a ser o alvo dos releases `agent-v*`. O workflow que hoje publica em
`AllanFrancis/conect-sessions` passa a publicar no público, usando credencial com escopo restrito a esse
repositório. O instalador troca a URL padrão do manifesto e o comando de marketplace passa a citar o
repositório novo.

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| — | Nenhuma mudança de banco. |

Alternativas rejeitadas: **tornar o repositório atual público** — resolveria em um clique, mas expõe
código, histórico e documentação interna, e o usuário optou por não fazê-lo. **Servir manifesto e
binários pelo próprio app** — elimina o GitHub da rota de download, mas não resolve o
`claude plugin marketplace add`, que exige um repositório git alcançável, e colocaria dezenas de MB de
executável no caminho do Cloudflare a cada instalação. **Publicar o plugin no marketplace oficial da
Anthropic** — está fora de escopo desde a SPEC anterior.

## Riscos

- Credencial de publicação cruzada entre repositórios — mitigação: token de escopo mínimo, restrito ao
  repositório público, guardado como secret e usado só no job de release, que já é isolado.
- Divergência entre o plugin publicado e o código privado — mitigação: publicação automatizada a partir
  da fonte única, sem edição manual no repositório público.
- Quarta cópia da versão do agente — mitigação: estender `tests/onboarding/version-contract.test.ts`,
  que hoje amarra painel, agente e plugin, para cobrir o que for publicado.
- Repositório público sugere que o produto é open source — mitigação: README curto dizendo que ali só
  moram artefatos de distribuição.

## Sinais de sucesso

- Uma máquina Windows limpa, sem credencial de GitHub, completa o comando único do painel.
- `claude plugin marketplace add` funciona sem login e o hook responde na sessão.
- Nenhum arquivo de código-fonte aparece no repositório público.

## Critério de aceite

- [ ] O repositório público contém apenas marketplace, plugin e releases, sem código-fonte nem segredo | verify: `<comando na ativação>`
- [ ] O manifesto e os dois executáveis de um release são baixáveis sem credencial | verify: `<comando na ativação>`
- [ ] O instalador e o comando de marketplace apontam para o repositório público | verify: `bun run test:installer && bun run test:plugin`
- [ ] Agente, hook, plugin e a constante do painel declaram a mesma versão, inclusive no que é publicado | verify: `bun run test:onboarding`
- [ ] Uma instalação real em Windows sem credencial de GitHub conecta o agente e entrega uma resposta | evidence: manual @allan

## Justificativa de descarte

Premissa caiu: o usuário tornou AllanFrancis/conect-sessions público em 2026-09-06, então o download anônimo e o marketplace do plugin funcionam pelo repositório atual e a techspec original volta a valer sem mudança. (2026-09-06 12:11)
