# ARCHIVE-INDEX

> GERADO — specctl index — NÃO EDITAR

SPEC-20260904-1433-dashboard-somente-ativas | done | dashboard | dashboard, somente, ativas | O painel passa a listar somente sessões com status `active`, escondendo idle/finished/unknown.
SPEC-20260904-1457-transcricao-formatada | done | dashboard | dashboard | A transcrição passa a renderizar markdown de verdade (código em card), a mostrar pergunta de escolha como botões clicáveis, e a entender também o formato do Kiro — que até aqui chegava ao painel como sessão vazia.
SPEC-20260904-2036-sync-resiliente | done | dashboard | dashboard | O round-trip do `/sync` para de entregar a mesma resposta várias vezes e para de perder mensagem quando o POST falha.
SPEC-20260904-2135-resposta-chega-no-cli | done | dashboard | dashboard | A resposta enviada do celular deixa de morrer no console do agente e chega de fato à sessão de IA, inclusive desbloqueando um prompt de permissão.
SPEC-20260904-2135-sessoes-duplicadas-no-banco | done | dashboard | dashboard | A mesma sessão de IA para de aparecer mais de uma vez no painel quando foi sincronizada por agentes diferentes.
SPEC-20260905-1833-agente-ignora-claude-config-dir | done | dashboard | dashboard | O agente passa a ler as transcrições de onde o Claude Code de fato as escreve (`CLAUDE_CONFIG_DIR`), em vez de só em `~/.claude`.
SPEC-20260905-1944-sessao-layout-mobile | done | dashboard | dashboard | A página da sessão vira uma conversa de celular — barra fixa no topo, bolha do usuário à direita, ferramenta dobrada numa linha e composer fixo embaixo.
SPEC-20260905-2251-instalacao-simples | done | dashboard | instalação, pareamento, Windows, Claude Code, plugin, onboarding | Conectar uma máquina Windows e habilitar respostas no Claude Code com um único comando, sem edição manual de JSON nem exposição do token permanente.
SPEC-20260906-1146-bootstrap-sem-bom | done | dashboard | dashboard | Servir o bootstrap sem BOM, porque ele é executado como string por [scriptblock]::Create() e o U+FEFF impede o parser de reconhecer o `<#` inicial.
