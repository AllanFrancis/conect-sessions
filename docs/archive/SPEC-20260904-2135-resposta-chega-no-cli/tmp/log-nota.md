**Correção de precisão da [descoberta] das 21:54, item 2.**

Escrevi que `~/.claude/sessions/<pid>.json` "não existe mais na 2.1.x". A medição está certa, a
causa foi afirmada além do que provei. O que está PROVADO, reconferido às 22:15:

- `~/.claude/sessions/` tem 8 arquivos, todos `.key`, de 20–25/ago. Zero `.json`.
- Há 4 processos `claude.exe` VIVOS agora. Nenhum deles tem `<pid>.json`.
- `--probe` acha 11 sessões, zero de Claude. Reproduzível.

O que NÃO está provado: que o formato foi removido. O próprio `docs/session-monitoring.md` §1 traz um
`<pid>.json` real com `"version": "2.1.259"` e `"entrypoint": "claude-vscode"` — extensão, não
terminal — e a extensão instalada hoje é a **2.1.260**. Então a leitura honesta é "a 2.1.260 não
escreve o registro que a 2.1.259 escrevia", e não "o registro acabou". Pode ser mudança de formato,
de local, ou condicional a algo que não isolei.

Não muda nenhuma decisão: a detecção por registro nativo está inoperante nesta máquina hoje, e o
registro do hook é a fonte que não depende de qual versão o Claude Code está rodando. A camada antiga
fica no código de propósito, para quem estiver numa versão que ainda a escreve.

**Decisões do usuário (2026-09-04 22:00), as três recomendadas:**
1. "Instalar em ~/.claude/settings.json" — autorizado instalar o hook no settings global.
2. "Somar external_id ao reply" — mudança aditiva no /sync liberada.
3. "Consertar dentro desta SPEC" — a detecção de Claude entra no escopo desta SPEC.

**Provado nesta rodada (metade do caminho):**
- O hook drena o inbox e emite o JSON certo: entrada com 2 respostas semeadas → saída
  `{"hookSpecificOutput":{"hookEventName":"Stop","decision":"block","reason":"...pode seguir,
  aprovado\n\ne roda o lint depois"}}`, inbox apagado, registro criado.
- A resolução de PID pela árvore de processos funciona de verdade: o hook subiu de si mesmo,
  pulou as cascas (`bash.exe`) e achou `claude.exe` **PID 28884** com
  `proc_start=134330459272199166` — que é exatamente uma das 4 sessões vivas medidas às 21:41.
- O agente lê esse registro e mostra a sessão: `[ACTIVE] claude-code ... pid=28884
  confiança=confirmed fontes=claude:hook+claude:process`. Antes disso o probe não via Claude nenhum.
- Corrigido no meio do caminho: a primeira versão rotulava `ide=CLI` quando nenhum lock batia na
  cadeia de pais. Errado — o PID 28884 é hospedado por IDE e mesmo assim não bate lock. Virou
  `ide=null` com evidência "origem indeterminada", que é o que se sabe.

**O que continua NÃO provado, e é o critério #1:** que o Claude Code honra `decision:"block"` e
injeta o `reason` na sessão. Depende de instalar o hook no settings.json, e o classifier de permissões
desta sessão barra a escrita nesse arquivo mesmo com a autorização do usuário. Snippet pronto em
`evidence/instalar-hook.md` para ele colar.
