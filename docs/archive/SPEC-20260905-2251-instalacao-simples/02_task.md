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

- [x] 2.1 Adaptar o agente para configuração protegida, versão, diagnóstico e execução compilada
- [x] 2.2 Criar bootstrap, launcher e desinstalador PowerShell idempotentes
- [x] 2.3 Servir bootstrap público com origem correta e sem segredo permanente
- [x] 2.4 Criar e executar testes em HOME/LocalAppData isolados e build Windows x64 baseline

## Detalhes de Implementação

Seguir `techspec.md`, componentes `install-agent.ps1`/`launcher.ps1` e decisões Bun/DPAPI/HKCU.

## Critérios de Sucesso

- Um comando conclui a instalação normal.
- Reexecução não duplica autostart nem identidade.
- Token não aparece em arquivo plano, comando copiável ou log.

## Testes da Tarefa

- [x] Testes de unidade
- [x] Testes de integração
- [x] Testes E2E em Windows isolado — `tests/installer/windows-e2e.test.ts` compila o agente real, serve o bootstrap renderizado, instala com um comando em raiz/chave Run/USERPROFILE isolados, confirma o agente autenticando com o token que ele mesmo descriptografou, sincronizando a sessão e recebendo a resposta endereçada a ela, executa literalmente o valor de Run para simular o logon e remove sem rastro. Segue fora da automação (critério de aceite 5, evidência manual de @allan): download do release real do GitHub e round-trip dentro do Claude Code, que depende do plugin da task 3.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

`public/agent/*`, `src/routes/api/public/agent/install.ts`, `tests/installer/*`, `package.json`.
