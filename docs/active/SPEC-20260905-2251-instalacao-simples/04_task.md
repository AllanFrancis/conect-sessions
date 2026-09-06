# Tarefa 4.0: Entregar onboarding e gestão de máquinas no painel

<critical>Ler prd.md e techspec.md desta pasta (raiz da SPEC); sem essa leitura a tarefa é invalidada</critical>

## Visão Geral

Substituir a tela técnica de tokens pela jornada guiada de adicionar, acompanhar, reparar, revogar e remover máquinas.

<skills>
### Conformidade com Skills Padrões

`frontend-design`, `ui-ux-pro-max`, `ui-styling`, `supabase`.
</skills>

<requirements>

- Cobrir RF-1, RF-10 e RF-11, com RF-8 refletido no estado.
- Preservar linguagem visual do terminal sem sacrificar clareza ou acessibilidade.
- Funcionar em celular e desktop, teclado e leitor de tela.
</requirements>

## Subtarefas

- [ ] 4.1 Projetar estados e componentes responsivos da jornada
- [ ] 4.2 Implementar criação/polling, cópia de comando e progresso anunciado
- [ ] 4.3 Implementar reparo, expiração, revogação e instruções de desinstalação
- [ ] 4.4 Criar e executar testes de estado, acessibilidade e viewports

## Detalhes de Implementação

Seguir `techspec.md` e a Experiência do Usuário do PRD; reutilizar componentes shadcn existentes.

## Critérios de Sucesso

- Usuário nunca precisa manipular token ou JSON.
- Todo erro oferece ação concreta.
- Estados são compreensíveis sem depender de cor.

## Testes da Tarefa

- [ ] Testes de unidade
- [ ] Testes de integração
- [ ] Testes E2E móvel e desktop

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

`src/routes/_authenticated/agents.tsx`, `src/components/*`, `tests/onboarding/*`.
