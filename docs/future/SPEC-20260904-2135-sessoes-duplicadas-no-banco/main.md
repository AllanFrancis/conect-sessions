# SPEC-20260904-2135: sessoes duplicadas no banco

**Status:** draft
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-04 21:35
**Ativada:** —
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** dashboard
**Features:** dashboard
**Branch:** —
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

Só então decidir entre: chave por `(user_id, external_id)`; consolidar agentes da mesma máquina por uma identidade estável de host; ou tratar como apresentação, agrupando na UI sem tocar no banco. A escolha muda RLS e índices, então vai decidida no contrato antes de codar.

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| `sessions` | Possível mudança de unicidade (`agent_id` + `external_id` → outra chave) e do índice que a sustenta. A definir na fase 1. |
| `agents` | Talvez uma identidade estável de máquina, se a causa for reinstalação do agente. A definir. |

## Riscos

- Migração que muda unicidade pode falhar com as duplicatas já existentes — mitigação: consolidar antes de criar a constraint, em migração dedicada.
- Consolidar errado funde sessões distintas e mistura transcrições — mitigação: a fase 1 tem que provar a causa antes de qualquer escrita; sem prova, resolver só na apresentação.

## Sinais de sucesso

- Uma sessão de IA aparece uma vez só no painel, e reinstalar o agente não cria uma segunda.

## Critério de aceite

- [ ] Medido e registrado: quantas duplicatas, sob quantos agentes, e a causa provada
- [ ] Uma sessão de IA aparece uma única vez no painel, com a causa tratada na raiz escolhida
- [ ] Nenhuma mensagem perdida na consolidação, conferido por contagem antes/depois
- [ ] Payload inalterado: agente antigo continua funcionando
- [ ] Typecheck limpo | verify: `bunx tsc --noEmit`
- [ ] Lint limpo | verify: `bun run lint`
