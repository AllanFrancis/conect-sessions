# SPEC-20260906-1932: log do agente que existe em disco

**Status:** done
**Porte:** P
**Owner:** @AllanFrancis
**Criada:** 2026-09-06 19:32
**Ativada:** 2026-09-06 21:45
**Concluída:** 2026-09-06 23:56
**Pausada em:** —
**Commit final:** `a1384fc`
**Keywords:** agente, log, diagnóstico, observabilidade
**Features:** dashboard
**Branch:** feature/log-do-agente-observavel
**Programa:** entrega-remota
**Workspace:** —
**Origem:** usuário em 2026-09-06 19:32 ("5. SPEC nova")
**Resumo:** O agente instalado passa a deixar rastro em disco, para que a próxima falha de entrega seja lida em vez de adivinhada.

## Objetivo

`agent.log` e `agent.err.log` estão com **0 bytes** com o agente rodando há horas. O executável é
compilado com `--windows-hide-console`, e o `Start-Process -RedirectStandardOutput` do launcher não
recupera o que o processo sem console não escreve. Todas as linhas de diagnóstico que o código já
tem — `sync recusado: 401`, `sync falhou: fetch failed (ECONNRESET)`, `não consegui enfileirar a
resposta para o hook` — existem no fonte e não existem em lugar nenhum na máquina do usuário.

Medido em 2026-09-06: agente iniciado pelo launcher às 12:14:44, `agent.log` e `agent.err.log` com
`Length 0` às 19:45. O diagnóstico dos defeitos de entrega desta data teve que ser feito lendo estado
em disco e rodando o hook à mão, porque não havia log.

## Escopo

**DENTRO:**

- O agente grava o próprio log em arquivo, sem depender do redirecionamento do processo pai.
- Cobrir as linhas de diagnóstico que já existem no fonte, com o motivo real da falha (o
  `motivoDaFalha()` já extrai o `cause` do undici; ele precisa chegar a disco).
- Registrar a entrega: qual resposta foi escrita em qual inbox, e para qual sessão. É o rastro que
  faltou para separar "não chegou ao agente" de "chegou e ficou no inbox".
- Rotação por tamanho, no mesmo arquivo e no mesmo limite que o launcher já usa (2MB).
- Um jeito de desligar ou reduzir o log por variável de ambiente.

**FORA:**

- Enviar log ao servidor ou qualquer telemetria remota.
- Log do hook. O hook é silencioso por REGRA DE OURO (uma falha dele para o trabalho do usuário em
  todos os repositórios) e já tem `LRC_HOOK_DEBUG=1` para depuração pontual.
- Remover `--windows-hide-console` do build. Ele existe para o usuário não ganhar uma janela preta no
  logon; a correção é o agente escrever, não o console aparecer.
- Painel de logs na UI.

## Invariantes

- NUNCA gravar token, credencial ou o texto da resposta do usuário em claro no log. O arquivo fica em
  disco sem a proteção DPAPI que o `config.json` tem.
- SEMPRE fail-open: falha ao escrever log não pode derrubar o tick nem encerrar o agente. Log é
  instrumento, não função.

## Implementação

Escrita própria em append dentro do install root, com rotação por tamanho. Reusar os nomes
`agent.log`/`agent.err.log` que o launcher já rotaciona mantém uma superfície só e não invalida o
`install.log` nem o comando de reparo.

### Modelo de dados

| Entidade | Campos / mudança                                                    |
| -------- | ------------------------------------------------------------------- |
| Tabelas  | — nenhuma mudança.                                                  |
| Disco    | `agent.log` passa a ter conteúdo; formato de linha com timestamp UTC. |

## Riscos

- Log cresce sem limite numa máquina que fica ligada por semanas — mitigação: rotação por tamanho, no
  mesmo limite de 2MB que o launcher já aplica.
- Vazar conteúdo do usuário em disco — mitigação: registrar id da resposta, sessão de destino e
  tamanho; nunca o texto.

## Sinais de sucesso

- Na próxima vez que uma resposta não chegar, o motivo está no arquivo e ninguém precisa instrumentar
  a máquina para descobrir.

## Critério de aceite

- [x] Com o agente instalado e iniciado pelo launcher, `agent.log` tem conteúdo depois do primeiro tick (2026-09-06 23:55, commit `b01be9e`, evidence: windows-e2e.test.ts: binário compilado iniciado pelo launcher real; agent.log tem 'iniciado' e 'tick 1' (verde 2026-09-06 23:47, 12s))
- [x] Uma falha de sync (token inválido) aparece no log com o status HTTP e o motivo (2026-09-06 23:55, commit `b01be9e`, evidence: agent-log.test.ts:132 'grava o arranque e a falha de sync com status e motivo, sem o token' (bun test tests/installer verde))
- [x] Uma resposta escrita no inbox aparece no log com a sessão de destino e o id da resposta (2026-09-06 23:55, commit `b01be9e`, evidence: agent-log.test.ts:165 + windows-e2e: 'resposta reply-e2e enfileirada · sessão=<id> · bytes=38 · inbox=<arquivo>' no log do binário real)
- [x] O texto da resposta NÃO aparece no log (2026-09-06 23:55, commit `b01be9e`, evidence: windows-e2e: expect(agentLog).not.toContain(replyContent) + agent-log.test.ts:165; o log leva bytes=, o inbox leva o texto)
- [x] O token NÃO aparece no log (busca pelo valor em claro no arquivo volta vazia) (2026-09-06 23:55, commit `b01be9e`, evidence: windows-e2e: expect(agentLog).not.toContain(permanentToken) com token real de pareamento em disco; redação por construção antes da escrita)
- [x] O log rotaciona ao passar do limite e o agente continua rodando (2026-09-06 23:55, commit `b01be9e`, evidence: agent-log.test.ts:208 'rotaciona ao passar de 2MB e continua rodando' (.1, uma geração, agente segue vivo))
