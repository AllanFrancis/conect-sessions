import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AddMachineForm,
  MachineCard,
  PairingPanel,
  type Machine,
  type PairingView,
} from "@/components/agent-onboarding";
import {
  buildInstallCommand,
  buildUninstallCommand,
  currentAgentVersion,
} from "@/lib/agent-onboarding";

/*
 * Renderização de verdade, não busca de texto no fonte.
 *
 * O projeto não tem test runner de DOM, mas `react-dom/server` já é dependência
 * e produz a árvore final — com os atributos que a tecnologia assistiva lê e as
 * classes que decidem o layout no celular. É o que dá para provar sem instalar
 * navegador, e é bem mais do que um grep no arquivo garantia.
 */

const uninstallCommand = buildUninstallCommand();
const installCommand = buildInstallCommand("https://painel.example", "b".repeat(64));

/** Mesmo escape do `renderToStaticMarkup`, para comparar texto com a saída. */
const escaped = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

const pairing = (over: Partial<PairingView> = {}): PairingView => ({
  command: installCommand,
  countdown: "9:41",
  expiresAt: "2026-09-06T12:10:00.000Z",
  mode: "add",
  name: "Notebook do trabalho",
  state: "waiting",
  ...over,
});

const machine = (over: Partial<Machine> = {}): Machine => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Notebook do trabalho",
  platform: "windows-x64",
  agent_version: currentAgentVersion,
  install_error: null,
  installed_at: new Date(Date.now() - 3_600_000).toISOString(),
  last_seen_at: new Date(Date.now() - 5_000).toISOString(),
  plugin_status: "ready",
  revoked_at: null,
  ...over,
});

const panel = (over?: Partial<PairingView>) =>
  renderToStaticMarkup(<PairingPanel pairing={pairing(over)} onCancel={() => {}} />);

const card = (over?: Partial<Machine>) =>
  renderToStaticMarkup(
    <MachineCard
      machine={machine(over)}
      uninstallCommand={uninstallCommand}
      onRepair={() => {}}
      onRevoke={() => {}}
    />,
  );

