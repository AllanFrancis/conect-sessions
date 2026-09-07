# SPEC-20260906-1932: pedido de permissão vai e volta pelo painel

**Status:** draft
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-06 19:32
**Ativada:** —
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** permissão, pretooluse, pending, claude-code, instalador, painel
**Features:** dashboard
**Branch:** —
**Programa:** entrega-remota
**Workspace:** —
**Origem:** usuário em 2026-09-06 19:32 ("2. Nova SPEC")
**Resumo:** O canal de permissão do Claude Code, que existe no código e nasce desligado sem nada que o ligue, passa a ser alcançável — e o pedido aparece no painel antes de o usuário ter que adivinhar que existe.

## Objetivo

O canal existe e funciona: o `PreToolUse` do hook publica o pedido em `state/pending/`, espera a
escolha chegar ao inbox e devolve `permissionDecision`. Foi provado na SPEC-20260904-2135. Só que ele
exige `LRC_PERM=1`, e **nada no produto instalado define essa variável** — nem o `launcher.ps1`, nem o
`invoke-hook.ps1`, nem o `install-agent.ps1`. Não há chave no painel. O recurso é inalcançável para
quem instalou pelo comando único.

Medido em 2026-09-06 rodando o hook real: com o ambiente padrão o `PreToolUse` volta vazio em 50ms e
não publica `pending/`; com `LRC_PERM=1` ele decide `allow` corretamente em 55ms. A consequência
prática está no disco da máquina — a escolha `"Sim abra"` do usuário ficou no inbox como texto comum,
para ser entregue depois como fala, em vez de virar decisão.

A segunda metade é o caminho de volta: o painel nunca sabe que a sessão está esperando permissão. O
`pending/` que o hook escreve não é lido pelo agente e não existe campo para ele no
`sessionPayload()`. O usuário só descobre que a sessão parou indo até o computador.

## Escopo

**DENTRO:**

- Tornar o canal de permissão alcançável: alguém tem que ligar o `LRC_PERM` de propósito, e hoje não
  há como. Instalador, launcher e uma chave no painel são os candidatos.
- Levar o pedido pendente ao painel: `state/pending/` lido pelo agente e transportado ao servidor,
  para o painel mostrar "esta sessão está esperando uma escolha" antes de o usuário perguntar.
- A escolha do painel voltar como DECISÃO, não como texto. O classificador conservador do hook
  (`decisaoDe()`) já existe: só o inequivocamente afirmativo vira `allow`, o resto volta ao inbox.
  Preservar essa conservadoria é requisito, não detalhe.
- O custo explícito: o `PreToolUse` armado BLOQUEIA a sessão local pelo prazo da espera antes de abrir
  o modal (medido: `LRC_PERM_WAIT=3` bloqueou 3116ms). Quem está na máquina paga isso. O padrão e a
  chave são decisão do usuário.

**FORA:**

- Kiro. O `pending_interaction` do Kiro já chega ao painel pela transcrição e já desenha botões, mas
  não há canal de volta; isso é a SPEC-20260906-1932-investigar-injecao-no-kiro.
- Entrega de TEXTO em sessão parada. É a SPEC-20260906-1932-stop-espera-resposta-remota; aqui o modal
  está aberto e o turno não terminou, então o evento é outro.
- Notificação push. Fazer o pedido aparecer no painel é o escopo; avisar o celular ativamente não é.
- Ampliar o que o token do agente autoriza. O risco já registrado na SPEC-20260904-2135 (quem tem o
  token passa a poder digitar na máquina) continua em aberto e não é resolvido aqui.

## Invariantes

- NUNCA transformar em `allow` algo que não seja inequivocamente afirmativo. Chutar aqui é autorizar
  uma ação que ninguém autorizou.
- NUNCA deixar a sessão travada além do prazo: prazo estourado abre o modal como sempre abriu, e quem
  está na máquina decide. O pior caso tem que continuar sendo o comportamento de hoje.
- NUNCA perder a fala: o que não for decisão volta ao inbox e chega como texto, na ordem em que foi
  escrito.
