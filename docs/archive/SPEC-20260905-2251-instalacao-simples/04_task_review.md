# Review: Task 4.0 - Entregar onboarding e gestão de máquinas no painel

**Revisor**: AI Code Reviewer
**Arquivo da task**: 04_task.md
**Status atual (ciclo 2, 2026-09-06)**: APROVADO
**Histórico**: ciclo 1 (2026-09-06) — MUDANÇAS SOLICITADAS, 4 major e 7 minor; preservado na íntegra ao final deste arquivo.

---

# Ciclo 2 — re-review (2026-09-06)

## Resumo do ciclo 2

Os quatro major do ciclo 1 estão resolvidos, e cada um foi conferido no artefato, não no relato: `createAgent` sumiu do módulo E do bundle de produção recompilado; o rastreador de passos agora carrega a conclusão em texto e os dois estados produzem árvores acessíveis diferentes; os dois controles do diálogo destrutivo receberam `min-h-11`; e o ícone do badge renderiza com `size-4` em todos os cinco ramos, sobrescrevendo o `width="24"` que o lucide emite como atributo. Os sete minor também foram endereçados, e três deles ganharam teste próprio (`credential-surface`, `version-contract`, a asserção de forma por estado).

A qualidade das correções está acima do mínimo pedido em dois pontos que merecem registro. Primeiro, MAJOR-1 foi resolvido pela remoção, com a consequência escrita no código e a decisão atribuída ao usuário — e o teste que o acompanha não guarda a ausência de `createAgent`, guarda a lista fechada de exports do módulo, que é a forma correta de fixar uma superfície. Segundo, as asserções fracas apontadas em MINOR-4 não foram só trocadas: o arquivo agora declara, em comentário, que os asserts de classe Tailwind são proxy e que a prova de geometria é o passe de navegador — o teste parou de sugerir cobertura que não tem.

Nenhuma regressão funcional foi encontrada. Restam três observações menores, todas novas e todas na correção do MINOR-7 e do MINOR-6 — nenhuma delas bloqueia a task nem altera critério de aceite.

**Escopo transferido, não achado:** o passe de navegador (viewport de 360px, diálogo aberto, ordem de foco, `aria-live` em transição real) segue na task 5 por decisão do usuário — "Passe no navegador na task 5 (QA)" —, listado em `05_task.md`. Continua fora da conta desta review.

## Verificação achado a achado

| Achado do ciclo 1 | Situação | Como foi verificado nesta review |
|---|---|---|
| MAJOR-1 — `createAgent` órfão emitindo token em texto puro | ✅ Resolvido | `src/lib/agents.functions.ts` exporta só `createAgentPairing`, `cancelAgentPairing` e `revokeAgent`; `grep -rho "createAgent[A-Za-z_]*" .output/server/` devolve apenas `createAgentPairing`, `createAgentPairing_createServerFn_handler` e `createAgentToken` (esta última é a geração server-side de token em `agent-pairing.ts`, usada por `/api/public/agent/pair`, não um server fn). O bundle é posterior a toda edição de fonte — `find src tests -newer .output/server/_ssr/agents.functions-*.mjs` volta vazio |
| MAJOR-2 — passo a passo só por cor | ✅ Resolvido | `Step` (`agent-onboarding.tsx:106-126`) emite `<span class="sr-only"> (concluído)/(pendente)`; `onboarding-ui.test.tsx:124-134` fatia o `<ol>` dos dois estados, prova que diferem e que `connected` não contém "(pendente)" |
| MAJOR-3 — alvo de toque no diálogo | ✅ Resolvido | `min-h-11` em `AlertDialogCancel` e `AlertDialogAction` (`agent-onboarding.tsx:352,354`), com comentário nas linhas 344-350 registrando por que o SSR não alcança o trecho; `onboarding-ui.test.tsx:248-249` diz explicitamente que os botões do diálogo não estão na varredura |
| MAJOR-4 — ícone do badge a 24px | ✅ Resolvido | `size-4` nos cinco ramos de `StatusIcon`. Render SSR conferido nesta review: `class="lucide lucide-circle-check size-4"` — a classe sobrescreve o atributo `width="24"`, que o lucide continua emitindo. `onboarding-ui.test.tsx:195` assere `size-4` dentro da fatia da pílula, não em qualquer ponto do cartão |
| MINOR-1 — "um código pendente por vez" prometia demais | ✅ Resolvido | Comentário em `agents.tsx:175-186` agora diz o que a função NÃO garante (sair da rota, refresh, aba fechada) e por que cancelar no cleanup seria pior sob StrictMode; `describe` de `pairing-lifecycle.test.ts:26` virou "o que o banco garante sobre código pendente" |
| MINOR-2 — duas severidades para `outdated` | ✅ Resolvido | `adviceStyles` mapeado por status (`agent-onboarding.tsx:64-70`); `onboarding-ui.test.tsx:202-214` isola o `<p>` do conselho e exige âmbar sem `text-destructive` |
| MINOR-3 — `outdated` e `attention` com a mesma forma | ✅ Resolvido | `CircleArrowUp` para `outdated`; o teste monta um `Set` de ícones e exige quatro formas distintas (`onboarding-ui.test.tsx:196-198`) |
| MINOR-4 — asserções fracas | ✅ Resolvido | Ícone nominal por classe lucide dentro da pílula; heading casado por `match(/<h[1-6][ >]/g)` em vez de `not.toContain("<h2")`; a asserção sobre o comprimento da fixture saiu; comentário em `onboarding-ui.test.tsx:232-238` declara o limite dos asserts de classe |
| MINOR-5 — versão em três lugares | ✅ Resolvido | `tests/onboarding/version-contract.test.ts` amarra `currentAgentVersion`, o `AGENT_VERSION` de `remote-agent.mjs` e `plugin.json`, e ainda exige formato semver |
| MINOR-6 — erro de pareamento colapsado | ✅ Resolvido (com ressalva em OBS-3) | `describePairingError` (`agent-onboarding.ts:125-137`) e `onError: (error) => toast.error(describePairingError(error))`; coberto em `agent-onboarding.test.ts:160-165` |
| MINOR-7 — nomes duplicados | ✅ Resolvido (com ressalvas em OBS-1 e OBS-2) | `AddMachineForm` bloqueia o submit, marca `aria-invalid`, aponta `aria-describedby` e exibe `role="alert"` (`agents.tsx:74-108`) |