/** Todo `<button>` renderizado, com seus atributos, para checar um por um. */
function buttons(html: string) {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("jornada de instalação", () => {
  test("aguardando: mostra o comando, quanto falta e como cancelar", () => {
    const html = panel();
    expect(html).toContain(escaped(installCommand));
    expect(html).toContain("código expira em 9:41");
    expect(html).toContain("Aguardando a máquina conectar");
    expect(html).toContain("Cancelar instalação");
    expect(html).toContain("Adicionar Notebook do trabalho");
    expect(html).not.toContain("/reload-plugins");
  });

  test("conectada: encerra a jornada e entrega o passo das sessões abertas", () => {
    const html = panel({ state: "connected" });
    expect(html).toContain("Máquina conectada");
    expect(html).toContain("instalação concluída");
    expect(html).toContain("/reload-plugins");
    expect(html).toContain("Concluir");
    // O comando de instalação sai da tela: o código já foi consumido e repetir
    // a colagem só produziria erro.
    expect(html).not.toContain("install.ps1");
    expect(html).toContain('aria-valuenow="100"');
  });

  test("expirada: diz o que houve e oferece a ação, sem comando morto na tela", () => {
    const html = panel({ countdown: null, state: "expired" });
    expect(html).toContain("código expirado");
    expect(html).toContain("O código expirou");
    expect(html).toContain("Gerar outro código");
    expect(html).not.toContain("install.ps1");
  });

  test("reparo se anuncia como reparo, não como máquina nova", () => {
    expect(panel({ mode: "repair" })).toContain("Reparar Notebook do trabalho");
  });

  test("progresso e mudança de estado chegam a leitor de tela", () => {
    const html = panel();
    expect(html).toContain('aria-label="Progresso da instalação: 67%"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    // O contador muda a cada segundo: fora da região viva, senão o leitor de
    // tela repetiria a linha inteira sessenta vezes por minuto.
    const live = html.slice(html.indexOf('aria-live="polite"'));
    expect(live).not.toContain("código expira em");
  });

  test("a conclusão de cada passo existe em texto, não só na cor da linha", () => {
    // Círculo e ícone são aria-hidden. Sem o rótulo escondido, "aguardando" e
    // "conectada" produziam a MESMA lista para um leitor de tela.
    const aguardando = panel();
    const conectada = panel({ state: "connected" });
    const passos = (html: string) => html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
    expect(passos(aguardando)).not.toBe(passos(conectada));
    expect(passos(aguardando)).toContain('Instalar na máquina<span class="sr-only"> (pendente)');
    expect(passos(conectada)).toContain('Instalar na máquina<span class="sr-only"> (concluído)');
    expect(passos(conectada)).not.toContain("(pendente)");
  });

  test("o botão de copiar diz o que vai para a área de transferência", () => {
    const html = panel();
    expect(html).toContain(`aria-label="Copiar comando: ${escaped(installCommand)}"`);
    expect(panel({ state: "connected" })).toContain('aria-label="Copiar atalho: /reload-plugins"');
  });
});

describe("porta de entrada da jornada", () => {
  const form = (existingNames: string[] = []) =>
    renderToStaticMarkup(
      <AddMachineForm busy={false} existingNames={existingNames} onAdd={() => {}} />,
    );

  test("o campo tem nome acessível e o botão nasce desabilitado sem nome", () => {
    const html = form();
    expect(html).toContain(">Nome da máquina<");
    expect(html).toContain('id="machine-name"');
    expect(html).toContain('for="machine-name"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("aria-describedby");
    expect(html).toContain('aria-invalid="false"');
  });

  test("ocupado anuncia o trabalho em vez de parecer travado", () => {
    const html = renderToStaticMarkup(<AddMachineForm busy existingNames={[]} onAdd={() => {}} />);
    expect(html).toContain("Preparando…");
    expect(html).toContain("disabled");
  });
});

describe("cartão da máquina", () => {
  test("conectada não inventa problema nem esconde a remoção", () => {
    const html = card();
    expect(html).toContain("Conectada");
    expect(html).toContain("Reparar");
    expect(html).toContain("Revogar acesso");
    expect(html).toContain("Remover do Windows");
    expect(html).toContain(escaped(uninstallCommand));
    expect(html).not.toContain("Use “");
  });

  test("cada estado traz rótulo, motivo, ação e um ícone só dele", () => {
    // O ícone é nominal: um assert de "existe algum <svg> antes do rótulo"
    // passaria mesmo com StatusIcon devolvendo null, porque acharia o Monitor
    // do cabeçalho do cartão. Cada estado precisa da SUA forma.
    const casos: Array<[Partial<Machine>, string, string, string, string]> = [
      [
        { installed_at: new Date().toISOString(), last_seen_at: null },
        "Aguardando instalação",
        "A instalação começou",
        "Refazer instalação",
        "lucide-clock3",
      ],
      [{ agent_version: "0.0.9" }, "Desatualizada", "0.0.9", "Atualizar", "lucide-circle-arrow-up"],
      [
        { install_error: "SmartScreen bloqueou" },
        "Com atenção",
        "SmartScreen bloqueou",
        "Reparar",
        "lucide-triangle-alert",
      ],
      [
        { revoked_at: new Date().toISOString() },
        "Revogada",
        "não sincroniza mais",
        "Reconectar",
        "lucide-shield-off",
      ],
    ];
    const formas = new Set<string>();
    for (const [over, rotulo, motivo, acao, icone] of casos) {
      const html = card(over);
      expect(html).toContain(rotulo);
      expect(html).toContain(motivo);
      expect(html).toContain(`Use “${acao}” abaixo`);
      // O ícone está DENTRO da pílula que carrega o rótulo, não em qualquer
      // lugar do cartão.
      const badge = html.slice(
        html.lastIndexOf("<span", html.indexOf(rotulo)),
        html.indexOf(rotulo),
      );
      expect(badge).toContain(icone);
      expect(badge).toContain("size-4");
      formas.add(icone);
    }
    expect(formas.size).toBe(casos.length);
    expect(card()).toContain("lucide-circle-check");
  });

  test("o conselho tem a mesma severidade do badge, não uma segunda leitura", () => {
    // "Desatualizada" é âmbar na pílula; a frase abaixo dela não pode ser
    // vermelha, senão o mesmo estado se apresenta com duas gravidades.
    const paragrafo = (html: string, trecho: string) => {
      const fim = html.indexOf(trecho);
      return html.slice(html.lastIndexOf("<p ", fim), html.indexOf("</p>", fim));
    };
    const desatualizada = paragrafo(card({ agent_version: "0.0.9" }), "O agente está na versão");
    expect(desatualizada).toContain("text-amber-600");
    expect(desatualizada).not.toContain("text-destructive");
    const comErro = paragrafo(card({ install_error: "falhou" }), "A instalação informou");
    expect(comErro).toContain("text-destructive");
  });

  test("revogada some com a revogação e mantém o caminho de volta", () => {
    const html = card({ revoked_at: new Date().toISOString() });
    expect(html).not.toContain("Revogar acesso");
    expect(html).toContain("Reconectar");
    expect(html).toContain("Remover do Windows");
  });

  test("o nome da máquina é subtítulo da lista, não um segundo título de página", () => {
    // A seção "Suas máquinas" já é o h2; cada cartão entra abaixo dela. Casar a
    // tag do título de verdade, e não a ausência de "<h2", que seria verdadeira
    // por construção.
    const titulos = card().match(/<h[1-6][ >]/g) ?? [];
    expect(titulos).toEqual(["<h3 "]);
  });
});

/*
 * Estes asserts leem NOME DE CLASSE do Tailwind, não geometria computada.
 * `min-h-11` é 44px no default do Tailwind e `overflow-x-auto` cria o contexto
 * de rolagem, mas nada aqui prova que um ancestral não corta o overflow nem que
 * a página não rola de lado em 360px. Isso é o passe de navegador da task 5;
 * o que segue é a rede que pega a regressão barata sem subir navegador.
 */
describe("layout de celular e alvo de toque", () => {
  test("todo botão da jornada tem ao menos 44px de altura", () => {
    const todos = [
      ...buttons(panel()),
      ...buttons(panel({ state: "connected" })),
      ...buttons(card()),
    ];
    expect(todos.length).toBeGreaterThan(3);
    for (const button of todos) expect(button).toContain("min-h-11");
    // Os botões do diálogo de revogação NÃO aparecem aqui: o Radix só monta o
    // conteúdo depois de aberto, e o SSR nunca abre. Ficam na lista da task 5.
  });

  test("conteúdo largo rola dentro do próprio bloco em vez de empurrar a página", () => {
    const html = panel();
    const bloco = html.slice(html.indexOf("<pre"), html.indexOf("</pre>"));
    expect(bloco).toContain("overflow-x-auto");
    expect(bloco).toContain("break-all");
    expect(card()).toContain("truncate");
  });

  test("as fileiras que competem por largura quebram em vez de estourar", () => {
    expect(panel()).toContain("sm:grid-cols-3");
    expect(panel()).toContain("flex-wrap");
    expect(card()).toContain("flex-wrap");
  });
});
