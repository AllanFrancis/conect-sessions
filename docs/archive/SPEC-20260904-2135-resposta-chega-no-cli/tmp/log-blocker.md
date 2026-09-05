**Não consigo provar o canal escolhido sem instalar um hook em settings.json de disco.**

O critério de aceite #1 exige prova "com a sessão real rodando (não simulada)". A descoberta #4 mostra
que hook passado por `--settings <arquivo>` NÃO é carregado — só vale `~/.claude/settings.json` ou
`.claude/settings.json` do projeto. Instalar hook é permitir execução de código a cada turno: é decisão
do usuário, e nesta sessão a escrita nesses arquivos foi barrada pelo classifier de permissões
(3 tentativas: `.claude/settings.json` do fixture, redirecionamento de stderr para arquivo, e leitura
de `~/.claude/session-env/`).

Não contornei e não vou contornar — a barreira está certa. Precisa de decisão explícita do usuário.

**Duas coisas travadas pela mesma permissão:**
1. Provar `Stop` → `decision: block` numa sessão real (o desenho inteiro depende disso).
2. Ler `~/.claude/session-env/`, única pista aberta de onde a versão 2.1.x guarda o par pid↔sessionId
   que a detecção de Claude perdeu (descoberta #2).

**Estado:** fase 1 (investigação) entregue. Fase 2 (implementação) não começou de propósito — o
main.md manda investigar antes de codar, e o invariante "NUNCA prometer na UI o que não foi provado na
máquina" vale primeiro para mim. Nada de UI foi tocado, nada foi prometido.
Fixture da tentativa preservado em `tmp/hooktest/` (script do hook + settings de teste).