## Regressões procuradas e não encontradas

- **`describePairingError` chega mesmo ao cliente?** Sim. `@tanstack/start-server-core/dist/esm/server-functions-handler.js:179-198` serializa o erro lançado com `toCrossJSONAsync` e o cliente rejeita com o `Error` reconstruído (`start-client-core/dist/esm/client-rpc/serverFnFetcher.js:178`). A mensagem do RPC e a do `inputValidator` sobrevivem ao round-trip — a correção do MINOR-6 não é decorativa.
- **A remoção de `createAgent` quebrou algum caminho vivo?** Não. Nada em `src/`, `tests/`, `public/` ou `scripts/` referencia o símbolo; typecheck, lint, suíte e build passam. A consequência declarada (máquina nova fora do Windows sem caminho) é coerente com o escopo de `main.md`, que já põe "instaladores para macOS ou Linux" explicitamente FORA.
- **`existingNames` recriado a cada poll de 3s quebra o formulário?** Não. `AddMachineForm` é a mesma instância entre renders e o estado local `name` sobrevive; só o cálculo de `duplicate` refaz.
- **`adviceStyles` mudou a leitura de algum estado que estava certo?** Não. `pending` e `revoked` continuam mudos, `attention` continua destrutivo; só `outdated` mudou, que era o caso do achado.
- **O `sr-only` do `Step` vaza no visual?** Não. É a mesma utilitária já usada em `agents.tsx:90`, e a estrutura (`<span>{children}<span class="sr-only">…</span></span>`) mantém o `flex items-center gap-2` intacto.
- **`consume_agent_pairing` continua reconectando a MESMA máquina?** Sim — nada nesta rodada tocou a migration nem o fluxo de reparo; `pairing-lifecycle.test.ts` segue verde contra PGlite.

## Observações do ciclo 2 (minor, não bloqueantes)

### OBS-1 — a mensagem de nome duplicado entra no nome acessível do campo

`src/routes/_authenticated/agents.tsx:89-109`. O `<span id="machine-name-error">` está DENTRO do `<label>` que envolve o `<input>`. Em rótulo implícito, o nome acessível do campo é o conteúdo textual do `<label>` menos o controle embutido — então, com o nome duplicado, o campo passa a se chamar "Nome da máquina Você já tem uma máquina com esse nome. Use "Reparar" no cartão dela para reinstalar.", e o mesmo texto ainda volta pelo `aria-describedby`, que aponta para esse exato elemento. O leitor de tela lê a frase duas vezes, e o nome do campo muda enquanto a pessoa digita.

Não invalida a correção — o erro chega, é anunciado e o `aria-invalid` está certo. É a mesma frase ocupando dois papéis.

