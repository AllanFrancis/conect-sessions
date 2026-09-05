# Journal — SPEC-20260904-2135

## SNAPSHOT (sobrescrever — DEVE caber nas primeiras 60 linhas do arquivo)

**Última atualização:** 2026-09-05 16:44
**Onde tô:** início — nada feito ainda
**Próximo passo:** <primeiro passo concreto>
**Última decisão:** —
**Bloqueio atual:** nenhum
**Se retomar, ler:** main.md desta SPEC

### Fases
| # | Descrição | Status | Atualizado |
|---|---|---|---|
| 1 | <fase> | pendente | 2026-09-05 16:41 |

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

## 2026-09-05 16:41 — [ativação] SPEC ativada (branch feat/sessoes-duplicadas-no-banco, base main)

## 2026-09-05 16:44 — [descoberta] Fase 1 medida no banco real: a causa e duas registros de agente na MESMA maquina, nao reinstalacao

Medido no banco de produção em 2026-09-05 16:50 com SQL de leitura. Números, não impressão.

**O tamanho do problema**

    sessions ................................ 48
    external_id distintos ................... 27
    external_id com mais de uma linha ....... 12
    external_id com mais de um agent_id ..... 12   ← os 12 são o MESMO conjunto
    agents .................................. 3
    messages ................................ 2354

Toda duplicata é entre agentes diferentes. Nenhuma é do mesmo agente — ou seja, a unicidade
`UNIQUE (agent_id, external_id)` está sendo respeitada; ela é que é a chave errada.

**A causa, provada: dois agentes VIVOS na mesma máquina, não reinstalação**

Os três agentes:

    casa          | user 4573e0fa | criado 04/09 18:15 | last_seen 04/09 18:23 | 14 sessões | 1296 msgs
    Minha maquina | user b6eeb794 | criado 05/09 20:20 | last_seen 05/09 20:42 | 12 sessões |  529 msgs
    local         | user b6eeb794 | criado 05/09 20:23 | last_seen 05/09 20:42 | 22 sessões |  529 msgs

`Minha maquina` e `local` são do MESMO usuário, criados com 3 minutos de diferença e com
`last_seen_at` a 15 segundos um do outro. Não é "reinstalei e o velho ficou para trás": são duas
cópias rodando ao mesmo tempo, com tokens diferentes, lendo os mesmos arquivos de transcrição. Daí
os 529 = 529 e as 12 duplicatas.

**As duas metades são idênticas — consolidar não perde nada**

Para cada par duplicado com mensagens, conferido por `external_id` de mensagem:

    claude-code:d2b3ef12... | 102 | 102 | 102 em comum
    kiro:sess_169703b9...   | 364 | 364 | 364 em comum
    kiro:sess_896799a5...   |  63 |  63 |  63 em comum

Interseção total. Os outros 9 pares têm 0 mensagens dos dois lados. Nenhuma metade tem conteúdo que
a outra não tenha, então a consolidação é remoção de cópia, não fusão de conteúdo.

**Um caso que NÃO é duplicata e não pode ser tratado como tal**

`kiro:sess_169703b9-...` aparece também sob o agente `casa`, que é de **outro user_id**
(4573e0fa vs b6eeb794). Mesmo id nativo, usuários diferentes — provavelmente duas contas na mesma
máquina. Sob RLS eles nem se enxergam. Chave por `external_id` puro fundiria os dois: seria vazar
sessão de um usuário no painel do outro. Descarta a opção "unicidade por external_id".

**O que a medição elimina do leque de soluções**

- "Consolidar agentes da mesma máquina por identidade estável de host" — **impossível sem mudar o
  payload**, e mudar o payload é FORA por invariante. A tabela `agents` tem só
  `id, user_id, name, token_hash, token_prefix, last_seen_at, created_at`: não existe nada que
  identifique máquina, e o agente não manda nada disso.
- "Unicidade por `external_id`" — descartada pelo caso cross-user acima.

Sobra `(user_id, external_id)`, que trata exatamente o que foi medido (mesmo usuário, mesma máquina,
dois tokens) e preserva o que deve continuar separado (usuários diferentes). `sessions` não tem
`user_id` hoje — a unicidade em Postgres não atravessa join, então a chave exige desnormalizar
`user_id` para a tabela. Isso mexe em RLS e índice, então vai para o contrato antes de qualquer
código, como o main.md manda.

**Ainda em aberto:** duas máquinas do MESMO usuário com o mesmo `external_id`. Os ids nativos são
uuid (Claude e Kiro), então colisão por acaso não acontece; o caso real seria um `~/.claude` copiado
entre máquinas. Não medi — só tenho uma máquina no banco por usuário.
⎿ commit f159ab5
