# SPEC-20260905-2251: instalação simples

**Status:** done
**Porte:** G
**Owner:** @allan
**Criada:** 2026-09-05 22:51
**Ativada:** 2026-09-05 22:51
**Concluída:** 2026-09-06 11:29
**Pausada em:** —
**Commit final:** `0f391fd`
**Keywords:** instalação, pareamento, Windows, Claude Code, plugin, onboarding
**Features:** dashboard
**Branch:** codex/instalacao-simples
**Programa:** —
**Workspace:** —
**Origem:** usuário em 2026-09-05 22:51
**PRD:** prd.md (2026-09-05 22:56)
**TechSpec:** techspec.md (2026-09-05 23:02)
**Tasks:** tasks.md (2026-09-05 23:05)
**Resumo:** Conectar uma máquina Windows e habilitar respostas no Claude Code com um único comando, sem edição manual de JSON nem exposição do token permanente.

## Objetivo

Transformar o protótipo de agente e hook em um onboarding distribuível para outras pessoas. O usuário deve adicionar uma máquina pelo painel, executar um único comando PowerShell e receber confirmação verificável de que agente, inicialização automática e integração com Claude Code estão operacionais.

## Escopo

**DENTRO:**
- Jornada autenticada “Adicionar máquina” com nome, código temporário e comando único para Windows 10/11.
- Pareamento de uso único que entrega uma credencial permanente sem exibi-la no painel ou no histórico do comando.
- Instalação idempotente do agente local, inicialização automática e diagnóstico do estado da máquina.
- Plugin distribuível do Claude Code contendo os hooks necessários, sem editar `settings.json` manualmente.
- Atualização, reparo, desinstalação local e revogação da máquina no painel.
- Funcionamento com várias máquinas por usuário e degradação segura quando Claude Code ou plugin não estiver disponível.

**FORA:**
- Instaladores para macOS ou Linux.
- Novo mecanismo de instalação, hook ou resposta para Kiro; seu comportamento atual permanece intacto.
- Substituir o Remote Control nativo da Anthropic ou integrar-se a APIs privadas dele.
- Publicação em lojas externas, assinatura comercial de executável ou submissão ao marketplace oficial da Anthropic.

## Invariantes

- NUNCA expor a credencial permanente do agente no comando copiável, URL, log do instalador ou banco em texto puro.
- SEMPRE limitar o código de pareamento a um usuário, uma utilização e uma expiração curta.
- NUNCA sobrescrever hooks/configurações existentes do Claude Code; a integração vive em plugin isolado e removível.
- SEMPRE falhar de forma segura: erro de agente ou hook não pode bloquear uma sessão local do usuário.
- SEMPRE endereçar respostas à sessão que as originou, preservando o isolamento entre máquinas e sessões.

## Implementação

O painel emitirá um pareamento temporário autenticado e mostrará um comando PowerShell que baixa um bootstrap público. O bootstrap trocará o código uma única vez, instalará o agente em diretório próprio do usuário, registrará inicialização automática, instalará o plugin do Claude Code por seu mecanismo oficial e executará um diagnóstico. O painel apresentará as fases do pareamento e permitirá revogar a máquina.

### Modelo de dados

| Entidade | Campos / mudança |
|---|---|
| agents | estado/versão/diagnóstico da instalação e revogação explícita |
| agent_pairing_codes | hash do código, usuário, nome pretendido, expiração, consumo e vínculo ao agente criado |

Alternativas rejeitadas: editar `~/.claude/settings.json` continua frágil e mistura configurações do usuário; colocar token permanente no comando ou URL deixa segredo em histórico; automação de teclado não preserva o roteamento por sessão; depender apenas do Remote Control restringe o produto ao Claude Code e ao ecossistema Anthropic.

## Riscos

- Bootstrap remoto executa código na máquina — mitigação: conteúdo legível, origem HTTPS fixa, confirmação explícita, escopo de usuário e diagnóstico detalhado.
- Código capturado antes do uso — mitigação: hash no banco, validade curta, consumo atômico e vínculo ao usuário autenticado que o emitiu.
- Plugin muda entre versões do Claude Code — mitigação: versão mínima verificada, validação oficial do plugin, falha não bloqueante e mensagem de atualização.
- Inicialização automática pode falhar por política do Windows — mitigação: instalação idempotente, diagnóstico e comando de reparo, sem exigir administrador no fluxo normal.

## Sinais de sucesso

- Um usuário novo conecta uma máquina Windows em até três minutos copiando um único comando e sem abrir arquivos de configuração.
- O painel diferencia claramente aguardando instalação, conectado, desatualizado e com erro, permitindo reparar ou remover.
- Uma resposta enviada pelo painel chega à sessão correta do Claude Code após a instalação do plugin.

## Critério de aceite

- [x] O painel gera para uma máquina um pareamento de uso único, expira códigos antigos e nunca retorna a credencial permanente ao navegador (cobre RF-1, RF-2, RF-3, RF-8) (2026-09-06 11:28, commit `0f391fd`, verify: exit 0) | verify: `bun run test:installer`
- [x] O comando único instala ou repara idempotentemente o agente no escopo do usuário, preserva a credencial fora do histórico e configura início automático no Windows 10/11 (cobre RF-4, RF-5, RF-9) (2026-09-06 11:28, commit `0f391fd`, verify: exit 0) | verify: `bun run test:installer`
- [x] O plugin do Claude Code é validado, instalável sem edição manual de `settings.json`, usa caminho relativo ao próprio plugin e falha sem bloquear a sessão (cobre RF-6, RF-7) (2026-09-06 11:29, commit `0f391fd`, verify: exit 0) | verify: `bun run test:plugin`
- [x] O painel mostra progresso e diagnóstico acionáveis, suporta várias máquinas e permite copiar reparo, revogar e orientar desinstalação com controles acessíveis (cobre RF-1, RF-8, RF-10, RF-11) (2026-09-06 11:29, commit `0f391fd`, verify: exit 0) | verify: `bun run test:onboarding`
- [ ] Uma instalação real em Windows conecta o agente reiniciado automaticamente e entrega uma resposta à sessão correta do Claude Code em até três minutos, sem editar JSON | evidence: manual @allan [aceito-incompleto: "Transferir para a SPEC-20260906-1122 (Recomendado)" 2026-09-06 11:26]
- [x] TypeScript, lint e build de produção passam sem regressão no fluxo atual de Kiro e sincronização dos agentes existentes (cobre RF-12) (2026-09-06 11:29, commit `0f391fd`, verify: exit 0) | verify: `bunx tsc --noEmit && bun run lint && bun run build`