**Correção sugerida:** tirar o `<span>` de dentro do `<label>` e deixá-lo como irmão, mantendo o `aria-describedby`:

```tsx
<label className="flex-1">
  <span className="sr-only">Nome da máquina</span>
  <input … aria-describedby={duplicate ? "machine-name-error" : undefined} />
</label>
{duplicate && <span id="machine-name-error" role="alert" className="…">…</span>}
```

### OBS-2 — a mensagem manda usar "Reparar", mas o botão do cartão nem sempre se chama assim

Mesmo trecho. O texto diz `Use "Reparar" no cartão dela para reinstalar`, e o botão do cartão é `advice?.action ?? "Reparar"` (`agent-onboarding.tsx:327`): vira "Atualizar" em `outdated`, "Reconectar" em `revoked` e "Refazer instalação" em `pending`. Para uma máquina desatualizada ou revogada — justamente as que alguém tentaria "adicionar de novo" — a instrução nomeia um botão que não está na tela.

**Correção sugerida:** referir-se ao cartão sem nomear o botão ("Use o botão de reinstalação no cartão dela"), ou derivar o rótulo do `advice` da máquina homônima.

Vale registrar junto que o bloqueio só existe depois que `agentsQuery` responde: nos primeiros instantes da página `existingNames` é `[]` e um nome duplicado passa. É aceitável — a identidade é o `id`, o guarda é de leitura, não de integridade —, mas convém não descrevê-lo como garantia.

### OBS-3 — o ramo `PAIRING_AUTH_REQUIRED` não cobre a expiração de sessão real

`src/lib/agent-onboarding.ts:133`. O comentário da função justifica esse ramo com "sessão expirada (tentar de novo não reautentica)", mas quem chega primeiro nesse caso é o `requireSupabaseAuth`, que lança `Unauthorized: Invalid token` (`src/integrations/supabase/auth-middleware.ts:89`) antes de qualquer RPC. `PAIRING_AUTH_REQUIRED` só sai do Postgres quando `auth.uid()` é nulo com o JWT já aceito pelo `getClaims` — janela estreitíssima. Na prática, a sessão expirada cai no genérico "Verifique sua conexão e tente de novo", que é a ação errada.

**Correção sugerida:** incluir o prefixo do middleware no mesmo ramo — `if (/PAIRING_AUTH_REQUIRED|Unauthorized/.test(message))` — e cobrir com um caso de teste usando a mensagem que o middleware realmente produz.

### OBS-4 — `AddMachineForm` é o único componente da jornada sem cobertura

Os demais foram extraídos para `src/components/agent-onboarding.tsx` exatamente para que o render SSR pudesse alcançá-los; `AddMachineForm` ficou na rota e não é exportado, então o bloqueio de duplicidade, o `aria-invalid` e o `role="alert"` não têm assert. É a única correção deste ciclo cuja prova é a leitura do código. Exportar o componente (ou movê-lo para o mesmo módulo dos outros) deixaria a regressão barata de pegar; alternativamente, entra na lista de verificação da task 5.

## Validação executada (ciclo 2, nesta máquina)

| Comando | Resultado |
|---------|-----------|
| `bunx tsc --noEmit` | ✅ exit 0 |
| `bun test tests` | ✅ 88 testes, 0 falhas, 385 asserções, 15 arquivos |
| `bun run test:onboarding` (verify do critério de aceite) | ✅ 36 testes, 0 falhas, 154 asserções, 5 arquivos |
| `bun run lint` | ✅ 0 erros; 6 warnings `react-refresh` pré-existentes em `src/components/ui/*` |
| `grep -rho "createAgent[A-Za-z_]*" .output/server/` | ✅ sem `createAgent_createServerFn_handler`; bundle mais novo que toda fonte |
| Render SSR de `MachineStatusBadge` nos cinco estados | ✅ `size-4` presente em todos; classes lucide distintas por estado |
| Serialização de erro de server fn (leitura de `@tanstack/start-*`) | ✅ mensagem preservada do servidor ao cliente |

## Veredito do ciclo 2

**APROVADO.** Os quatro major e os sete minor do ciclo 1 estão resolvidos, cada um verificado no artefato construído e não apenas no diff: o handler de credencial em texto puro não existe mais no bundle, a conclusão dos passos existe fora da cor, o diálogo destrutivo alcança 44px e o ícone de estado renderiza na escala certa. Os testes acrescentados fixam o que precisava ser fixado — a superfície exportada do módulo de server functions, a versão em três arquivos, a forma própria de cada estado — e o arquivo de UI agora declara honestamente onde termina o alcance do SSR.

