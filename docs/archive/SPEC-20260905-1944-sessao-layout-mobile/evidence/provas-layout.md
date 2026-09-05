# Provas do layout mobile — 2026-09-05

Viewport de 360×780 (celular estreito), Chromium via Playwright, dev server em :8080.
Dados semeados na conta de teste e apagados depois — o banco voltou a 26 sessões, 0 de teste.

## Lista (`lista-mobile-360.png`)

Título grande, seção "Máquinas" com a pílula "+ Adicionar máquina", seção "Sessões ativas" com a
cadência de atualização à direita, e três cards arredondados com ícone da origem, título, hora
relativa ("agora", "há 35 min", "há 3 h") e a linha de estado.

Correção feita depois da primeira rodada: a segunda linha truncava e comia justamente `pid` e
`confiança` — a prova de vida da sessão. Passou a QUEBRAR em vez de truncar, e a palavra do estado
ganhou a cor do marcador (`active` em destaque; o resto, não — se tudo destacasse, nada destacaria).

## Sessão (`sessao-mobile-360.png`)

Barra fixa com voltar, ícone da origem, título e projeto, e `⋮` à direita. Fala do agente em largura
cheia, fala do usuário em bolha cinza à direita, bloco de código como card com "copiar" e rolagem
própria, ferramenta colapsada numa linha com chevron, ferramenta que falhou em vermelho, respostas
pendentes em bolha tracejada com "✳ enviada ao agente…", e composer em pílula fixo embaixo.

## Comportamento, medido no navegador (não por leitura)

    rolagem lateral do corpo em 360px, com bloco de código ....... false
    chevron da ferramenta: abre e mostra a saída ................. open=true, saída visível
    shift+enter ................................................. não envia, texto preservado
    enter ....................................................... envia, campo limpo, foco mantido
    auto-scroll ................................................. a bolha enviada aparece inteira

O auto-scroll era um defeito de verdade encontrado aqui: o efeito observava só `messages`, e resposta
pendente é `replies` — quem enviava do celular via a própria bolha nascer fora da tela, atrás do
composer. Passou a observar as duas listas.

## O que do print NÃO foi copiado, e por quê

- **Filtro "Todos"** na lista: copiar exigiria reverter a decisão da SPEC-20260904-1433 (o painel
  lista só sessão ativa). É decisão do usuário, não minha.
- **FAB "Nova sessão"**: o painel não cria sessão — quem cria é a IDE na máquina. O botão prometeria
  o que o produto não faz.
- O `⋮` e o `☰` entraram com ações reais (copiar link, máquinas & tokens, sair). Menu vazio só para
  imitar o desenho seria afordância mentirosa.
