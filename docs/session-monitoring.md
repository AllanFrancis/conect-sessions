# Session Monitoring — descoberta confiável de sessões de Claude Code e Kiro no Windows

> Investigado e validado em 2026-09-04, Windows 11 Pro 26200, Claude Code 2.1.259
> (extensão `anthropic.claude-code` no VS Code) e Kiro (build de 2026-09-04).
> Implementação: [public/agent/remote-agent.mjs](../public/agent/remote-agent.mjs).

O princípio que guia tudo aqui: **existir um processo, um arquivo ou uma pasta não é
prova de que existe uma sessão.** Cada estado publicado precisa de evidência cruzada.
O que não puder ser provado sai como `unknown` — nunca como um palpite.

Rodar `node remote-agent.mjs --probe` imprime o que o monitor enxerga, com as
evidências de cada linha, para conferência direta contra as abas abertas na IDE.

---

## 1. Como as sessões do Claude Code são detectadas

### Fonte primária — registro por PID

O Claude Code escreve **um arquivo por processo** em `~/.claude/sessions/<pid>.json`:

```json
{
  "pid": 24420,
  "sessionId": "09e98477-e190-427a-9454-713ba2abe45f",
  "cwd": "c:\\dev\\meus projetos\\conect-sessions",
  "startedAt": 1788540448749,
  "procStart": "134330140480662610",
  "version": "2.1.259",
  "entrypoint": "claude-vscode",
  "kind": "interactive",
  "messagingSocketPath": "\\\\.\\pipe\\LOCAL\\cc-msg-0f28018e0acbc363750ae5893ac8a438",
  "name": "conect-sessions-2e"
}
```

Isto dá de graça: session id nativo, projeto, horário de início e o PID.

### Prova de vida — PID **e** `procStart`

`procStart` é o FILETIME de criação do processo (100 ns desde 1601). A sessão só é
considerada viva quando:

1. existe um processo com aquele PID;
2. o start-time dele é **idêntico** ao `procStart` gravado;
3. o nome da imagem é `claude.exe`.

O item 2 é o que elimina reuso de PID: o Windows recicla PIDs, e sem essa checagem
um processo qualquer que herdasse o número 24420 seria contado como sessão.

**Cuidado de precisão medido na prática:** `Win32_Process.CreationDate` (WMI) trunca
em microssegundos e diverge do valor gravado. Para o PID 44280 o arquivo dizia
`134330139741265103` e o WMI devolveu `134330139741265100` — 3 ticks de diferença.
`Get-Process.StartTime.ToFileTime()` (que usa `GetProcessTimes`) bateu exato nos dois
processos. O monitor lê pelo `Get-Process` e ainda assim compara com tolerância de
1 ms, folgada para a truncagem e impossível para reuso de PID.

O valor também **não cabe em `Number`** (1,34 × 10¹⁷ > 2⁵³): é transportado como
string e comparado com `BigInt`.

### IDE de origem — cadeia de processos até o dono do lock

`~/.claude/ide/<porta>.lock` é escrito pela extensão:

```json
{ "pid": 8804, "workspaceFolders": ["c:\\dev\\meus projetos\\conect-sessions"],
  "ideName": "Visual Studio Code", "transport": "ws", "runningInWindows": true }
```

O `pid` é o da **IDE**, não o da sessão. A ligação se faz subindo a cadeia de pais do
`claude.exe` até encontrar um ancestral que seja dono de um lock vivo:

```
claude.exe(24420) <- Code.exe(43064, extension host) <- Code.exe(8804) <- explorer.exe
                                                        ^^^^ == pid do lock 39306.lock
```

Isso é atribuição por evidência, não por heurística de caminho. Vale para Claude Code
rodando **dentro do Kiro** também: o Kiro (PID 21816) mantém seu próprio lock com
`"ideName": "Kiro"`, e a mesma cadeia resolve corretamente.

O campo `entrypoint` (`claude-vscode`) diz apenas a *família*, não qual IDE concreta —
por isso não é usado para afirmar a IDE, só para registrar `CLI` quando é terminal.

### Atividade e evidência corroborante

- Transcrição: `~/.claude/projects/<cwd-codificado>/<sessionId>.jsonl`. O monitor
  **procura pelo nome do arquivo** (`<sessionId>.jsonl`) em vez de recalcular a
  codificação da pasta, que é ambígua (não dá para distinguir um `-` do caminho
  original de um separador convertido). O `mtime` dá `last_activity_at`.
