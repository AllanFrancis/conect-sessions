# SPEC-20260906-1932: sessão do Kiro esperando o usuário fica visível no painel

**Status:** active
**Porte:** P
**Owner:** @AllanFrancis
**Criada:** 2026-09-06 19:32
**Ativada:** 2026-09-07 00:04
**Concluída:** —
**Pausada em:** —
**Commit final:** —
**Keywords:** kiro, status, waiting, painel, aprovação
**Features:** dashboard
**Branch:** feature/kiro-aguardando-usuario-visivel
**Programa:** entrega-remota
**Workspace:** —
**Origem:** usuário em 2026-09-06 19:32 ("4. SPEC nova")
**Resumo:** A sessão do Kiro parada esperando o usuário deixa de cair em `unknown` e passa a aparecer no painel, que é onde ela precisa aparecer.

## Objetivo

O Kiro grava `status: "waiting_on_user"` no `session.json` quando o turno para para perguntar algo.
O adaptador do Kiro no agente não tem braço para esse valor: ele cai no `else` final e vira
`status: "unknown"` com `confidence: "unknown"`. O dashboard consulta `.eq("status", "active")`.
Somados, os dois transformam a sessão que MAIS precisa de atenção remota na única que não aparece na
lista — o usuário só descobre indo até o computador, que é exatamente o que o produto existe para
evitar.

Medido em 2026-09-06 19:45 com `remote-agent.mjs --probe`:
`[UNKNOWN] kiro sess_896799a5-… · session.json status=waiting_on_user`. Valores de `status` presentes
em disco nesta máquina: `idle` (7), `in_progress` (2), `failed` (1), `waiting_on_user` (1).

## Escopo

**DENTRO:**

- Mapear `waiting_on_user` no adaptador do Kiro, nos DOIS braços da derivação: com instância viva e
  sem instância viva. Hoje só `in_progress`, `idle` e `failed` têm braço.
- Fazer a sessão nesse estado chegar ao painel. O caminho de dados já aceita: o zod de `/sync` já
  admite `"waiting"` e o `StatusDot` já tem cor para ele. O que bloqueia é o agente não emitir e a
  lista filtrar `active`.
- A aprovação de ferramenta do Kiro, que hoje o agente detecta (`ToolApproval] Requesting
  permission`) e joga só em `evidence[]` — um array que o `sessionPayload()` não envia. Decidir na
  SPEC se ela vira status `waiting` ou campo próprio, e registrar o porquê.

**FORA:**

- Entregar a resposta ou a escolha dentro do Kiro. Não há superfície comprovada; é a
  SPEC-20260906-1932-investigar-injecao-no-kiro.
- Revogar a DEC-20260904-1443 (lista só de ativas) de forma geral. Se a sessão em espera precisa
  aparecer, é por inclusão explícita DESSE estado na consulta, não por remover o filtro.
- Mudança de schema. Não há CHECK em `sessions.status` e `"waiting"` já passa pelo zod.

## Invariantes

- NUNCA afirmar "esperando você" sem prova em disco: `status` escrito pela própria aplicação ou linha
  de log da instância viva. Palpite por horário de modificação não serve.
- SEMPRE preservar o sentido de `unknown`: o que não se sabe continua `unknown`. Esta SPEC tira de
  `unknown` só o que passou a ser sabido.
- NUNCA marcar como viva uma sessão cujo Kiro não está rodando — a prova de vida por lock de log
  continua valendo antes de qualquer leitura de `status`.

## Implementação

Braço novo na cadeia de `declared` do adaptador do Kiro em `public/agent/remote-agent.mjs`, e
inclusão do estado na consulta do `dashboard.tsx`. O valor de transporte é `waiting`, que já existe
no contrato; `waiting_on_user` é o vocabulário do Kiro e não vaza para o payload.

Sem instância viva, `waiting_on_user` é estado terminal congelado (o Kiro morreu no meio da
pergunta), então segue a mesma regra de `idle`/`failed` e vira `finished` — não `waiting`, que
mentiria dizendo que ainda dá para responder.

### Modelo de dados

| Entidade                | Campos / mudança                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `sessions.status`       | Nenhuma mudança de schema. Passa a receber o valor `waiting`, já aceito pelo zod de `/sync`. |
| Payload de `/sync`      | Nenhuma mudança de forma.                                                                    |
| `evidence[]` do monitor | Segue local ao `--probe`; se a aprovação de ferramenta precisar chegar ao painel, é status.  |

## Riscos

- `waiting` já é usado como "valor legado de agente não atualizado" no mapa de cores do
  `terminal.tsx` — mitigação: conferir que passar a emiti-lo de propósito não conflita com essa
  leitura, e atualizar o comentário se ele deixar de ser verdade.
- Incluir mais um estado na lista pode reabrir o ruído que a DEC-20260904-1443 fechou — mitigação:
  incluir só `waiting`, não `idle`/`unknown`, e medir quantas linhas isso soma na prática.

## Sinais de sucesso

- Uma sessão do Kiro que fez uma pergunta aparece na lista do celular sem o usuário saber que ela
  existe — hoje ele só descobre chegando no computador.

## Critério de aceite

- [ ] Com uma sessão real do Kiro parada numa pergunta, `--probe` a mostra como `waiting` (hoje mostra `UNKNOWN`)
- [ ] Essa mesma sessão aparece na lista do painel, com o estado legível
- [ ] Sessão do Kiro com `waiting_on_user` em disco e nenhuma instância viva continua `finished`, não `waiting`
- [ ] Os outros estados observados em disco (`idle`, `in_progress`, `failed`) mantêm a derivação de hoje
- [ ] O que a SPEC decidiu sobre a aprovação de ferramenta (status ou campo) está escrito no journal como `[decisão]`
