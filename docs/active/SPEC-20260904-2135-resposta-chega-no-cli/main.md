# SPEC-20260904-2135: resposta chega no cli

**Status:** active
**Porte:** G
**Owner:** @AllanFrancis
**Criada:** 2026-09-04 21:35
**Ativada:** 2026-09-04 21:39
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** dashboard
**Features:** dashboard
**Branch:** feat/resposta-chega-no-cli
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-04 21:35
**Resumo:** A resposta enviada do celular deixa de morrer no console do agente e chega de fato à sessão de IA, inclusive desbloqueando um prompt de permissão.

## Objetivo

Hoje o round-trip entrega a resposta ao agente e para ali: o `deliverReplies()` imprime no console e, só se configurado, grava em `LRC_REPLY_FILE` ou roda `LRC_REPLY_CMD`. Quem está no celular vê "resposta enviada" e nada acontece na máquina. Em 2026-09-04 o usuário bateu nisso duas vezes em 20 minutos, a segunda com um prompt de permissão do Claude Code aberto: clicou "Always allow" no painel, a escolha chegou ao agente (console) e o terminal seguiu bloqueado. O painel é honesto — o card diz "escolha enviada ao agente — o terminal ainda precisa confirmar" —, mas a promessa útil é a outra.

## Escopo

**DENTRO:**
- Entregar o texto da resposta na sessão de IA que a originou, não só no console do agente.
- Caso do prompt de permissão (`AskUserQuestion` / aprovação de ação): é MODAL e bloqueante, e precisa de uma tecla, não de uma linha de texto. Se o caminho escolhido não cobrir isso, dizer explicitamente que não cobre.
- Descobrir e registrar QUAL é o caminho viável por IDE (Claude Code e Kiro têm superfícies diferentes) antes de implementar.

**FORA:**
- Websocket/Realtime — o round-trip do POST continua sendo o protocolo.
- Mudar o formato do payload de `/sync`.
- Prometer entrega em IDE que não tenha caminho comprovado: o que não for provável fica de fora e a UI não promete.

## Invariantes

- NUNCA prometer na UI o que não foi provado na máquina: se a injeção não é confiável para aquele IDE, o painel continua dizendo "enviada ao agente", não "respondida".
- NUNCA digitar em processo que não seja o da sessão que originou a resposta — o usuário tem duas máquinas e várias sessões por máquina; escrever no terminal errado é pior que não escrever.
- SEMPRE manter `LRC_REPLY_FILE`/`LRC_REPLY_CMD` funcionando: quem já depende deles não pode quebrar.

## Implementação

Porte G, e a primeira fase é INVESTIGAÇÃO, não código. O que já se sabe e limita o desenho:

- O Claude Code interativo não expõe porta de entrada externa. `claude --resume <id> -p "..."` abre um processo headless novo; ele NÃO fala com o terminal aberto, então não serve para desbloquear a sessão que o usuário está olhando.
- Sobra automação de janela no SO (no Windows, `SendKeys` para a janela do terminal por título/PID). Funciona, e é frágil por natureza: depende de foco, de layout de janela e do usuário não estar digitando.
- O agente já sabe o PID da sessão (o session monitoring prova vida por PID + start-time), então "qual processo" é uma pergunta que já tem resposta — o que falta é "como escrever nele".
- Hooks do Claude Code e o protocolo do Kiro são superfícies ainda não investigadas e podem ser o caminho limpo.

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| — | Nenhuma mudança prevista; a resposta já viaja com o `session_id` de origem desde a SPEC-20260904-2036. |

## Riscos

- Automação de teclado digita na janela errada se o foco mudar — mitigação: mirar por PID/handle, nunca por "janela ativa"; e não implementar se não der para mirar com segurança.
- Injetar texto numa sessão de IA é uma superfície de execução: quem tem o token do agente passa a poder digitar na máquina. Mitigação a desenhar — hoje o token já permite ler transcrições, mas escrever é um degrau acima.
- Pode não haver caminho confiável para algum IDE — mitigação: entregar por IDE, e a UI só promete onde foi provado.

## Sinais de sucesso

- O usuário clica uma opção no celular e o terminal na outra máquina sai do prompt sozinho, sem ele encostar no teclado.

## Critério de aceite

- [ ] Resposta enviada do painel aparece na sessão de IA de origem, provada com a sessão real rodando (não simulada)
- [ ] Prompt de permissão aberto é desbloqueado pela escolha feita no painel — OU está escrito no contrato que este caso ficou fora, e a UI não o promete
- [ ] Resposta para a sessão A nunca é digitada na sessão B, nem em outra máquina do mesmo usuário
- [ ] `LRC_REPLY_FILE` e `LRC_REPLY_CMD` continuam funcionando como hoje
- [ ] Typecheck limpo | verify: `bunx tsc --noEmit`
- [ ] Lint limpo | verify: `bun run lint`
