# PRD: Instalação simples do Conect Sessions

**Origem:** local

## Visão Geral

O Conect Sessions já monitora sessões e transporta respostas entre painel, servidor e agente local, mas exige que o usuário crie um token, monte comandos e edite manualmente a configuração de hooks do Claude Code. Essa jornada impede a distribuição do produto e cria risco de segredo exposto ou configuração inválida. A funcionalidade transforma a conexão de uma máquina Windows em uma experiência guiada e verificável, adequada a pessoas que não conhecem PowerShell, JSON ou a estrutura interna do Claude Code.

## Objetivos

- Permitir que um usuário autenticado conecte uma máquina Windows 10/11 em até três minutos.
- Reduzir a instalação normal a um único comando copiado do painel e uma confirmação explícita na máquina.
- Eliminar edição manual de arquivos de configuração e exposição de credencial permanente ao navegador ou histórico do comando.
- Confirmar no painel se a máquina, o agente e a integração com Claude Code estão prontos, com orientação acionável quando não estiverem.
- Manter suporte a várias máquinas por conta sem misturar credenciais ou sessões.

## Histórias de Usuário

- Como usuário novo, quero nomear meu computador e copiar um único comando para começar sem entender a arquitetura do produto.
- Como usuário cuidadoso com segurança, quero autorizar a instalação conscientemente sem ver ou transportar a credencial permanente da máquina.
- Como usuário com notebook e desktop, quero reconhecer o estado de cada máquina e revogar apenas a que eu escolher.
- Como usuário que já instalou o produto, quero executar novamente o comando para reparar ou atualizar sem duplicar processos e dados.
- Como usuário que removeu o produto, quero impedir imediatamente novas sincronizações daquela máquina.
- Como usuário de Kiro, quero que a nova instalação do Claude Code não altere o comportamento que já funciona.

## Funcionalidades Principais

- **RF-1 — Jornada de adição:** o painel deve permitir nomear uma nova máquina e iniciar uma jornada guiada de conexão.
- **RF-2 — Pareamento temporário:** o painel deve emitir uma autorização de instalação com validade curta, uso único e vínculo ao usuário autenticado.
- **RF-3 — Proteção da credencial:** a credencial permanente da máquina não deve ser exibida ao navegador, incorporada no comando copiável ou recuperável a partir do valor armazenado no banco.
- **RF-4 — Comando único:** o painel deve fornecer um único comando PowerShell para concluir a instalação normal em Windows 10/11.
- **RF-5 — Agente persistente:** a instalação deve deixar o agente disponível após fechar o terminal, reiniciar a sessão do Windows ou atualizar o produto.
- **RF-6 — Integração distribuível:** o Claude Code deve receber a integração necessária por uma unidade instalável e removível, sem edição manual de JSON.
- **RF-7 — Sessões existentes:** a jornada deve informar e oferecer o passo suportado para ativar a integração numa sessão do Claude Code já aberta.
- **RF-8 — Consumo atômico:** tentativas concorrentes, repetidas ou posteriores à expiração não devem criar duas máquinas nem emitir duas credenciais.
- **RF-9 — Reparo e atualização:** repetir a instalação deve reparar arquivos e configuração sem criar inicializações automáticas duplicadas ou perder a identidade da máquina.
- **RF-10 — Estado observável:** o painel deve distinguir ao menos “aguardando instalação”, “conectada”, “com atenção” e “revogada”, indicando a ação recomendada.
- **RF-11 — Remoção segura:** o usuário deve poder revogar uma máquina no painel e receber uma forma simples de desinstalar seus componentes locais.
- **RF-12 — Compatibilidade:** agentes existentes e o fluxo atual do Kiro devem continuar sincronizando sem exigir migração imediata.

## Experiência do Usuário

A jornada começa em “Adicionar máquina”, não em “Criar token”. Após informar um nome, o usuário vê um cartão de três etapas: copiar comando, executá-lo no PowerShell e aguardar a confirmação automática. O código e os detalhes internos ficam ocultos; o comando tem botão de cópia e texto alternativo claro. O estado muda sem recarregar a página e erros explicam o que ocorreu e qual ação tomar.

Controles devem ser operáveis por teclado, ter nome acessível, alvo de toque adequado e não depender apenas de cor. Mensagens de progresso devem ser anunciadas a tecnologias assistivas. Revogação exige confirmação e deixa explícito que interrompe a sincronização; reinstalação e reparo devem ser distinguíveis de criar outra máquina.

## Restrições Técnicas de Alto Nível

- A instalação normal não pode exigir privilégio de administrador.
- O usuário deve consentir explicitamente com a execução do instalador e do plugin.
- Dados sensíveis permanecem protegidos em trânsito e em repouso; o servidor não armazena credencial permanente em texto puro.
- Autorizações temporárias devem resistir a repetição e concorrência.
- A integração deve usar superfícies públicas e suportadas do Claude Code.
- Falhas da integração não podem impedir o uso local normal do Claude Code.
- A experiência deve funcionar no layout móvel já adotado pelo painel.

## Fora de Escopo

- macOS, Linux e instalação em nível de máquina para todos os usuários do Windows.
- Novo mecanismo de instalação ou resposta para Kiro.
- Integração com APIs privadas do Remote Control da Anthropic.
- Assinatura comercial de binário, publicação em Winget/Microsoft Store ou submissão ao marketplace oficial da Anthropic.
- Administração centralizada de instalações empresariais por políticas gerenciadas.
