# SPEC-20260906-1146: bootstrap sem bom

**Status:** done
**Porte:** P
**Owner:** @allan
**Criada:** 2026-09-06 11:46
**Ativada:** 2026-09-06 11:46
**Concluída:** 2026-09-06 11:55
**Pausada em:** —
**Commit final:** `8697429`
**Keywords:** dashboard
**Features:** dashboard
**Branch:** fix/bootstrap-sem-bom
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-06 11:46
**Resumo:** Servir o bootstrap sem BOM, porque ele é executado como string por [scriptblock]::Create() e o U+FEFF impede o parser de reconhecer o `<#` inicial.

## Objetivo

O comando único do painel falha em qualquer máquina: `[scriptblock]::Create()` recebe a string com um
U+FEFF na frente, não reconhece o `<#` da primeira linha, e passa a interpretar o cabeçalho de comentário
como código. Reproduzido em produção por @allan e isolado localmente. O BOM foi posto de propósito para o
PowerShell 5.1 ler `.ps1` em disco como UTF-8 — o que continua certo para os arquivos gravados, e é
errado para o bootstrap, que nunca toca o disco.

## Escopo

**DENTRO:**
- Servir o bootstrap sem BOM, mantendo o BOM nos payloads embutidos que vão para o disco.
- Cobrir o caminho real de execução (`[scriptblock]::Create`) em teste, que hoje só exercita `-File`.

**FORA:**
- Distribuição dos binários e do plugin (SPEC-20260906-1122); sem ela a instalação para no manifesto.
- Qualquer mudança no protocolo de pareamento, no agente ou no painel.

## Invariantes

<!-- propriedades que valem SEMPRE (antes/durante/depois) — linhas-vermelhas que QUALQUER mudança futura pode violar; distintas dos critérios (que checam o estado final). Estilo SEMPRE/NUNCA. P trivial: "—" -->
- SEMPRE gravar em disco com BOM o que o PowerShell 5.1 vai abrir por caminho (launcher, desinstalador,
  biblioteca de processo) — sem ele o acento das mensagens chega quebrado ao usuário.
- NUNCA entregar BOM no que é consumido como STRING por `[scriptblock]::Create()`.

## Implementação

`renderAgentInstaller` deixa de aplicar `withBom` ao próprio bootstrap; os três `__CONNECT_*_B64__`
continuam embutindo com BOM, porque o bootstrap os grava em disco. O teste do endpoint inverte a
asserção (hoje ele fixa o defeito, exigindo `charCodeAt(0) === 0xfeff`) e passa a exigir o oposto,
somando um caso que roda `[scriptblock]::Create()` sobre a saída renderizada.

### Modelo de dados

<!-- entidades/campos novos ou tocados (schema, tabelas, tipos); "—" se não há mudança de dados -->
| Entidade | Campos / mudança |
|---|---|
| — | Nenhuma mudança de dados. |

<!-- Alternativas (M/G): abordagens consideradas e REJEITADAS + porquê — evita reabrir becos sem saída. Decisão irreversível (porta de mão-única): marque [irreversível] p/ sinalizar mais escrutínio. -->

## Riscos

<!-- riscos técnicos/de segurança + mitigação (contrato estável — NÃO é progresso; decisões/fases vão no journal); P trivial: "—" -->
- Remover o BOM do lugar errado e quebrar o acento dos scripts em disco — mitigação: a mudança é só no
  bootstrap; os payloads embutidos seguem com BOM e o teste do endpoint prova os dois lados.

## Sinais de sucesso

<!-- como saberemos que a SPEC cumpriu o PROPÓSITO (não só a corretude dos critérios) — métrica/sinal observável; P: 1 linha -->
- O comando copiado do painel roda no PowerShell até o passo do manifesto, sem erro de parse.

## Critério de aceite

<!-- P: feche com: node scripts/specctl.mjs check <id> <n> -->
- [x] O bootstrap servido não começa com U+FEFF, os payloads embutidos continuam com BOM, e a saída de `renderAgentInstaller` é aceita por `[scriptblock]::Create()` sem erro de parse (2026-09-06 11:55, commit `8697429`, verify: exit 0) | verify: `bun run test:installer`
