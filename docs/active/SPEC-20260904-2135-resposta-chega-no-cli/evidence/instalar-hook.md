# Instalar o hook do Claude Code — passo manual

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

## 4. Para desligar sem desinstalar

`LRC_HOOK=0` no ambiente deixa o hook inerte (sai calado, não escreve nada).

## 5. O que já está provado sem este passo

- O hook drena o inbox e emite o JSON correto (entrada semeada → `decision:"block"` com o texto).
- A resolução de PID funciona: achou `claude.exe` PID 28884 com `proc_start` batendo, subindo a
  árvore de processos e pulando as cascas de shell.
- O agente lê o registro do hook e passa a enxergar a sessão de Claude com `confiança=confirmed`.

O que falta é só a última perna: o Claude Code honrar o `decision:"block"`.
