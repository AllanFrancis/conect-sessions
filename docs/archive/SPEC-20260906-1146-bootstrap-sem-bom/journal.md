# Journal — SPEC-20260906-1146

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-06 11:55
**Onde tô:** corrigido e provado — bootstrap servido sem BOM, E2E usando `irm` + scriptblock
**Próximo passo:** fechar, mergear e fazer deploy; depois SPEC-20260906-1122 para o release existir
**Última decisão:** BOM só no que vai ao disco; o bootstrap é string e não pode tê-lo
**Bloqueio atual:** nenhum aqui; a instalação ainda para no manifesto por causa da SPEC-20260906-1122
**Se retomar, ler:** main.md e a entrada de conclusão no LOG

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | Diagnóstico, correção e teste do caminho real | concluída | 2026-09-06 11:54 |

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

## 2026-09-06 11:46 — [ativação] SPEC criada e ativada (@allan, branch fix/bootstrap-sem-bom, base main)

## 2026-09-06 11:54 — [conclusão] BOM removido do bootstrap; E2E passa a usar o caminho real

Bug relatado por @allan testando em produção: o comando único falhava no parse, com
"Missing closing ')'" apontando para um parêntese que está DENTRO do cabeçalho de comentário.

Causa provada, não inferida. O endpoint servia `ef bb bf 3c 23` — BOM antes do `<#` — com
`Content-Type: text/plain; charset=utf-8`. O `irm` decodifica com UTF8.GetString, que NÃO remove o
U+FEFF, então ele vira o primeiro caractere da string entregue a `[scriptblock]::Create()`. Com ele na
frente o parser não reconhece o `<#` da linha 1 e passa a ler o comentário como código. Reproduzido
isolado: a mesma string sem BOM tem o comentário honrado; com BOM falha na linha 2.

gotcha (dashboard): BOM é obrigatório para `.ps1` que o PowerShell 5.1 ABRE POR CAMINHO (senão lê como
ANSI e todo acento chega quebrado) e é fatal para script entregue como STRING a
`[scriptblock]::Create()`. As duas coisas são verdadeiras ao mesmo tempo, e o mesmo repositório precisa
das duas: launcher, desinstalador e biblioteca de processo continuam embutidos com BOM porque o
bootstrap os grava em disco; o bootstrap perdeu o dele porque nunca toca o disco.

Causa-raiz de por que 41 testes ficaram verdes com a produção quebrada: TODA suíte gravava o bootstrap
em arquivo e o executava com `-File` — o modo em que o BOM é necessário. Nenhuma exercitava `irm` +
`[scriptblock]::Create()`, que é o único modo que o produto usa. O teste do endpoint chegava a FIXAR o
defeito, exigindo `charCodeAt(0) === 0xfeff`.

Corrigido nos dois níveis: `renderAgentInstaller` usa `withoutBom` no bootstrap, e o `windows-e2e` passa
a servir o script pelo caminho real (`/api/public/agent/install.ps1`, headers de produção) e a invocá-lo
com o mesmo one-liner que o painel entrega. Antes de aceitar a correção, reverti-a e confirmei que o
teste novo falha em "No linha:2 caractere:79" — a MESMA posição do erro que chegou da máquina do usuário.

Gates: 95 testes em 15 arquivos, typecheck, lint 0 erros, build e diff-check.

Fica registrado o que esta SPEC NÃO resolve: com o parse consertado, a instalação avança até o download
do manifesto e para lá, porque o repositório é privado e não há release. Isso é SPEC-20260906-1122.
⎿ commit 8697429+dirty · 3 files changed, 96 insertions(+), 19 deletions(-)

## 2026-09-06 11:55 — [nota] verify: 1/1 critérios passaram (commit `8697429`)

- PASS: O bootstrap servido não começa com U+FEFF, os payloads embu…