As quatro observações acima são menores, todas dentro das correções de MINOR-6 e MINOR-7, e nenhuma toca invariante da SPEC nem critério de aceite. OBS-1 e OBS-3 são de uma linha cada e cabem no próximo commit desta branch; OBS-2 e OBS-4 podem entrar na lista da task 5. A task 4 está pronta para o passe de navegador.

---

# Ciclo 1 — 2026-09-06 (histórico preservado)

**Status do ciclo 1**: MUDANÇAS SOLICITADAS

## Resumo

A jornada guiada substitui de fato a tela de tokens: nenhuma superfície da UI ainda exibe, copia ou pede credencial permanente, o estado da máquina é derivado do que o banco prova, cada estado fora de "conectada" traz motivo e ação em texto, e a cobertura sai do grep de fonte — o teste de UI renderiza a árvore real com `react-dom/server` e o teste de ciclo de vida roda a RPC de verdade em PGlite. A correção do `Progress` é um bug real de acessibilidade que existia antes da task e agora tem assert.

Restam quatro achados major. Um é de segurança residual: a task removeu o último chamador de `createAgent`, mas a função continua registrada como endpoint no bundle de produção, devolvendo token permanente em texto puro a qualquer sessão autenticada — exatamente a superfície que a SPEC existe para fechar. Os outros três são a promessa de acessibilidade e de layout móvel que a task assume e os testes não alcançam: o passo a passo comunica conclusão somente por cor, os botões do diálogo de revogação ficam abaixo do alvo de toque que a própria suíte impõe aos demais, e o ícone do badge de estado renderiza a 24px dentro de uma pílula de 32px.

**Escopo transferido, não achado:** o item "Testes E2E móvel e desktop" saiu desta task por decisão do usuário em 2026-09-06 — "Passe no navegador na task 5 (QA)" —, já registrada em `05_task.md`. A ausência do passe de navegador não é contada como lacuna aqui. O que este review verificou é se a cobertura restante prova o que a task 4 promete; as seções abaixo apontam onde ela não prova.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| src/lib/agent-onboarding.ts | ✅ OK | 0 |
| src/components/agent-onboarding.tsx | ⚠️ Ajustes | 3 major, 2 minor |
| src/components/ui/progress.tsx | ✅ OK | 0 |
| src/routes/_authenticated/agents.tsx | ⚠️ Ajustes | 3 minor |
| src/lib/agents.functions.ts | ⚠️ Ajustes | 1 major |
| tests/onboarding/agent-onboarding.test.ts | ✅ OK | 0 |
| tests/onboarding/onboarding-ui.test.tsx | ⚠️ Ajustes | 1 minor |
| tests/onboarding/pairing-lifecycle.test.ts | ⚠️ Ajustes | 1 minor |
| tests/support/pairing-db.ts | ✅ OK | 0 |
| tests/installer/pairing-database.test.ts | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

#### MAJOR-1 — `createAgent` ficou órfão e continua sendo endpoint público autenticado

`src/lib/agents.functions.ts:9-33` mantém `createAgent`, que cria um agente e devolve `token` em texto puro ao navegador. Esta task removeu o último chamador — `git diff src/routes/_authenticated/agents.tsx` apagou `setNewToken(result.token)`, o bloco "Token criado — copie agora" e o snippet com `LRC_TOKEN=${newToken}` —, mas não a função.

Não é código morto inerte. `agents.functions.ts` continua no grafo (a rota importa `createAgentPairing`, `cancelAgentPairing` e `revokeAgent`), então o TanStack Start registra a função no resolver de server functions. Verificado no bundle de produção:

```
$ grep -o "createAgent[A-Za-z_]*" .output/server/_ssr/agents.functions-bL76duIz.mjs
createAgent
createAgentPairing
createAgentPairing_createServerFn_handler
createAgentToken
createAgent_createServerFn_handler        <-- handler ainda registrado
```

E nenhuma referência sobrou no código:

```
$ grep -rn "createAgent\b" src/ tests/ --include=*.ts --include=*.tsx | grep -v "createAgentPairing\|createAgentToken"
src/lib/agents.functions.ts:9:export const createAgent = createServerFn({ method: "POST" })
```

Isso contradiz a invariante de `main.md` ("NUNCA expor a credencial permanente do agente no comando copiável, URL, log do instalador ou banco em texto puro") e o RF-3 do PRD. Não é escalação de privilégio — só emite credencial para a própria conta —, mas é o caminho paralelo que a SPEC inteira foi construída para eliminar, e ele sobreviveu justamente na task que retirou a alternativa legítima. Além do segredo, um agente criado por essa via nasce sem `installed_at`, `platform` nem `agent_version`, e `deriveMachineStatus` o classifica imediatamente como `attention` — uma máquina que o novo painel não sabe explicar.

