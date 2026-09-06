# Tarefa 3.0: Entregar plugin do Claude Code e pipeline de release

<critical>Ler prd.md e techspec.md desta pasta (raiz da SPEC); sem essa leitura a tarefa é invalidada</critical>

## Visão Geral

Empacotar os hooks como plugin removível e publicar os executáveis verificáveis usados pelo instalador.

<skills>
### Conformidade com Skills Padrões

`context7-mcp`; documentação oficial de plugins/hooks do Claude Code.
</skills>

<requirements>

- Cobrir RF-6 e RF-7.
- Nenhuma edição manual de `settings.json` e nenhuma referência ao checkout do projeto.
- Hook sempre fail-open e plugin validável pela CLI oficial.
</requirements>

## Subtarefas

- [ ] 3.1 Criar marketplace, manifesto, hooks e wrapper relativo a CLAUDE_PLUGIN_ROOT
- [ ] 3.2 Criar workflow que compila dois executáveis baseline e publica hashes em tag
- [ ] 3.3 Integrar instalação, atualização, recarga e remoção do plugin ao bootstrap
- [ ] 3.4 Criar e executar validação estrutural e passe local do plugin

## Detalhes de Implementação

Seguir `techspec.md`, Pontos de Integração e decisões de marketplace GitHub.

## Critérios de Sucesso

- Plugin instala em escopo de usuário e aparece em `/hooks`.
- `/reload-plugins` ativa sessões abertas.
- Falha do executável não bloqueia Claude Code.

## Testes da Tarefa

- [ ] Testes de unidade
- [ ] Testes de integração
- [ ] Teste local com Claude Code

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

`.claude-plugin/marketplace.json`, `plugins/conect-sessions/*`, `.github/workflows/agent-release.yml`, `tests/plugin/*`.
