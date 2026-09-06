# Tarefa 1.0: Entregar pareamento seguro e revogação

<critical>Ler prd.md e techspec.md desta pasta (raiz da SPEC); sem essa leitura a tarefa é invalidada</critical>

## Visão Geral

Criar o contrato persistente e as APIs que trocam um código temporário por uma credencial de máquina exatamente uma vez, preservam agentes antigos e permitem revogação sem apagar histórico.

<skills>
### Conformidade com Skills Padrões

`supabase`, `supabase-postgres-best-practices`, `context7-mcp`.
</skills>

<requirements>

- Cobrir RF-2, RF-3, RF-8, RF-11 e a compatibilidade de RF-12.
- RLS por usuário, grants explícitos e consumo transacional sob concorrência.
- Nenhum código ou token permanente em logs ou armazenamento reversível no banco.
</requirements>

## Subtarefas

- [x] 1.1 Criar migration de pareamentos, telemetria de agentes, índices, RLS e RPC atômica
- [x] 1.2 Atualizar tipos Supabase e funções autenticadas de criar/reparar/revogar
- [x] 1.3 Criar endpoint público de troca e estender sync de forma retrocompatível
- [x] 1.4 Criar e executar testes de hash, expiração, consumo único, concorrência, RLS e revogação

## Detalhes de Implementação

Seguir `techspec.md`, seções Modelos de Dados e Endpoints de API.

## Critérios de Sucesso

- Duas trocas concorrentes nunca geram duas credenciais.
- Revogação bloqueia sync e preserva sessões.
- Agente sem os campos novos continua aceito.

## Testes da Tarefa

- [x] Testes de unidade
- [x] Testes de integração
- [ ] Testes E2E (não aplicável nesta tarefa)

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

`supabase/migrations/*`, `src/integrations/supabase/types.ts`, `src/lib/agents.functions.ts`, `src/routes/api/public/agent/*`, `tests/installer/*`.