**Correção:** remover `createAgent` de `src/lib/agents.functions.ts`. Se houver motivo para mantê-la, o motivo precisa estar escrito e a decisão precisa ser do usuário (R.6.2), não do executor.

#### MAJOR-2 — O passo a passo da instalação comunica conclusão apenas por cor

`src/components/agent-onboarding.tsx:86-103`. No `Step`, o círculo com o número e o ícone de check são ambos `aria-hidden="true"`; a única diferença entre feito e pendente que sobra na árvore acessível é `text-foreground` vs `text-muted-foreground` — cor. Confirmado no markup renderizado:

```html
<!-- state="waiting" -->
<li class="flex items-center gap-2 text-foreground"><span … aria-hidden="true">…</span>Comando criado</li>
<li class="flex items-center gap-2 text-muted-foreground"><span … aria-hidden="true">2</span>Instalar na máquina</li>

<!-- state="connected" -->
<li class="flex items-center gap-2 text-foreground"><span … aria-hidden="true">…</span>Instalar na máquina</li>
```

Para um leitor de tela os dois estados são a mesma lista: "Comando criado, Instalar na máquina, Confirmar conexão". Isso contraria diretamente o critério de sucesso da própria task ("Estados são compreensíveis sem depender de cor"), a Experiência do Usuário do PRD ("não depender apenas de cor") e a WCAG 1.4.1. A região `aria-live` e a barra de progresso compensam em parte — anunciam "Aguardando a máquina conectar" e `aria-valuenow` —, mas o rastreador de passos em si não carrega estado programático. Nenhum teste cobre isso: `onboarding-ui.test.tsx:112-122` verifica `role="status"`, `aria-live` e `aria-valuenow`, nunca a conclusão por passo.

**Correção:**

```tsx
function Step({ done, number, children }: { done: boolean; number: number; children: string }) {
  return (
    <li className={cn("flex items-center gap-2", done ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("flex size-7 …", done && "border-primary bg-primary text-primary-foreground")} aria-hidden="true">
        {done ? <Check className="size-4" /> : number}
      </span>
      {children}
      <span className="sr-only">{done ? " — concluído" : " — pendente"}</span>
    </li>
  );
}
```

E um assert em `onboarding-ui.test.tsx` provando que `panel()` e `panel({ state: "connected" })` diferem em número de "concluído".

#### MAJOR-3 — Botões do diálogo de revogação ficam abaixo do alvo de toque, e o teste não os vê

`src/components/agent-onboarding.tsx:321-327`. `AlertDialogCancel` ("Manter acesso") e `AlertDialogAction` ("Revogar acesso") não recebem `min-h-11`. Ambos caem no default de `buttonVariants` — `src/components/ui/button.tsx:21`, `size.default: "h-9 px-4 py-2"` — e `src/components/ui/alert-dialog.tsx:87,97` os compõe sem sobrescrever altura. Resultado: 36px, contra os 44px que todos os outros botões da jornada recebem via `min-h-11` (que sobrevive ao `tailwind-merge` porque `h-*` e `min-h-*` são grupos distintos, e `min-height` vence `height`).

São exatamente os dois controles em que precisão importa mais: a confirmação destrutiva, no layout de celular que a SPEC exige.

O teste que deveria pegar isso não pega. `onboarding-ui.test.tsx:179-187` varre `buttons(card())`, mas o Radix só monta o conteúdo do `AlertDialog` quando ele abre, e `renderToStaticMarkup` nunca abre — verificado renderizando um `AlertDialog defaultOpen`, que produz zero `<button>` em SSR. A asserção "todo botão da jornada tem ao menos 44px de altura" cobre, na prática, só os gatilhos.

**Correção:** `className="min-h-11"` em `AlertDialogCancel` e `className="min-h-11 bg-destructive text-destructive-foreground"` em `AlertDialogAction`; e, já que SSR não alcança o diálogo, deixar a verificação explícita para o passe de navegador da task 5 em vez de deixar o teste sugerindo cobertura que não existe.

#### MAJOR-4 — Ícone do badge de estado renderiza a 24px dentro de uma pílula de 32px

`src/components/agent-onboarding.tsx:64-69`. `StatusIcon` devolve os ícones do lucide sem classe de tamanho. Fora de um `Button` (que aplica `[&_svg]:size-4`) e sem regra global de `svg` em `src/styles.css`, valem os atributos padrão do lucide. Markup real:

