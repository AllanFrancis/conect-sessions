# SPEC-20260905-1944: sessao layout mobile

**Status:** done
**Porte:** M
**Owner:** @AllanFrancis
**Criada:** 2026-09-05 19:44
**Ativada:** 2026-09-05 19:44
**Concluída:** 2026-09-05 19:55
**Pausada em:** —
**Commit final:** `9022a38`
**Keywords:** dashboard
**Features:** dashboard
**Branch:** feat/sessao-layout-mobile
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-05 19:43, com print do app do Claude Code no celular
**Resumo:** A página da sessão vira uma conversa de celular — barra fixa no topo, bolha do usuário à direita, ferramenta dobrada numa linha e composer fixo embaixo.

## Objetivo

O usuário mandou um print do app do Claude Code no celular e pediu o mesmo layout, "como se fosse
para mobile". Hoje a página da sessão é um log de terminal: cada mensagem é `marcador + texto` em
largura cheia, sem distinguir visualmente quem falou, e a página inteira rola junto com o composer.
No celular isso é difícil de ler — não dá para bater o olho e saber o que é fala do usuário, o que é
resposta do agente e o que é ruído de ferramenta.

O print define o alvo com precisão suficiente para copiar: barra fixa com voltar/título/menu, fala
do usuário em bolha à direita, fala do agente em largura cheia sem bolha, chamada de ferramenta
colapsada numa linha discreta com chevron, linha de estado com `✳`, e composer fixo embaixo em
formato de pílula.

## Escopo

**DENTRO:**

- Layout da rota `_authenticated/sessions.$sessionId` reescrito em forma de conversa, mobile-first.
- Primitivas novas em `src/components/terminal.tsx` para o que passa a se repetir (barra, bolha,
  linha colapsada, composer) — a regra da região manda toda UI nova compor de lá.
- Altura estável no celular (`dvh`) e respeito à área segura do aparelho.

- **[somado 2026-09-05 19:46, 2o print do usuario]** A LISTA (`dashboard.tsx`) tambem: titulo
  grande, secao de maquinas com pilula "+ Adicionar maquina", e cada sessao como card arredondado
  com icone, hora relativa e linha de estado.

**FORA:**

- As demais rotas (`agents.tsx`, `auth.tsx`, `index.tsx`): continuam como estao.
- **Filtro "Todos" da lista.** O print tem um; copiar exigiria voltar atras na decisao da
  SPEC-20260904-1433 (o painel lista SO sessao ativa), e isso e decisao do usuario, nao minha.
- **FAB "Nova sessao".** O painel nao cria sessao: quem cria e a IDE na maquina. Botao que promete
  isso seria mentira de interface.
- Trocar a paleta ou a tipografia do produto: as cores continuam sendo os tokens em `styles.css`.
  Muda o ARRANJO, não a identidade.
- Prometer na UI algo que a entrega não sustenta — o rodapé continua honesto sobre o que o painel
  garante.
- Menu do `⋮`: entra como afordância só se tiver ação real; menu vazio é mentira de interface.

## Invariantes

- NUNCA perder informação que hoje está visível: quem falou, estado da sessão, projeto, se a
  pergunta já foi respondida no terminal, se a ferramenta falhou, se a resposta ainda está pendente.
- SEMPRE manter a rolagem lateral contida no bloco largo (código, saída de ferramenta) — o corpo da
  página não rola de lado no celular.
- NUNCA prometer "respondida" onde o produto só garante "enviada ao agente".
- SEMPRE compor as primitivas de `terminal.tsx`; cor só por token de `styles.css`.

## Implementação

Três faixas em coluna, ocupando `100dvh`: barra fixa no topo, transcrição rolando no meio, composer
fixo embaixo. `dvh` e não `vh` porque no celular a barra do navegador entra e sai e `vh` congela na
altura errada — o composer ficaria fora da tela ou coberto.

