# Tarefa 5.0: Validar integração completa, QA e review

<critical>Ler prd.md e techspec.md desta pasta (raiz da SPEC); sem essa leitura a tarefa é invalidada</critical>

## Visão Geral

Provar a jornada de ponta a ponta numa máquina Windows real, validar regressões e produzir os artefatos de QA/review exigidos.

<skills>
### Conformidade com Skills Padrões

`executar-qa`, `executar-review`, `executar-bugfix` se necessário, `task-review`.
</skills>

<requirements>

- Cobrir RF-1..RF-12 e todos os critérios do `main.md`.
- Validar tempo, autostart, plugin, round-trip, Kiro, acessibilidade, typecheck, lint e build.
- Corrigir bugs encontrados; não aceitar ou deferir gaps sem decisão explícita do usuário.
</requirements>

## Subtarefas

- [ ] 5.1 Executar E2E completo no painel e instalação isolada
- [ ] 5.2 Executar passe real Windows + Claude Code e preservar evidências
- [ ] 5.3 Executar QA, corrigir bugs e repetir testes
- [ ] 5.4 Executar review final, gates da SPEC e preparar fechamento

## Detalhes de Implementação

Seguir `techspec.md`, Abordagem de Testes, e os critérios em `main.md`.

## Critérios de Sucesso

- Instalação e round-trip reais comprovados em até três minutos.
- Nenhum bug Alta/Média aberto e nenhuma regressão no Kiro.
- Todos os gates e critérios binários passam.

## Testes da Tarefa

- [ ] Testes de unidade
- [ ] Testes de integração
- [ ] Testes E2E e passe real

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

`docs/active/SPEC-20260905-2251-instalacao-simples/evidence/*`, `qa-report.md`, `review-report.md`, `bugs.md`.