```html
<span class="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs border-primary/50 text-primary">
  <svg … width="24" height="24" … class="lucide lucide-circle-check" aria-hidden="true">…</svg>Conectada</span>
```

Um ícone de 24px ao lado de texto de 12px numa pílula de 32px sem padding vertical, em todo cartão e em todo viewport. É o único ícone do arquivo sem tamanho explícito — `Monitor` usa `size-5`, `Clock3` e `Trash2` usam `size-4`, os de dentro do `role="status"` usam `size-4`. Esse badge é a superfície do RF-10; nenhuma asserção de layout o alcança porque os testes conferem nomes de classe do container, não a geometria do ícone.

**Correção:** `<CheckCircle2 className="size-4" aria-hidden="true" />` (e idem para `Clock3`, `ShieldOff`, `AlertTriangle`) em `StatusIcon`.

### 🟢 Problemas Minor

#### MINOR-1 — "Um código pendente por vez" não sobrevive à navegação

`src/routes/_authenticated/agents.tsx:147-162`. O comentário afirma "ele morre quando sai da tela", e o cancelamento de fato acontece em `closePairing` e antes de criar outro código. Mas sair da rota — o `Link` "← Sessões" na linha 211, um refresh, fechar a aba — desmonta `AgentsPage` sem chamar `discardPendingCode`. Ao voltar, `active` é `null`, e `create_agent_pairing` só apaga o código do MESMO nome ou do mesmo alvo (migration linhas 107-118). Ou seja: o cenário que o comentário diz evitar — começar "Desktop" com o código de "Notebook" ainda vivo e invisível — continua alcançável por navegação.

O impacto é limitado: o código expira em 10 minutos (constraint na migration linha 28), o consumo é atômico e a invariante de `main.md` ("um usuário, uma utilização, uma expiração curta") segue intacta. É a garantia extra de UI que está sobredimensionada no comentário — e no título de `pairing-lifecycle.test.ts`, "um código pendente por vez", cujo arquivo testa apenas as políticas do banco que tornam o cancelamento possível, nunca `discardPendingCode`.

**Correção:** cancelar no cleanup do efeito quando o componente desmonta com pareamento pendente, ou reescrever comentário e título para descrever o que o código realmente garante.

#### MINOR-2 — "Desatualizada" é âmbar no badge e vermelha no conselho

`src/components/agent-onboarding.tsx:57` pinta o badge de `outdated` em âmbar, mas `:286-294` escolhe `text-destructive` para todo conselho que não seja `pending`. Renderizado:

```html
<span class="… border-amber-500/50 text-amber-600 …">…Desatualizada</span>
<p class="mt-3 text-xs text-destructive">O agente está na versão 0.0.9 e a atual é 0.1.0. Use “Atualizar” abaixo.</p>
```

Duas severidades para o mesmo estado. Sugestão: mapear a cor do conselho a partir do `status`, como já é feito no badge.

#### MINOR-3 — `outdated` e `attention` compartilham a mesma forma de ícone

`StatusIcon` (linhas 64-69) devolve `AlertTriangle` para os dois. O comentário nas linhas 62-63 — "Cada estado tem forma própria além da cor: quem não distingue vermelho de âmbar continua lendo o cartão pelo ícone" — não é verdade para esse par: só o rótulo textual os separa. O rótulo basta para a conformidade, então isso é um comentário incorreto, não uma violação; mas o comentário é o que um leitor futuro vai acreditar.

#### MINOR-4 — Asserções fracas em `onboarding-ui.test.tsx`

O arquivo é honesto sobre seu limite ("é o que dá para provar sem instalar navegador") e a maior parte é comportamental de verdade. Quatro asserções, porém, provam menos do que anunciam:

- Linha 161, `expect(html.slice(0, html.indexOf(rotulo)).lastIndexOf("<svg")).toBeGreaterThan(0)` — é a asserção que sustenta "não depende só de cor", mas passaria mesmo se `StatusIcon` renderizasse `null`: encontraria o `<svg>` do `Monitor` no cabeçalho do cartão. Trocar por um assert sobre a classe do ícone esperado (`lucide-circle-check`, `lucide-clock`, `lucide-shield-off`, `lucide-triangle-alert`).
- Linha 192, `expect(installCommand.length).toBeGreaterThan(100)` — afirma uma propriedade da fixture, não do componente.
- Linha 175, `expect(card()).not.toContain("<h2")` — verdadeiro por construção; `MachineCard` não tem como emitir `<h2>`.
- Linhas 186, 195-197 e 201-203 — `min-h-11`, `overflow-x-auto`, `break-all`, `truncate`, `sm:grid-cols-3`, `flex-wrap` são asserções de nome de classe do Tailwind, não de geometria computada. São proxies razoáveis (`min-h-11` = 44px no default do Tailwind), mas não provam que a página não rola de lado em 360px nem que um ancestral não corta o overflow. A prova real é o passe de navegador da task 5 — o que já está corretamente endereçado; vale apenas não ler esses testes como se fossem a prova.

