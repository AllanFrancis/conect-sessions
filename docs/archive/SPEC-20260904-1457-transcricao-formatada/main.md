# SPEC-20260904-1457: transcricao formatada

**Status:** done
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-04 14:57
**Ativada:** 2026-09-04 14:57
**Concluída:** 2026-09-04 17:12
**Pausada em:** —
**Commit final:** `f4437f4`
**Keywords:** dashboard
**Features:** dashboard
**Branch:** feat/transcricao-formatada
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-04 14:57
**Resumo:** A transcrição passa a renderizar markdown de verdade (código em card), a mostrar pergunta de escolha como botões clicáveis, e a entender também o formato do Kiro — que até aqui chegava ao painel como sessão vazia.

## Objetivo

A mensagem do assistente chega ao painel como bloco de texto plano: o `ReactMarkdown` roda, mas as classes `prose` nunca existiram (`@tailwindcss/typography` não está instalado) e o preflight do Tailwind v4 zera `h1..h6`/`ul`/`ol` — título, lista e ``` saem iguais a parágrafo. Pior, pergunta de escolha some por completo: o `normalize()` do agente achata o array de content com `p.text ?? p.content` e descarta o bloco `tool_use` do `AskUserQuestion`. Entrega: ler a resposta no celular com a hierarquia do terminal, e responder pergunta de escolha tocando na opção.

## Escopo

**DENTRO:**
- Renderer de markdown próprio, com bloco de código em card (rótulo de linguagem, copiar, rolagem contida).
- Pergunta selecionável estruturada, atravessando as três camadas: agente → banco → API → UI.
- Heurística de fallback para pergunta escrita em prosa (lista numerada vira botões que preenchem o campo).
- `tool_result` do `AskUserQuestion` deixa de aparecer como texto cru em inglês na transcrição.
- Adaptador da transcrição do Kiro: o envelope `{id, timestamp, payload}` vira mensagem — fala, raciocínio (marcado, para a UI desenhá-lo diferente) e pergunta de escolha, incluindo a aprovação de ferramenta.
- Resultado de ferramenta do Kiro (`tool_result`), dobrado com a chamada que o produziu: cabeçalho sempre visível (ferramenta, alvo, ok/falhou) e saída recolhida, com corte declarado.

**FORA:**
- Syntax highlighting por linguagem — `react-syntax-highlighter` é dependência pesada e o card já resolve a leitura.
- Injetar tecla no CLI para desbloquear a sessão — segue responsabilidade do `LRC_REPLY_CMD` do usuário.
- Renderizar `tool_use`/`tool_result` do Claude Code (Bash, Edit, Read…) — continua invisível, como hoje. O Kiro é a exceção deliberada: lá o resultado entra (dobrado com a chamada) e a aprovação vira pergunta, porque ela não é a chamada e sim uma pergunta ao usuário. O `tool_call` do Kiro sozinho segue invisível — ele vive dentro do resultado que produziu.
- Saída de ferramenta íntegra: o agente corta em 4.000 caracteres. A transcrição é repolida a cada 2s no celular e um `read_file` chega a 78 mil — o corte é declarado na UI, nunca silencioso.
- Streaming/Realtime: o polling de 2s do react-query continua sendo o mecanismo.

## Invariantes

- NUNCA instalar `@tailwindcss/typography`: as cores saem dos tokens oklch de `src/styles.css` e as primitivas de `src/components/terminal.tsx`. `remark-gfm` é a única dependência nova autorizada.
- SEMPRE tratar `meta` como aditivo — mensagem sem `meta` renderiza como hoje, e agente antigo numa máquina não atualizada continua funcionando.
- NUNCA fingir que a pergunta foi respondida: a UI diz "resposta enviada ao agente", e a opção só aparece marcada quando existe `tool_result` provando a escolha.
- NUNCA alterar a derivação de status nem o round-trip do `/sync` — o protocolo continua sendo o mesmo POST.

## Implementação

Quatro peças, das quais só a terceira atravessa camadas.

**1. `src/components/markdown.tsx` (novo)** — encapsula `ReactMarkdown` com `remarkPlugins={[remarkGfm]}` e um mapa `components`: `code` separa fence de inline por `/language-(\w+)/` no `className` (inline vira `<code>` com `bg-secondary`, fence delega para `TermCode`), `pre` passa direto para não aninhar `<pre>`, e `h1..h4`/listas/tabela/citação/link/`hr` recebem classes dos tokens do projeto. As classes `prose*` mortas saem do `sessions.$sessionId.tsx`.

**2. `TermCode` em `src/components/terminal.tsx`** — card na linha do `TermBox`: cabeçalho com rótulo da linguagem e botão copiar (`navigator.clipboard` + `toast`), corpo com `overflow-x-auto` próprio, para a rolagem horizontal ficar no card e o body da página nunca rolar de lado no celular.

**3. Pergunta estruturada** — `normalize()` (`public/agent/remote-agent.mjs`) passa a varrer o array de content em vez de achatá-lo: acumula `text` como hoje **e** reconhece `tool_use` com `name === "AskUserQuestion"` (guardando `input.questions` e o `id`) e `tool_result` (guardando o `tool_use_id` e descartando o texto em inglês). Mensagem que só tem `tool_use` deixa de retornar `null`. O payload ganha `meta`, que o zod do `sync.ts` aceita e grava na coluna nova. A UI renderiza `meta.ask` como enunciado + uma `TermButton` por opção; clicar insere em `replies` pelo mesmo caminho do `send()` que já existe.

Estado respondida/pendente vem por **derivação, não por update**: o upsert de mensagens usa `ignoreDuplicates: true`, então a linha da pergunta nunca é atualizada depois de inserida. A UI monta um `Set` dos `answers_tool_use_id` presentes na conversa e desabilita as opções da pergunta cujo `tool_use_id` está nele.

**5. Adaptador do Kiro em `normalize()`** — o Kiro não usa o envelope do Claude Code: cada linha do `messages.jsonl` é `{id, timestamp, payload:{type, …}}` e o texto mora em `payload.content`. O `normalize()` procurava `role`/`content` na raiz, achava `undefined` nos dois e descartava a linha — TODA linha do Kiro, sempre. `normalizeKiro()` traduz `user` e `assistant` (com `meta.kind:"reasoning"` no `operationType:"Reasoning"`, porque no Kiro o `Say` costuma ser só emenda e a narrativa mora no raciocínio), e traduz `pending_interaction`/`interaction_resolved` para o MESMO `meta.ask`/`answers_tool_use_id` do AskUserQuestion — a UI não ganha caminho novo, ganha uma segunda origem. O resto (`tool_call`, `tool_result`, `turn_*`, `session_metadata`, `usage_summary`, `sub_agent_*`) segue fora, como Bash/Edit no Claude Code.

Duas diferenças do Kiro obrigam ajuste na ponta: ele resolve uma interação por vez e NÃO repete o enunciado na resolução (então não há mapa `{pergunta: resposta}` — vem `meta.answer`, a escolha crua), e na aprovação de ferramenta devolve o `optionId` (`"accept"`) em vez do rótulo (`"Allow"`). `chosenFor()` em `src/lib/ask-answer.ts` passa a aceitar as duas provas. O Kiro também reescreve a mesma linha (mesmo `id`, payload idêntico) a cada mudança de estado, até 6x: o `ON CONFLICT DO NOTHING` cobre entre lotes, e o `sync.ts` deduplica dentro do lote.

**6. `tool_result` do Kiro** — o resultado NÃO diz qual ferramenta rodou: o payload traz só `toolCallId`, `content` e `success`. Nome, título, tipo e argumentos vivem no `tool_call`, que veio antes no arquivo. `kiroToolCalls(lines)` indexa o arquivo INTEIRO por `toolCallId` — o arquivo todo, e não só as linhas novas do tick, porque a chamada pode ter sido lida num tick anterior — e o `readNew` passa o índice ao `normalize`. Os dois viram UMA mensagem, na posição do resultado; o `tool_call` sozinho não vira nada, porque só anuncia "vou fazer". O `call_id` resultante é o MESMO `tool_use_id` da aprovação, quando houve uma, então os dois blocos ficam amarrados sem campo extra. Contra o ruído: cabeçalho sempre visível (ferramenta · alvo · ok/falhou) e saída num `<details>` fechado, cortada em 4.000 caracteres com o corte declarado; `{}` (o "sem saída" do Kiro) vira vazio e não rende bloco.

**4. `src/lib/parse-choices.ts` (novo)** — função pura para pergunta escrita em prosa. Casa apenas com lista numerada no fim da mensagem, 2 a 6 itens, cada um ≤120 caracteres, e só quando a mensagem contém `?`. Qualquer condição falha → `null`, e nada muda na tela. Os botões preenchem o textarea em vez de enviar: a heurística pode errar e a confirmação é do usuário.

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| `public.messages` | `+ meta JSONB` nullable, sem default e sem índice; herda a policy RLS da tabela |

**Alternativas rejeitadas:** instalar `@tailwindcss/typography` (traz um estilo genérico que briga com os tokens oklch e as primitivas de terminal — o mapa `components` custa o mesmo e combina); guardar a pergunta numa tabela `questions` própria (a pergunta É uma mensagem, e uma tabela separada duplicaria ordenação e RLS por nada); atualizar a linha da pergunta quando a resposta chega (o `ignoreDuplicates: true` do upsert impede, e derivar do `tool_result` é mais barato que abrir exceção no caminho de escrita).

## Riscos

- Clicar na opção não desbloqueia o CLI: o `AskUserQuestion` é modal bloqueante no terminal e o `deliverReplies()` só imprime no console / grava no `LRC_REPLY_FILE` / roda o `LRC_REPLY_CMD` — mitigação: a UI promete "resposta enviada ao agente", nunca "pergunta respondida".
- Falso positivo da heurística (lista que não era pergunta virar botão) — mitigação: filtros estreitos (fim da mensagem, 2–6 itens, `?` presente) e o botão só preenche o campo.
- `remark-gfm` é dependência nova sob `minimumReleaseAge=86400` — mitigação: pacote estável e antigo, passa no guard sem precisar de exceção no `bunfig.toml`.

## Sinais de sucesso

- Dá para acompanhar e responder uma sessão inteira pelo celular sem abrir o terminal para entender o que o Claude escreveu.

## Critério de aceite

- [x] Bloco ``` renderiza em card com rótulo de linguagem, botão copiar funcional e rolagem horizontal contida no card (2026-09-04 15:25, commit `f4437f4`)
- [x] Título, lista, tabela, citação e código inline ficam visualmente distintos de parágrafo, sem `@tailwindcss/typography` instalado (2026-09-04 15:25, commit `f4437f4`)
- [x] Mensagem com `AskUserQuestion` mostra o enunciado e uma opção clicável por `option`, e o clique cria linha em `replies` (2026-09-04 16:57, commit `f4437f4`, evidence: passe de browser (Playwright, dev 8082, conta de teste): AskUserQuestion real do Claude Code ainda sem resposta renderizou enunciado + 1 botao por option, todos habilitados; clique na 2a opcao criou linha em replies com content='Escrevo tudo a mao', status pending, e o bloco passou a 'escolha enviada ao agente'. Telas em evidence/askuserquestion-aberta.png e evidence/clique-cria-reply.png)
- [x] Pergunta já respondida aparece com as opções desabilitadas e a escolhida marcada (2026-09-04 15:31, commit `f4437f4`)
- [x] `tool_result` de `AskUserQuestion` não aparece mais como texto em inglês na transcrição (2026-09-04 15:25, commit `f4437f4`)
- [x] Mensagem sem `meta` (agente antigo) renderiza como hoje, sem erro no console (2026-09-04 15:25, commit `f4437f4`)
- [x] Lista numerada de 2–6 itens no fim de uma mensagem com `?` vira botões que preenchem o textarea; texto fora do padrão não gera botão (2026-09-04 15:25, commit `f4437f4`)
- [x] Typecheck limpo (2026-09-04 16:59, commit `f4437f4`, verify: exit 0) | verify: `bunx tsc --noEmit`
- [x] Lint limpo (2026-09-04 16:59, commit `f4437f4`, verify: exit 0) | verify: `bun run lint`
- [x] Linha do Kiro deixa de ser descartada e é aceita pelo endpoint: `user`, `assistant`, `pending_interaction` e `interaction_resolved` viram mensagem; `tool_call`, `tool_result`, `turn_*` e `session_metadata` seguem fora (2026-09-04 16:04, commit `f4437f4`, evidence: tmp/kiro-real.test.mjs com o normalize() de producao sobre as 7 transcricoes desta maquina: 724/2810 linhas viram mensagem (era 0/2761) — assistant 420/420, pending_interaction 139/139, interaction_resolved 138/138, user 27/27, e 0 de tool_call/tool_result/turn_*/session_metadata; tmp/sync-schema.test.mjs com o zod real do sync.ts: 726/726 aceitas, meta preservada)
- [x] A escolha registrada pelo Kiro marca a opção certa, casando por rótulo (pergunta ao usuário) ou por `optionId` (aprovação de ferramenta), e resolução cancelada tranca sem marcar nada (2026-09-04 16:04, commit `f4437f4`, evidence: tmp/kiro-pairing.test.ts com o chosenFor() de producao sobre dado real: 137 escolhas marcam a opcao certa (rotulo ou optionId), 1 cancelada tranca sem marcar, 0 defeitos, 0 orfas)
- [x] No painel, a sessão do Kiro mostra a conversa: raciocínio aparece marcado e esmaecido, distinto da fala, e a pergunta aparece como opções clicáveis (2026-09-04 16:57, commit `f4437f4`, evidence: passe de browser na sessao Kiro 'Check Next GitHub Spec': 29 tags 'raciocinio' em 29 linhas esmaecidas, 3 aprovacoes como opcoes clicaveis com a escolhida marcada por optionId ('Always allow'), 0 rolagem horizontal no body. Tela em evidence/kiro-sessao.png)
- [x] Resultado de ferramenta do Kiro aparece com a ferramenta, o alvo e o estado, saída recolhida por padrão e corte declarado quando houve; toda linha casa com a chamada que a produziu, na ordem do arquivo (2026-09-04 16:57, commit `f4437f4`, evidence: tmp/kiro-toolresult.test.mjs sobre 680 tool_result reais: 680/680 com nome e titulo da ferramenta, 666/680 (97,9%) com alvo, 0 sem tool_call correspondente, 0 resultado antes da chamada, 0 fora de ordem, 99 truncados com corte declarado, 28 sem saida, 41 falhas. No browser: 35 blocos com 33 saidas dobradas, 0 abertas por padrao)
- [x] Marcador de resposta do `AskUserQuestion` é reconhecido nos DOIS formatos de frase do CLI, sem vazar texto em inglês e sem deixar pergunta respondida parecendo aberta (2026-09-04 16:57, commit `f4437f4`, evidence: tmp/answer-prefixes.test.mjs varrendo os 18 projetos de ~/.claude/projects, com toolUseResult.answers como verdade-terreno: 494 marcadores, 494 reconhecidos, 0 vazamentos. Frases: 474 'Your questions have been answered:' + 20 'The user answered:'. Confirmado no browser: a frase em ingles sumiu da tela e a pergunta que parecia aberta passou a trancada)
