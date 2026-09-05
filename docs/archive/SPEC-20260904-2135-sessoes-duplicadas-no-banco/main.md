# SPEC-20260904-2135: sessoes duplicadas no banco

**Status:** done
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-04 21:35
**Ativada:** 2026-09-05 16:41
**Concluída:** 2026-09-05 16:56
**Pausada em:** —
**Commit final:** `e304d14`
**Keywords:** dashboard
**Features:** dashboard
**Branch:** feat/sessoes-duplicadas-no-banco
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-04 21:35
**Resumo:** A mesma sessão de IA para de aparecer mais de uma vez no painel quando foi sincronizada por agentes diferentes.

## Objetivo

Durante a SPEC-20260904-2036 foram vistas, de passagem, linhas com o MESMO `external_id` sob `agent_id` diferentes. A unicidade de sessão hoje é por `(agent_id, external_id)`, não por `external_id` — então reinstalar o agente, rodar com um token novo ou rodar duas cópias na mesma máquina cria uma sessão nova no painel para a mesma sessão de IA. O usuário vê a sessão duplicada e não sabe qual está viva.

Isto é OBSERVAÇÃO, não diagnóstico: ninguém contou as linhas nem confirmou a causa. A primeira fase é medir.

## Escopo

**DENTRO:**
- Medir: quantas sessões duplicadas existem, sob quantos agentes, e o que as gerou.
- Decidir a chave de identidade correta de uma sessão de IA e aplicá-la.
- O que fazer com as duplicatas que já estão no banco.

**FORA:**
- Mudar o formato do payload de `/sync` — agente antigo tem que continuar funcionando.
- Deduplicar sessões de MÁQUINAS diferentes que por acaso tenham o mesmo id: são sessões distintas de verdade.

## Invariantes

- NUNCA fundir duas sessões que sejam de fato distintas: duplicata suspeita fica visível, não sumida.
- NUNCA apagar histórico de mensagem ao consolidar — a transcrição é o produto.
- NUNCA mudar o formato do payload.

## Implementação

Fase 1 é medição, com SQL de leitura no banco real:
- `external_id` com mais de um `agent_id`, e quantos agentes por usuário.
- Se as duplicatas têm mensagens nos dois lados ou só num.
- Se os agentes duplicados são reinstalações (token novo) ou cópias simultâneas.

**Fase 1 fechada em 2026-09-05 16:50** (medição no banco real — ver journal). A causa está provada:
dois registros de agente do MESMO usuário na MESMA máquina, criados com 3 minutos de diferença e
vivos ao mesmo tempo (`last_seen_at` a 15s um do outro), lendo os mesmos arquivos de transcrição.
Não é reinstalação com agente velho para trás.

**Decisão: chave por `(user_id, external_id)`.** As outras duas caíram por medição, não por gosto:

- "identidade estável de host" exigiria o agente mandar algo que identifique a máquina — e `agents`
  não tem campo nenhum para isso. É mudança de payload, que é FORA por invariante.
- "unicidade por `external_id`" fundiria `kiro:sess_169703b9-...`, que existe sob DOIS `user_id`
  diferentes. Seria vazar sessão de um usuário no painel do outro.

**A mudança é menor do que este contrato supunha:** `sessions.user_id` JÁ existe, preenchido nas 48
linhas, sem nenhuma divergência contra `agents.user_id`. Não há desnormalização a fazer. Sobra:

1. consolidar as 12 duplicatas (as duas metades têm conjuntos de mensagem IDÊNTICOS por
   `external_id` — é remoção de cópia, não fusão de conteúdo);
2. trocar `UNIQUE (agent_id, external_id)` por `UNIQUE (user_id, external_id)`;
3. trocar o `onConflict` do upsert em `sync.ts` para `user_id,external_id`.

O `agent_id` continua na linha e continua sendo mostrado: saber por qual agente a sessão entrou é
informação, e a última escrita ganha — que é o comportamento certo quando duas cópias do agente
sincronizam a mesma sessão.

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| `sessions` | `UNIQUE (agent_id, external_id)` → `UNIQUE (user_id, external_id)`. `user_id` já existe e já é escrito pelo `/sync`; nenhuma coluna nova. Migração consolida as duplicatas ANTES de criar a constraint. |
| `agents` | Nenhuma mudança. Identidade de máquina exigiria mudar o payload, que é FORA. |

## Riscos

- Migração que muda unicidade pode falhar com as duplicatas já existentes — mitigação: consolidar antes de criar a constraint, em migração dedicada.
- Consolidar errado funde sessões distintas e mistura transcrições — mitigação: a fase 1 tem que provar a causa antes de qualquer escrita; sem prova, resolver só na apresentação.

## Sinais de sucesso

- Uma sessão de IA aparece uma vez só no painel, e reinstalar o agente não cria uma segunda.

## Critério de aceite

- [x] Medido e registrado: quantas duplicatas, sob quantos agentes, e a causa provada (2026-09-05 16:55, commit `d7d749a`, evidence: 12 external_id duplicados sob 2 agentes do mesmo usuario, vivos ao mesmo tempo (last_seen a 15s); causa: duas copias do agente na mesma maquina, nao reinstalacao)
- [x] Uma sessão de IA aparece uma única vez no painel, com a causa tratada na raiz escolhida (2026-09-05 16:55, commit `d7d749a`, evidence: 48->36 sessions, 0 duplicatas, com os dois agentes sincronizando ao vivo durante e depois da migracao)
- [x] Nenhuma mensagem perdida na consolidação, conferido por contagem antes/depois (2026-09-05 16:55, commit `d7d749a`, evidence: conteudo distinto de mensagem 1824 antes e 1824 depois; a queda de 2354->1825 linhas e remocao de copia)
- [x] Payload inalterado: agente antigo continua funcionando (2026-09-05 16:55, commit `d7d749a`, evidence: agentes nao tocados nem reiniciados, seguiram sincronizando; so o onConflict do servidor mudou)
- [x] Typecheck limpo (2026-09-05 16:55, commit `d7d749a`, verify: exit 0) | verify: `bunx tsc --noEmit`
- [x] Lint limpo (2026-09-05 16:55, commit `d7d749a`, verify: exit 0) | verify: `bun run lint`