Primitivas novas em `terminal.tsx`:

- `TermTopBar` — voltar à esquerda, título e subtítulo centralizados, slot à direita.
- `ChatBubble` — bolha do usuário, alinhada à direita, com `max-w` para não virar faixa cheia.
- `CollapsedRow` — linha discreta com chevron `›`, que abre o conteúdo dobrado. É a forma do
  "Executou 8 comandos ›" do print, e é onde a saída de ferramenta passa a morar.
- `Composer` — pílula com textarea que cresce, mais a fileira de ações embaixo.

O que hoje é `marcador + texto` para o assistente vira texto em largura cheia (sem bolha), que é o
que o print faz e o que deixa markdown longo legível no celular.

### Modelo de dados

| Entidade | Campos / mudança |
| --- | --- |
| — | Nenhuma. Só apresentação: as mesmas queries, os mesmos campos. |

## Riscos

- Reescrever a árvore da página pode derrubar comportamento que não é visual — auto-scroll, foco no
  input, envio por Enter, bloqueio da pergunta respondida. Mitigação: esses pontos entram como
  critério de aceite, verificados no navegador, não só por leitura.
- Composer fixo em iOS costuma ser coberto pelo teclado ou pela barra de gestos. Mitigação:
  `env(safe-area-inset-bottom)` e prova no viewport de celular.
- Bolha à direita com conteúdo largo (um caminho longo, um comando) pode estourar a linha.
  Mitigação: quebra de palavra forçada na bolha e `max-w` medido no viewport estreito.

## Sinais de sucesso

- Abrir a sessão no celular e conseguir seguir a conversa rolando com o polegar, sabendo de relance
  quem falou, sem zoom e sem rolagem lateral.

## Critério de aceite

- [x] **[somado 2026-09-05 19:46]** Lista com titulo grande, secao de maquinas e sessoes como cards (icone, hora relativa, estado) — screenshot em viewport de celular (2026-09-05 19:54, commit `53b8b91`, evidence: evidence/lista-mobile-360.png: titulo grande, secao Maquinas com pilula, cards com icone, hora relativa e estado)
- [x] Layout de conversa: barra fixa no topo, bolha do usuário à direita, fala do agente em largura cheia, composer fixo embaixo — provado por screenshot em viewport de celular (2026-09-05 19:54, commit `53b8b91`, evidence: evidence/sessao-mobile-360.png: barra fixa, bolha do usuario a direita, agente em largura cheia, composer em pilula fixo)
- [x] Chamada/saída de ferramenta aparece colapsada numa linha com chevron e abre ao toque (2026-09-05 19:54, commit `53b8b91`, evidence: clique no summary: details.open=true e a saida aparece; ferramenta que falhou em vermelho)
- [x] Nada some: estado da sessão, projeto, pergunta respondida travada, resposta pendente e falha de ferramenta continuam visíveis (2026-09-05 19:54, commit `53b8b91`, evidence: estado, projeto, IDE, pid e confianca seguem na linha do card (quebrando, nao truncando); pendente com bolha tracejada e 'enviada ao agente')
- [x] Enter envia, shift+enter quebra linha, foco e auto-scroll continuam funcionando após a reescrita (2026-09-05 19:54, commit `53b8b91`, evidence: shift+enter nao envia; enter envia, limpa o campo, mantem foco; auto-scroll corrigido para observar replies tambem)
- [x] Sem rolagem lateral do corpo em viewport de 360px, com mensagem contendo bloco de código (2026-09-05 19:54, commit `53b8b91`, evidence: documentElement.scrollWidth == innerWidth == 360 com bloco de codigo na conversa)
- [x] Typecheck limpo (2026-09-05 19:54, commit `53b8b91`, verify: exit 0) | verify: `bunx tsc --noEmit`
- [x] Lint limpo (2026-09-05 19:54, commit `53b8b91`, verify: exit 0) | verify: `bun run lint`