#### MINOR-5 — Três cópias da versão do agente sem nada que as amarre

`src/lib/agent-onboarding.ts:1` (`currentAgentVersion = "0.1.0"`), `public/agent/remote-agent.mjs` (`AGENT_VERSION = process.env.LRC_AGENT_VERSION || "0.1.0"`) e `plugins/conect-sessions/.claude-plugin/plugin.json` (`0.1.0`). Bumpar o agente sem bumpar a constante do painel faz TODA máquina saudável virar "Desatualizada"; o inverso esconde uma atualização real. Um teste que compare as três fontes custa pouco e falha alto.

#### MINOR-6 — Erro de criação de pareamento colapsa causas distintas

`src/routes/_authenticated/agents.tsx:175`: `onError: () => toast.error("Não foi possível preparar a instalação. Tente novamente.")`. Nome inválido, falha de rede e erro do RPC (`PAIRING_NAME_INVALID`, `PAIRING_TARGET_INVALID`) chegam com a mesma frase. O critério da task é "todo erro oferece ação concreta" — "tente novamente" é ação, mas não é a ação certa para um nome inválido.

#### MINOR-7 — Nada impede duas máquinas com o mesmo nome

O índice único da migration cobre só códigos PENDENTES de nome igual; consumidos os dois, sobram dois agentes homônimos. A lista renderizaria dois cartões distinguíveis apenas por versão e última conexão. Não é bug de dado — a identidade é o `id` —, é ambiguidade de leitura no painel.

## ✅ Destaques Positivos

- **Correção real, não cosmética, no `Progress`.** `src/components/ui/progress.tsx` nunca repassava `value` ao Radix: a barra andava visualmente pelo `translateX` do indicador enquanto o `Root` ficava `indeterminate` e não emitia `aria-valuenow`. O bug era pré-existente do shadcn e agora tem assert direto (`aria-valuenow="100"`, `onboarding-ui.test.tsx:97`).
- **O `aria-label` do botão de copiar carrega o comando inteiro** (`agent-onboarding.tsx:139`), com a justificativa escrita: sem enxergar o bloco, "Copiar comando" não diz o que vai para a área de transferência — e este comando executa código na máquina de quem cola. Decisão certa e testada nos dois usos, incluindo o `/reload-plugins`.
- **O contador foi deliberadamente mantido FORA da região `aria-live`**, com o motivo no código, e o teste prova a ausência fatiando o HTML a partir de `aria-live="polite"` (`onboarding-ui.test.tsx:118-121`) — não confia no posicionamento visual.
- **`describeMachineAdvice` mora na lib, não no componente**, exatamente para que a promessa "todo erro oferece ação concreta" seja testável sem montar árvore React; a tabela em `agent-onboarding.test.ts:103-123` cobre os sete casos e afirma mensagem E ação.
- **A precedência de estados é contrato explícito e testado**: silêncio vence versão antiga, revogação vence tudo, data inválida cai em `attention`, e agente legado sem `installed_at` não ganha carência (`agent-onboarding.test.ts:55-98`).
- **A janela de carência tem base no que o banco prova.** `pairing-lifecycle.test.ts:102-131` roda a RPC real em PGlite e fixa a linha que o cartão lê — `installed_at` preenchido, `last_seen_at` nulo, `plugin_status = 'unknown'` —, que é a razão de o estado `pending` existir.
- **A extração do harness PGlite é limpa e byte a byte.** `tests/support/pairing-db.ts` recebeu o bootstrap idêntico e `tests/installer/pairing-database.test.ts` passou a consumi-lo sem perder nenhum caso; o comentário registra o risco evitado (duas cópias divergindo da migration em silêncio).
- **A superfície de token cru sumiu inteira da UI** — título, descrição, `newToken`, o bloco "copie agora" e o snippet `LRC_URL=… LRC_TOKEN=…`. O critério "usuário nunca precisa manipular token ou JSON" está cumprido na jornada (o que sobra é MAJOR-1, no servidor).
- **`renderToStaticMarkup` como substituto honesto de um DOM runner**, declarado como tal no cabeçalho do arquivo, produzindo os atributos que a tecnologia assistiva realmente lê. É bem mais do que grep de fonte, e o arquivo não finge ser mais do que é.
- **A reconexão de máquina revogada preserva identidade.** O comentário em `agent-onboarding.tsx:297-301` confere com a migration: `consume_agent_pairing` com alvo zera `revoked_at` e gira o token do MESMO agente (linhas 173-190), em vez de criar uma segunda máquina.

