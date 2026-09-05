# Instalar o hook do Claude Code — passo manual

> **Atualizado em 2026-09-05.** O canal foi provado em sessão real (`evidence/prova-canal-stop.md`).
> Se você já tinha colado a versão de 04/09, **atualize o `claude-hook.mjs`**: a versão antiga
> emitia `decision` aninhado e o Claude Code ignorava — a resposta era consumida e sumia.

O classifier de permissões do Claude Code barra a escrita em `~/.claude/settings.json` mesmo com
autorização explícita do usuário. A guarda está certa: instalar hook é permitir execução de código
a cada turno, em todas as sessões da máquina. Então esse passo é seu.

## 1. Cole isto em `~/.claude/settings.json`

Você **já tem** um bloco `"hooks"` com os sons. Não substitua — some. O `"Stop"` vira uma lista com
DOIS itens (o som que já existe + o nosso), e `"SessionStart"`/`"SessionEnd"` são novos.

```jsonc
  "hooks": {
    "Notification": [ /* ...deixe como está... */ ],
    "PreToolUse":   [ /* ...deixe como está... */ ],

    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -c \"(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\done.wav').PlaySync()\""
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"c:/dev/meus projetos/conect-sessions/public/agent/claude-hook.mjs\"",
            "timeout": 60
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"c:/dev/meus projetos/conect-sessions/public/agent/claude-hook.mjs\"",
            "timeout": 60
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"c:/dev/meus projetos/conect-sessions/public/agent/claude-hook.mjs\"",
            "timeout": 60
          }
        ]
      }
    ]
  },
```

## 1b. Opcional — destravar prompt de permissão pelo celular

Some ao `PreToolUse` que você já tem. **Só ligue numa máquina de onde você sai de perto**: para
destravar o prompt o hook precisa ESPERAR a sua escolha, e essa espera cai em quem estiver sentado ali.

```jsonc
    "PreToolUse": [
      { /* ...o som que já existe, deixe como está... */ },
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"c:/dev/meus projetos/conect-sessions/public/agent/claude-hook.mjs\"",
            "timeout": 300
          }
        ]
      }
    ],
```

O caminho acima aponta para o repositório. Em outra máquina, aponte para onde o `claude-hook.mjs`
estiver — é arquivo único, Node puro, sem dependência.

## 2. O que esperar depois de colar

- Abra uma sessão nova de Claude Code. Deve aparecer `~/.lrc/sessions/claude-<sessionId>.json` com
  `pid`, `proc_name` e `proc_start` preenchidos.
- `node public/agent/remote-agent.mjs --probe` passa a listar sessões `claude-code` com
  `confiança=confirmed` — hoje ele lista zero.

## 3. O teste que fecha o critério #1

Ainda com a sessão aberta, num outro terminal:

```bash
# troque <sessionId> pelo id do arquivo que apareceu em ~/.lrc/sessions/
echo '{"id":"teste","content":"responda apenas a palavra ABACAXI","at":"2026-09-04T22:00:00Z"}' \
  >> ~/.lrc/inbox/claude-<sessionId>.jsonl
```

Volte à sessão do Claude Code e mande qualquer coisa (ou espere o turno atual acabar). No fim do
turno o hook drena o inbox e a sessão deve **continuar sozinha** e responder ABACAXI, sem você
digitar. Se isso acontecer, o canal está provado e o critério #1 fecha.

Se não acontecer, o hook não é o caminho e a SPEC precisa de outra fase de investigação — não
adianta seguir construindo em cima.

## 4. Ligar e desligar

- `LRC_HOOK=0` deixa o hook inteiro inerte (sai calado, não escreve nada).
- `LRC_PERM=1` **arma** o canal de permissão; sem ele o `PreToolUse` sai em ~65ms e não espera nada.
- `LRC_PERM_WAIT=120` é o teto da espera em segundos. Estourou, o modal abre como sempre abriu.

O `timeout` do hook no settings precisa ser MAIOR que `LRC_PERM_WAIT`, senão o Claude Code mata a
espera antes de a sua escolha chegar.

## 5. O que já está provado sem este passo

- O hook drena o inbox e emite o JSON correto (entrada semeada → `decision:"block"` com o texto).
- A resolução de PID funciona: achou `claude.exe` PID 28884 com `proc_start` batendo, subindo a
  árvore de processos e pulando as cascas de shell.
- O agente lê o registro do hook e passa a enxergar a sessão de Claude com `confiança=confirmed`.

O que falta é só a última perna: o Claude Code honrar o `decision:"block"`.
