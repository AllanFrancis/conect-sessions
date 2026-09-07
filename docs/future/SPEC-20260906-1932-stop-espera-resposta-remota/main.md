# SPEC-20260906-1932: a resposta remota chega na sessão parada

**Status:** draft
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-06 19:32
**Ativada:** —
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** hook, stop, inbox, entrega, claude-code, resposta remota
**Features:** dashboard
**Branch:** —
**Programa:** entrega-remota
**Workspace:** —
**Origem:** usuário em 2026-09-06 19:32 ("1. Nova SPEC")
**Resumo:** A resposta enviada do celular para uma sessão de Claude Code que já terminou o turno para de ficar no inbox até alguém digitar na máquina.

## Objetivo

A SPEC-20260904-2135 provou o canal de entrega e ele funciona — no turno em andamento. O `Stop` drena
o inbox UMA vez, sem esperar, e o `Stop` só dispara no fim de um turno. Quando o usuário responde
pelo celular, o turno já acabou: o `Stop` daquele turno rodou antes, achou o inbox vazio e saiu. A
partir daí nenhum dos quatro eventos registrados pelo plugin (`SessionStart`, `Stop`, `SessionEnd`,
`PreToolUse`) ocorre numa sessão parada esperando o usuário. A fala fica no arquivo até alguém digitar
na máquina — que é o relato literal do usuário em 2026-09-06: "minhas respostas são enviadas porém não
chega na sessão, aparece depois quando dou outro comando diretamente na sessão".

Agravante medido: o status é `active` só nos primeiros 60s desde a última atividade
(`idleMs < 60000`) e o dashboard lista apenas `active`. Na janela em que a sessão é alcançável pela
lista, o turno normalmente já terminou. O `--probe` de 19:45 mostrou a sessão de Claude no VS Code
como `[IDLE]`.

Segundo defeito, do mesmo caminho: o `/sync` marca `status = 'delivered'` no mesmo `UPDATE` em que
entrega a resposta ao agente, e o painel só desenha bolha para `pending`. No instante em que o agente
RECEBE (não entrega), a bolha "✳ enviada ao agente…" desaparece da tela. Visualmente é indistinguível
de sucesso.

## Escopo

**DENTRO:**

- Fazer a resposta chegar numa sessão de Claude Code que está parada esperando o usuário.
- Dar ao usuário do painel uma leitura honesta do que aconteceu com a resposta: hoje `delivered`
  significa "o agente pegou", e a bolha some como se tivesse chegado.
- O custo da abordagem escolhida tem que ser explícito no contrato. Se a saída for esperar no `Stop`,
  quem está sentado na máquina paga essa espera em cada turno, e isso é decisão do usuário, não
  detalhe de implementação.
- Prova em sessão real, não simulada — mesmo padrão da SPEC-20260904-2135: a bateria de hoje
  (`tests/plugin/hook-runtime.test.ts`, 51/51 verde) semeia o inbox ANTES do `Stop` e por isso nunca
  viu este defeito. Teste que reproduza a ORDEM que falha é parte da entrega.

**FORA:**

- Kiro. Sem superfície comprovada; é a SPEC-20260906-1932-investigar-injecao-no-kiro.
- Prompt de permissão. É a SPEC-20260906-1932-permissao-remota-ponta-a-ponta: quando o modal está
  aberto o turno não terminou, e o `Stop` não é o evento certo.
- Websocket/Realtime. O round-trip por POST continua sendo o protocolo.
- Reverter a DEC-20260904-2100 (entrega no máximo uma vez). Se a leitura de estado precisar de ack, é
  decisão a registrar, não premissa desta SPEC.

## Invariantes

- NUNCA travar uma sessão de Claude Code. O hook roda em toda sessão da máquina a cada turno; falha
  dele termina em `exit 0` sem saída, e `LRC_HOOK=0` desliga sem desinstalar.
- NUNCA perder uma fala que o painel disse ter enviado. A drenagem por `rename` atômico existe por
  isso e continua valendo: se a entrega não aconteceu, a fala tem que continuar entregável.