## Conformidade com Requisitos

| Requisito | Status | Evidência |
|---|---|---|
| RF-1 — Jornada de adição | ✅ | `AddMachineForm` nomeia a máquina e `PairingPanel` conduz os três passos; `agents.tsx:217-222` |
| RF-8 — Consumo atômico refletido no estado | ✅ | `pairingQuery` para de pollar em `consumed_at`, o painel vira "conectada" e invalida a lista (`agents.tsx:131-145`); a atomicidade em si já é da task 1 |
| RF-10 — Estado observável | ⚠️ | Os cinco estados existem, com rótulo, motivo e ação em texto; o rastreador de passos ainda depende de cor (MAJOR-2) e o badge renderiza torto (MAJOR-4) |
| RF-11 — Remoção segura | ✅ | Revogação com confirmação explícita e `uninstall.ps1` em `%LOCALAPPDATA%\Conect Sessions`, caminho confirmado em `install-agent.ps1:53,262` |
| Sem manipular token ou JSON | ⚠️ | Cumprido na UI; `createAgent` continua vivo no servidor (MAJOR-1) |
| Todo erro oferece ação concreta | ✅ | `describeMachineAdvice` cobre os sete casos; ressalva em MINOR-6 |
| Estados compreensíveis sem depender de cor | ⚠️ | Verdadeiro para os cartões (rótulo textual); falso para o passo a passo (MAJOR-2) |
| Layout de celular e teclado | ⚠️ | 44px em toda a jornada exceto o diálogo de revogação (MAJOR-3); passe real de viewport na task 5 |

## Validação Executada

| Comando | Resultado |
|---------|-----------|
| `bunx tsc --noEmit` | ✅ exit 0 |
| `bun test tests` | ✅ 80 testes, 0 falhas, 360 asserções, 13 arquivos |
| `bun run lint` | ✅ 0 erros; 6 warnings `react-refresh` pré-existentes em `src/components/ui/*`, fora do escopo |
| Render SSR de `MachineStatusBadge` | ⚠️ ícone em `width="24" height="24"` (MAJOR-4) |
| Render SSR do `<ol>` de passos em `waiting` e `connected` | ⚠️ árvore acessível idêntica nos dois estados (MAJOR-2) |
| Render SSR de `AlertDialog defaultOpen` | ⚠️ zero `<button>` em SSR — o teste de alvo de toque não alcança o diálogo (MAJOR-3) |
| `grep createAgent` em `.output/server/` | ⚠️ `createAgent_createServerFn_handler` registrado no bundle (MAJOR-1) |

## Recomendações

1. Resolver MAJOR-1 antes de qualquer outra coisa — é a única invariante de segurança da SPEC ainda aberta, e ela ficou aberta justamente nesta task.
2. Resolver MAJOR-2, MAJOR-3 e MAJOR-4 e acrescentar os asserts correspondentes; os três são pequenos em código e grandes na promessa que a task assume.
3. Levar para o passe de navegador da task 5 o que o SSR estruturalmente não alcança: geometria real em 360px, o diálogo de revogação aberto, o anúncio do `aria-live` numa transição de estado de verdade e a ordem de foco pelo teclado.
4. Ajustar comentário e título onde eles prometem mais do que o código entrega (MINOR-1 e MINOR-3): num repositório com esse nível de comentário explicativo, um comentário errado custa mais que a ausência dele.

## Veredito do ciclo 1

**MUDANÇAS SOLICITADAS.** Nenhum problema crítico, mas quatro major: um endpoint órfão que ainda emite credencial permanente e contraria a invariante central da SPEC, e três lacunas de acessibilidade e layout móvel — conclusão de passo comunicada só por cor, alvo de toque abaixo do mínimo no diálogo destrutivo e ícone de estado fora de escala — que a suíte atual não consegue enxergar. A base é sólida: os estados, a precedência, os conselhos acionáveis e a proteção do segredo na UI estão bem construídos e bem testados, e a cobertura de unidade, integração PGlite e render SSR prova de verdade o que se propõe a provar, dentro do limite que ela mesma declara. Corrigidos os quatro major, a task 4 fica pronta para o passe de navegador da task 5.