- Pipe IPC: `messagingSocketPath` conferido contra os pipes abertos em `\\.\pipe\`.
  Corrobora, não decide sozinho.

### Estados

| Situação | Status |
| --- | --- |
| processo vivo + procStart bate + transcrição < 60 s | `active` |
| processo vivo + procStart bate + transcrição parada | `idle` |
| PID ausente, ou presente com outro start-time | `finished` |
| snapshot de processos indisponível | `unknown` |

---

## 2. Como as sessões do Kiro são detectadas

O Kiro **não** tem processo por sessão — todas vivem dentro da mesma IDE. A detecção
é por arquivo + prova de vida da instância.

### Fontes

- `~/.kiro/sessions/<wsHash>/sess_<uuid>/session.json` — a própria aplicação grava
  `status` (`in_progress` | `idle` | `failed`), `createdAt`, `lastModifiedAt`,
  `title`, `workspacePaths`, `modelId`, `agentMode`. Isto é muito melhor que
  heurística de mtime: é o estado declarado pelo autor do dado.
- `~/.kiro/session-index/<wsHash>.jsonl` — log append-only de `{op:"add"|"remove",
  sessionPath, at}`. Dá criação e, principalmente, **remoção** (fim confirmado).
- `~/.kiro/sessions/.../messages.jsonl` — `mtime` como atividade.
- `~/.kiro/workspace-roots/<wsHash>/.trust-migration.json` — mapeia o hash para o
  caminho real. **Não usado**: é artefato de migração e pode não existir. O
  `session.json` já carrega `workspacePaths`, que é autoritativo.

### Prova de vida da instância

1. `%APPDATA%\Kiro\code.lock` contém o PID do processo principal (medido: `21816`),
   validado contra a tabela de processos e o nome `Kiro.exe`.
2. **Qual** instância é a viva: cada execução cria `~/.kiro/logs/<timestampUTC>/kiro.log`
   e mantém o arquivo com **handle exclusivo**. Uma tentativa de abrir com
   `FileShare.None` falha no log da instância viva e funciona nos antigos — testado
   nos dois casos. Isso identifica a execução corrente sem comparar horários.

### Posse da sessão pela instância viva

O `kiro.log` carrega `rootConversationId` = session id em cada evento. Uma sessão
que aparece no log da instância travada pertence àquela execução.

`status: in_progress` **sozinho não prova nada**: se o Kiro morrer no meio de um
turno o arquivo congela nesse valor para sempre. Só vira `active` com a instância
viva confirmada e a sessão presente no log dela.

### O caso honesto que virou `unknown`

Uma sessão do Kiro pode estar **com a aba aberta e intocada** nesta execução — nunca
aparece no log, e é indistinguível de uma aba fechada. Medido: `sess_6dbed42c` no
mesmo workspace aberto (`c:\dev\vinci-stack`) que a sessão ativa.

Para separar os casos o monitor lê as pastas realmente abertas em
`%APPDATA%\Kiro\User\globalStorage\storage.json`
(`windowsState.lastActiveWindow`, `windowsState.openedWindows`,
`backupWorkspaces.folders`):

| Instância viva | Workspace aberto | No log da execução | `status` do arquivo | Resultado |
| --- | --- | --- | --- | --- |
| sim | — | sim | `in_progress` | `active` |
| sim | — | sim | `idle` | `idle` |
| sim | não | não | qualquer | `finished` |
| sim | **sim** | não | qualquer | **`unknown`** |
| não | — | — | `idle`/`failed` | `finished` |
| não | — | — | `in_progress`/ausente | `unknown` |
| — | — | — | `remove` no índice | `finished` |

A linha em negrito é deliberada: preferimos dizer "não sei" a inventar um estado.

O log ainda refina a evidência textual de um `active`: `model.invoke.start` indica
turno rodando no modelo; `[ACP ToolApproval] Requesting permission` indica que o
agente está parado esperando o usuário aprovar uma ferramenta.

---

## 3. Interface comum

Os dois adaptadores (`detectClaudeSessions`, `detectKiroSessions`) produzem o mesmo
registro e são unidos por `monitorScan()`:

| Campo | Claude Code | Kiro |
| --- | --- | --- |
| `agent` | `claude-code` | `kiro` |
| `session_id` | uuid do `sessionId` | `sess_<uuid>` |
| `status` | `active` \| `idle` \| `finished` \| `unknown` | idem |
| `ide` | cadeia de pais → lock | sempre `Kiro` |
| `project` | `cwd` do registro | `workspacePaths` |
| `pid` | PID do processo da sessão | PID da IDE, só quando a sessão é dela |
| `started_at` | `startedAt` | `createdAt` |
| `last_activity_at` | mtime da transcrição | `lastModifiedAt` / mtime |
| `ended_at` | ver limitações | `at` do `remove` no índice |
| `detection_source` | `claude:pid-registry+claude:process+…` | `kiro:session-file+…` |
| `detection_confidence` | `confirmed` \| `inferred` \| `unknown` | idem |
| `evidence` | frases do que sustentou a conclusão | idem |

Persistido em `public.sessions` pela migração
[20260904171500_session_monitoring.sql](../supabase/migrations/20260904171500_session_monitoring.sql).
Todas as colunas novas são anuláveis de propósito.

`external_id` passou a ser `<agent>:<sessionId>` (id nativo) em vez do caminho do
arquivo, para que o monitor e o tail de transcrição convirjam na **mesma linha**.
Consequência: linhas antigas com `external_id` de caminho ficam órfãs no banco.

---

## 4. Testes realizados e resultados

### 4.1 Ciclo de vida do registro do Claude Code

Script: `test-lifecycle.ps1`. Sobe processos `claude.exe` com a mesma linha de
comando que a extensão usa.

| Etapa | Esperado | Observado |
| --- | --- | --- |
| T0 baseline | 2 registros (as duas abas reais do VS Code) | 2 ✓ |
| T1 abrir 1 sessão | +1 registro com sessionId novo | `36776` / `c248840a…` ✓ |
| T2 abrir 2ª sessão | 4 registros simultâneos | `40352` / `e3df95af…` ✓ |
| T3 **kill abrupto** | — | **arquivo permanece no disco**, processo morto |
| T4 saída limpa (EOF no stdin) | — | **arquivo removido do disco** |

T3 é o achado que justifica o desenho: **o registro por PID vira órfão em queda
abrupta**. Um monitor que confiasse na existência do arquivo reportaria uma sessão
fantasma. A checagem PID + `procStart` rejeitou corretamente.

### 4.2 Ciclo de vida pelo monitor completo

Script: `test-monitor.ps1`, chamando `--probe --json` a cada etapa.

| Etapa | active | idle | finished | Leitura |
| --- | --- | --- | --- | --- |
| T0 baseline | 1 | 1 | 1 | 1 órfão remanescente do teste anterior |
| T1 +sessão A | 1 | 2 | 0 | A detectada; órfão anterior recolhido |
| T2 +sessão B | 1 | 3 | 0 | duas sessões novas simultâneas ✓ |
| T3 kill abrupto de A | 1 | 2 | 1 | A → `finished`, **não** `active` ✓ |
| T4 saída limpa de B | 1 | 1 | 1 | registro de B sumiu do disco ✓ |

Observação colhida em T1: ao subir, o próprio Claude Code recolhe registros órfãos
de execuções anteriores. Útil, mas **não** é garantia — o órfão sobrevive enquanto
nenhuma instância nova nascer, exatamente como em T3→T4.

Sessões recém-abertas aparecem como `idle`, não `active`: o processo está vivo mas
ainda não escreveu transcrição, então não há atividade medida. É a leitura correta.

### 4.3 Confronto com a realidade da IDE

`--probe` executado com o ambiente real, comparado com as abas abertas:

| Detectado | Realidade | Confere |
| --- | --- | --- |
| `active` claude-code `09e98477…` VS Code, conect-sessions | a sessão que rodou esta investigação | ✓ |
| `idle` claude-code `a68fd9d9…` VS Code, conect-sessions | segunda aba do Claude Code, parada | ✓ |
| `active` kiro `sess_169703b9…` Kiro, vinci-stack | sessão do Kiro aguardando aprovação de comando | ✓ |
| `unknown` kiro `sess_6dbed42c…` | sessão anterior no mesmo workspace aberto | ✓ (indeterminável) |
| `finished` × 6 kiro (workspaces fechados) | histórico | ✓ |
| `finished` claude-code `c248840a…` PID 36776 | processo morto no teste | ✓ nenhum falso positivo |

Nenhuma sessão viva foi omitida e nenhuma morta foi dada como viva.

### 4.4 Precisão do start-time

| PID | `procStart` no arquivo | `Get-Process` | `Win32_Process` (WMI) |
| --- | --- | --- | --- |
| 24420 | `…480662610` | `…480662610` ✓ | `…480662610` ✓ |
| 44280 | `…741265103` | `…741265103` ✓ | `…7412651`**`00`** ✗ |

### 4.5 Handle exclusivo do log do Kiro

| Alvo | Resultado |
| --- | --- |
| `~/.kiro/logs/20260904T165224297/kiro.log` (execução viva) | abertura exclusiva **falha** → travado ✓ |
| `~/.kiro/logs/20260901T004609248/kiro.log` (execução antiga) | abertura exclusiva **funciona** → livre ✓ |

---

## 5. Fontes avaliadas e descartadas

| Fonte | Por que não |
| --- | --- |
| "existe `claude.exe` logo existe sessão" | não dá session id, projeto nem início; conta processos, não sessões |
| Decodificar `~/.claude/projects/<cwd-codificado>/` | ambíguo: `-` do caminho original é indistinguível do separador; usado só como rótulo |
| `entrypoint` para nomear a IDE | diz a família (`claude-vscode`), não qual IDE — Kiro também é VS Code |
| `~/.kiro/workspace-roots/*/.trust-migration.json` | artefato de migração, pode não existir; `session.json` já traz `workspacePaths` |
| `mtime` do arquivo como status | era o mecanismo antigo; não distingue "sessão fechada" de "sessão parada" |
| `~/.claude/sessions/*.key` | não tem session id; sobrevive por semanas a execuções mortas |
| Nome da pasta de log do Kiro vs. hora do processo | substituído pelo teste de handle, que é determinístico |
| Realtime/websocket do Supabase | decisão de arquitetura do projeto: polling (ver CLAUDE.md) |

---

## 6. Limitações conhecidas

1. **Windows apenas.** O snapshot de processos usa PowerShell. Em outras
   plataformas o monitor degrada para `unknown` em vez de adivinhar.
2. **Custo do snapshot.** Um disparo de `powershell.exe` por varredura, com cache de
   `LRC_PROC_TTL` (4 s por padrão) para não pesar no intervalo de 2 s.
3. **`ended_at` do Claude Code raramente é exato.** O registro órfão não carrega
   horário de morte. Se o agente estava rodando e viu a sessão viva antes, usa a
   última observação viva e marca `detection_confidence: inferred`. Se o agente subiu
   depois da morte, `ended_at` fica `null`.
4. **Aba do Kiro aberta e intocada é indistinguível de aba fechada** (seção 2).
5. **Sessões do Kiro não têm PID próprio.** O `pid` publicado é o da IDE.
6. **Leitura do log do Kiro é best-effort.** Só refina a evidência textual; o
   `status` vem do `session.json`. Se o formato do log mudar, perde-se o refinamento,
   não a detecção.
7. **Acoplamento a formatos privados.** `~/.claude/sessions/<pid>.json`,
   `~/.kiro/sessions/**/session.json` e o `storage.json` do Kiro não são APIs
   públicas. Campo ausente ou renomeado degrada para `unknown` — nunca quebra o
   agente, mas a cobertura cai até o formato ser reavaliado.
8. **Não testado: reinício completo da IDE.** A investigação rodou dentro de uma
   sessão do Claude Code no VS Code em uso, e derrubar a IDE encerraria a própria
   investigação. O cenário equivalente — processo morto com registro no disco — foi
   testado diretamente (4.1 T3) e é o mesmo caminho de código.

## 7. Falsos positivos e falsos negativos

**Falsos positivos possíveis**

- PID reciclado por outro `claude.exe` no mesmo tick com start-time dentro de 1 ms.
  Praticamente impossível; seria preciso o Windows reciclar o PID e o novo processo
  nascer no mesmo milissegundo do antigo.
- Sessão do Kiro marcada `in_progress` e presente no log, mas cuja aba o usuário
  fechou sem o Kiro atualizar o arquivo. Não observado nos testes.

**Falsos negativos possíveis**

- Aba do Kiro aberta sem nenhum turno nesta execução → sai `unknown`, não `idle`
  (limitação 4). É a troca deliberada de conveniência por confiabilidade.
- Sessão do Claude Code viva cuja transcrição ainda não existe → sai `idle`, não
  `active`.
- Snapshot de processos falhando (PowerShell bloqueado por política) → tudo vira
  `unknown` e nada é reportado como vivo.

## 8. Decisões técnicas

1. **Prova de vida por PID + start-time, nunca só por arquivo.** Justificada pelo
   teste 4.1 T3.
2. **`Get-Process.StartTime`, não WMI.** Justificada pelo teste 4.4.
3. **FILETIME como string + `BigInt`.** O valor estoura `Number.MAX_SAFE_INTEGER`.
4. **IDE por cadeia de processos até o dono do lock**, não por caminho ou por
   `entrypoint`. Funciona igual para Claude Code hospedado no VS Code e no Kiro.
5. **Handle exclusivo para identificar a execução viva do Kiro**, em vez de comparar
   o timestamp da pasta de log com o horário do processo.
6. **`unknown` é um resultado de primeira classe**, propagado até o banco
   (`detection_confidence`) e até a UI (marcador `?` no `StatusDot`).
7. **Adaptadores separados, registro comum.** Os mecanismos não têm nada em comum;
   forçar uma abstração única esconderia as diferenças que sustentam a confiança.
8. **Agente continua arquivo único.** É servido por
   [remote-agent.ts](../src/routes/api/public/agent/remote-agent.ts) via import `?raw`
   e instalado por um `curl` — dividir em módulos quebraria a instalação.
9. **`--probe` como parte da entrega.** Confiabilidade que não pode ser conferida não
   é confiabilidade; o modo de sondagem imprime as evidências para o confronto.