- SEMPRE poder desligar sem desinstalar.

## Implementação

Duas frentes, e a ordem importa: ligar o canal sem mostrar o pedido no painel entrega um recurso que
bloqueia a máquina e não avisa ninguém.

- **Alcançabilidade.** Decidir onde o `LRC_PERM` é armado. O `invoke-hook.ps1` já é o lugar que injeta
  ambiente no hook (`LRC_STATE_DIR`), e o `config.json` da instalação já é lido pelo launcher — os
  dois são candidatos naturais para uma preferência que o usuário controla pelo painel. Registrar a
  escolha e o porquê.
- **Pedido pendente até o painel.** O agente passa a ler `state/pending/` no tick e a reportar. O
  transporte é o `/sync`, e o `meta` aditivo (DEC-20260904-1658) é o precedente de como somar
  informação sem mudar contrato. Cuidado com o ciclo de vida: o arquivo é apagado no `finally` do
  hook, então "pedido sumiu" é informação válida (foi decidido na máquina) e não pode ficar preso na
  tela.
- **Volta.** Nada novo: a escolha já viaja como reply comum e o hook já classifica. O que muda é o
  canal estar ligado e o usuário saber que há algo esperando.

### Modelo de dados

| Entidade                | Campos / mudança                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sessions`              | Provável campo aditivo para "esperando escolha" (ferramenta, desde quando, prazo). A decidir na SPEC.          |
| Payload de `/sync`      | Aditivo, no espírito da DEC-20260904-1658: agente antigo continua funcionando.                                 |
| `state/pending/*.json`  | Formato já existe (`session_id`, `tool_name`, `tool_use_id`, `cwd`, `since`, `espera_ate`). Passa a ser lido. |
| Preferência de instalação | Onde mora o "armar permissão" — `config.json` e/ou coluna em `agents`. A decidir.                           |

## Riscos

- Espera armada por padrão travaria a máquina de quem não pediu — mitigação: nasce desligado, e ligar é
  ato explícito de quem sabe que vai sair de perto.
- Pedido pendente exibido no painel depois de já resolvido na máquina vira botão mentiroso — mitigação:
  o `pending/` tem `espera_ate`; expirar na leitura, não só na escrita.
- Superfície de execução: decidir permissão remotamente é mais forte que ler transcrição. O risco de
  token já está registrado na SPEC-20260904-2135 e permanece aberto — mitigação a desenhar; no mínimo
  não ampliar o alcance sem registrar.
- Mexer no `invoke-hook.ps1` toca o caminho que roda em TODA sessão de Claude Code da máquina —
  mitigação: o wrapper é fail-open e o `tests/plugin/plugin-contract.test.ts` já guarda esse contrato.

## Sinais de sucesso

- O usuário vê no celular que a sessão pediu permissão, toca a opção, e a sessão segue — sem ele
  descobrir o bloqueio só ao voltar para o computador.

## Critério de aceite

- [ ] Numa instalação feita pelo comando único, o canal de permissão pode ser ligado sem editar variável de ambiente à mão | verify: `manual @AllanFrancis`
- [ ] Com o canal ligado, o pedido de permissão aparece no painel identificando a ferramenta e a sessão | verify: `manual @AllanFrancis`
- [ ] A escolha feita no painel destrava a sessão real, sem ninguém tocar no teclado da máquina | verify: `manual @AllanFrancis`
- [ ] Texto que não é decisão continua voltando ao inbox e chegando como fala, na ordem | verify: `bun test tests/plugin`
- [ ] Prazo estourado abre o modal na máquina como hoje, e a sessão não fica travada | verify: `bun test tests/plugin`
- [ ] Com o canal desligado, o comportamento é o de hoje e o `PreToolUse` não espera nada | verify: `bun test tests/plugin`
- [ ] Pedido já resolvido na máquina deixa de ser oferecido como botão no painel | verify: `manual @AllanFrancis`
- [ ] Typecheck limpo | verify: `bunx tsc --noEmit`
- [ ] Lint limpo | verify: `bun run lint`
