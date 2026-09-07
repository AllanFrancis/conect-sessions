# SPEC-20260906-1932: existe caminho para responder uma sessão do Kiro?

**Status:** draft
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-06 19:32
**Ativada:** —
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** kiro, hooks, injeção, entrega, investigação
**Features:** dashboard
**Branch:** —
**Programa:** entrega-remota
**Workspace:** —
**Origem:** usuário em 2026-09-06 19:32 ("3. Investigar numa SPEC própria")
**Resumo:** Descobrir, medindo, se há como uma resposta do painel chegar dentro de uma sessão do Kiro — e, se não houver, parar de oferecer botão que não leva a nada.

## Objetivo

Hoje a resposta enviada do painel para uma sessão do Kiro é lida do banco, marcada `delivered` e
**descartada**: o `entregarNaSessao()` do agente tem a guarda `if (agent !== "claude-code") return`. E
como o painel só desenha bolha para reply `pending`, no instante em que o agente descarta a bolha
desaparece da tela. A fala do usuário some sem nunca ter existido em lugar nenhum.

O `docs/features/dashboard.md` registra a decisão da SPEC-20260904-2135: "Kiro está fora: nenhuma
superfície de injeção equivalente foi encontrada, e o painel não promete entrega lá". A UI, porém,
desenha os botões clicáveis do `pending_interaction` do Kiro — o texto avisa que o terminal ainda
precisa confirmar, mas o botão é uma afordância, e o usuário em 2026-09-06 relatou justamente isso:
respondeu pelo Kiro e nada chegou.

Esta SPEC é primeiro INVESTIGAÇÃO. Ela pode terminar em "não há caminho" — e nesse caso a entrega é
alinhar a UI com a verdade, não implementar entrega.

## Escopo

**DENTRO:**

- Medir quais superfícies o Kiro oferece hoje. O que se sabe da documentação, e precisa ser
  CONFIRMADO na máquina, é que os hooks do Kiro se comportam diferente dos do Claude Code: a ação
  `agent` injeta prompt ESTÁTICO, o stdout de ação `command` só é aproveitado em `SessionStart`,
  `UserPromptSubmit` e `PreToolUse` (não em `Stop`), e o `permissionDecision` de `PreToolUse` aceita
  `ask` — não `allow`. Se isso se confirmar, o truque do `Stop` do Claude Code não transfere.
- Cobrir os dois casos separadamente, porque as superfícies são diferentes: **texto** numa sessão
  parada, e **escolha** num pedido de aprovação.
- Registrar o que foi descartado e POR QUÊ, com a medição. O valor desta SPEC é fechar becos, e beco
  fechado sem prova volta a ser tentado.
- Se não houver caminho: alinhar o painel. Botão que não leva a lugar nenhum sai, ou passa a dizer o
  que realmente faz. E a resposta para sessão do Kiro não pode ser marcada `delivered` e descartada em
  silêncio — se ela não tem para onde ir, o painel tem que dizer isso.

**FORA:**

- Automação de janela/teclado. Já foi medido e descartado na SPEC-20260904-2135 para o Claude Code
  pelo motivo estrutural (stdin é pipe, não há console nem janela); reconferir para o Kiro é DENTRO,
  reabrir a abordagem descartada não é.
- Status e visibilidade da sessão do Kiro no painel. É a
  SPEC-20260906-1932-kiro-aguardando-usuario-visivel.
- Modificar o Kiro, patchear a IDE ou depender de build não distribuído.
- Prometer entrega antes de provar. O invariante da SPEC-20260904-2135 continua valendo.

## Invariantes

- NUNCA prometer na UI o que não foi provado na máquina.
- NUNCA travar ou degradar uma sessão do Kiro do usuário durante a investigação: ele trabalha nessas
  sessões.
- NUNCA marcar como entregue uma resposta que foi descartada. Se não há destino, o estado tem que
  dizer isso.
- SEMPRE registrar medição, não dedução: o que não foi observado na máquina fica como dúvida em
  aberto, não como fato.

## Implementação

Fases, e a primeira não é código:

1. **Inventário das superfícies do Kiro**, confirmado na máquina: quais triggers existem, quais
   aproveitam stdout, o que `permissionDecision` aceita, se há forma de injetar texto dinâmico. O
   `.kiro/hooks/` deste próprio workspace serve de bancada.
2. **Texto em sessão parada.** Se nenhum trigger dispara em sessão idle (é o que acontece no Claude
   Code), a pergunta é se algum outro caminho acorda a sessão — e a resposta pode ser não.
3. **Escolha em pedido de aprovação.** O agente já detecta o pedido no log
   (`ToolApproval] Requesting permission`) e o Kiro grava `waiting_on_user`. Se `PreToolUse` só aceita
   `ask`, decidir remotamente pode ser estruturalmente impossível — e negar (`exit 2`) sem poder
   permitir é meio caminho que talvez não valha.
4. **Conclusão e alinhamento.** Implementar o que for possível; para o que não for, alinhar UI e
   estado da reply.

### Modelo de dados

| Entidade         | Campos / mudança                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `replies.status` | Provável estado para "sem destino nesta origem", se a conclusão for que Kiro não recebe. A decidir.   |
| Demais           | — a definir pela fase 1; investigação não decide schema antes de saber o que é possível.               |

## Riscos

- A investigação termina sem caminho e o esforço parece perdido — mitigação: beco fechado COM medição
  é entrega; o custo real é reabrir o mesmo beco a cada mês sem registro.
- Testar hooks do Kiro na máquina de trabalho do usuário pode atrapalhar sessões reais — mitigação:
  workspace de teste isolado, e nada armado por padrão nas sessões dele.
- Encontrar um caminho frágil e adotá-lo — mitigação: o invariante de não prometer o não-provado; meio
  funcionando é pior que declaradamente fora, porque a UI passa a mentir.

## Sinais de sucesso

- Fim da ambiguidade: ou o usuário responde uma sessão do Kiro pelo celular e ela anda, ou o painel diz
  com clareza que ali não dá — e ninguém mais toca num botão que não faz nada.

## Critério de aceite

- [ ] O inventário das superfícies de hook do Kiro está registrado com medição na máquina, não com dedução da documentação | verify: `manual @AllanFrancis`
- [ ] Cada abordagem descartada tem o motivo e a medição que a descartou registrados no journal | verify: `manual @AllanFrancis`
- [ ] Existe conclusão explícita, por caso (texto em sessão parada / escolha em aprovação): há caminho ou não há | verify: `manual @AllanFrancis`
- [ ] Onde houver caminho, ele foi provado em sessão real do Kiro | verify: `manual @AllanFrancis`
- [ ] Onde não houver, o painel deixa de oferecer a ação e a resposta não é mais marcada entregue e descartada em silêncio | verify: `manual @AllanFrancis`
- [ ] Nenhuma sessão de trabalho do usuário foi travada ou perdida durante a investigação | verify: `manual @AllanFrancis`
- [ ] Typecheck limpo | verify: `bunx tsc --noEmit`
- [ ] Lint limpo | verify: `bun run lint`
