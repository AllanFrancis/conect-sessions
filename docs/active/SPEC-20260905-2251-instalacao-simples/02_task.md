# Tarefa 2.0: Entregar bootstrap e agente autossuficiente para Windows

<critical>Ler prd.md e techspec.md desta pasta (raiz da SPEC); sem essa leitura a tarefa é invalidada</critical>

## Visão Geral

Produzir um comando único que instala ou repara o agente sem Node e sem administrador, protege a credencial e inicia o processo após login.

<skills>
### Conformidade com Skills Padrões

`context7-mcp`; regras de segurança e PowerShell da TechSpec.
</skills>

<requirements>

- Cobrir RF-4, RF-5 e RF-9.
- Usar DPAPI CurrentUser, diretório LocalAppData e inicialização HKCU idempotente.
- Verificar SHA-256 dos executáveis antes da substituição.
</requirements>

## Subtarefas

- [ ] 2.1 Adaptar o agente para configuração protegida, versão, diagnóstico e execução compilada
- [ ] 2.2 Criar bootstrap, launcher e desinstalador PowerShell idempotentes
- [ ] 2.3 Servir bootstrap público com origem correta e sem segredo permanente
- [ ] 2.4 Criar e executar testes em HOME/LocalAppData isolados e build Windows x64 baseline

## Detalhes de Implementação

Seguir `techspec.md`, componentes `install-agent.ps1`/`launcher.ps1` e decisões Bun/DPAPI/HKCU.

## Critérios de Sucesso

- Um comando conclui a instalação normal.
- Reexecução não duplica autostart nem identidade.
- Token não aparece em arquivo plano, comando copiável ou log.

## Testes da Tarefa

- [ ] Testes de unidade
- [ ] Testes de integração
- [ ] Testes E2E em Windows isolado

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

`public/agent/*`, `src/routes/api/public/agent/install.ts`, `tests/installer/*`, `package.json`.
