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

- [x] 4.1 Projetar estados e componentes responsivos da jornada
- [x] 4.2 Implementar criação/polling, cópia de comando e progresso anunciado
- [x] 4.3 Implementar reparo, expiração, revogação e instruções de desinstalação
- [x] 4.4 Criar e executar testes de estado, acessibilidade e viewports

## Detalhes de Implementação

Seguir `techspec.md` e a Experiência do Usuário do PRD; reutilizar componentes shadcn existentes.

## Critérios de Sucesso

- Usuário nunca precisa manipular token ou JSON.
- Todo erro oferece ação concreta.
- Estados são compreensíveis sem depender de cor.

## Testes da Tarefa

- [x] Testes de unidade
- [x] Testes de integração
- [ ] Testes E2E móvel e desktop — TRANSFERIDO para a task 5 (subtarefa 5.1) por decisão
      do usuário em 2026-09-06: "Passe no navegador na task 5 (QA)". Esta task entregou
      unidade, integração em PGlite e render SSR real dos componentes; o que o SSR não
      alcança (geometria em 360px, diálogo de revogação aberto, aria-live numa transição
      real e ordem de foco) é o passe de navegador lá.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

`src/routes/_authenticated/agents.tsx`, `src/components/*`, `tests/onboarding/*`.