- NUNCA escrever na sessão errada. O hook roda dentro da sessão de destino; nada nesta SPEC pode
  introduzir um caminho que enderece sessão por fora do `session_id` do próprio evento.
- SEMPRE degradar para o comportamento de hoje quando o recurso estiver desligado ou estourar prazo.

## Implementação

Alto nível, a decidir na SPEC com medição:

- **Candidata principal: janela de espera no `Stop`.** Simétrica ao que o `PreToolUse` já faz para
  permissão. O orçamento existe e foi dimensionado antes: `hooks.json` declara `timeout: 130` no
  `Stop` e o wrapper tem `$defaultTimeoutMilliseconds = 125000`. O hook ficaria lendo o inbox até a
  resposta chegar ou o prazo virar; prazo estourado sai calado e o turno acaba como sempre acabou.
  Custo: a sessão fica com aparência de "trabalhando" por até N segundos depois de cada turno, na
  máquina de quem está sentado nela. Isso exige chave e padrão conservador, no mínimo do mesmo nível
  do `LRC_PERM`.
- **A investigar antes de escolher:** existe evento do Claude Code que dispare em sessão parada, ou
  forma de o agente acordar a sessão sem passar por hook? Se existir, é melhor que esperar, porque
  não cobra nada de quem está na máquina. A SPEC-20260904-2135 mediu que não há console, janela nem
  teclado para simular — mas mediu isso para injeção de texto, não para acordar o turno.
- **Leitura de estado no painel:** separar "o agente pegou" de "a sessão recebeu". Hoje há um estado
  só (`delivered`) fazendo os dois papéis, e é por isso que a bolha some sem nada ter chegado.

### Modelo de dados

| Entidade                     | Campos / mudança                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `replies.status`             | Possivelmente um estado a mais entre `pending` e `delivered`, para a bolha parar de sumir antes da hora. A decidir.    |
| `~/…/state/inbox/*.jsonl`    | Nenhuma mudança de formato. O contrato append/rename continua.                                                         |
| `plugins/…/hooks/hooks.json` | Timeout do `Stop` possivelmente revisto conforme a janela escolhida.                                                  |

## Riscos

- A espera no `Stop` incomoda quem está na máquina e o usuário desliga o recurso — mitigação: padrão
  conservador, prazo curto por default, e saída imediata quando não há nada esperando.
- Sessão que fica "trabalhando" depois do turno pode confundir a própria derivação de status do
  monitor (`idleMs < 60000`), fazendo o painel mentir sobre atividade — mitigação: conferir a
  interação entre a janela de espera e a derivação de `active`/`idle` antes de fechar.
- Estado novo em `replies` mexe num caminho já provado sob concorrência (o `UPDATE ... RETURNING` da
  SPEC-20260904-2036) — mitigação: qualquer mudança ali tem que preservar a atomicidade de marcar e
  devolver num comando só.

## Sinais de sucesso

- O usuário responde do celular a uma sessão que está parada e a sessão continua sozinha, sem ele
  encostar no teclado da máquina.

## Critério de aceite

- [ ] Resposta enviada do painel para uma sessão de Claude Code que JÁ terminou o turno chega nela, provado em sessão real | verify: `manual @AllanFrancis`
- [ ] Teste automatizado cobre a ordem que falha hoje (resposta entra no inbox DEPOIS do `Stop`) e falha contra o código atual | verify: `bun test tests/plugin`
- [ ] O custo da abordagem para quem está na máquina está escrito no contrato, com o padrão e a chave de desligar
- [ ] Com o recurso desligado, o comportamento é byte a byte o de hoje | verify: `bun test tests/plugin`
- [ ] A bolha no painel deixa de desaparecer antes de a sessão ter recebido | verify: `manual @AllanFrancis`
- [ ] Nenhuma sessão de Claude Code trava ou perde turno durante a validação | verify: `manual @AllanFrancis`
- [ ] Typecheck limpo | verify: `bunx tsc --noEmit`
- [ ] Lint limpo | verify: `bun run lint`
