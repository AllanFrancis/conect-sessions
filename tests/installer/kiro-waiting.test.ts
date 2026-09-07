import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A derivação de estado do adaptador do Kiro, com o `waiting_on_user` incluído.
 *
 * O caso que a SPEC-20260906-1932-kiro-aguardando-usuario-visivel precisa provar
 * e que a máquina do desenvolvedor NÃO produz sob demanda é o terceiro critério:
 * `waiting_on_user` em disco e nenhuma instância do Kiro viva tem que continuar
 * `finished`. Matar o Kiro do usuário para medir isso não é opção; semear um
 * `~/.kiro` de mentira num perfil redirecionado é.
 *
 * Por isso todos os casos daqui rodam SEM instância viva: sem `code.lock` no
 * APPDATA falso, `kiroLiveInstance()` devolve null e o agente entra no braço que
 * este arquivo cobre. Os braços COM instância viva dependem de um kiro.exe real
 * cujo PID bate com o lock — não são fabricáveis, e estão medidos por
 * `--probe` contra o Kiro de verdade, com a saída registrada no journal da SPEC.
 *
 * `.scratch/` e não `docs/active/<SPEC>/tmp/` pelo mesmo motivo de
 * `agent-log.test.ts`: o `close` move a pasta da SPEC e o `mkdirSync` recursivo
 * a recriaria a cada run, violando "docs/active vazio em main" sem o git ver.
 */

const agentPath = resolve("public/agent/remote-agent.mjs");
const workRoot = resolve(".scratch/kiro-waiting-test");

type Sessao = { status: string | null; id: string };

/** Um `~/.kiro` de mentira com uma sessão por `status` declarado. */
function semear(nome: string, sessoes: Sessao[]) {
  const root = join(workRoot, nome);
  rmSync(root, { recursive: true, force: true });
  const appData = join(root, "AppData", "Roaming");
  // Existe, mas sem `code.lock`: é a diferença entre "Kiro instalado" e "Kiro
  // rodando", e é justamente ela que o adaptador tem que enxergar.
  mkdirSync(join(appData, "Kiro"), { recursive: true });

  for (const sessao of sessoes) {
    const dir = join(root, ".kiro", "sessions", "ws-hash-de-teste", sessao.id);
    mkdirSync(dir, { recursive: true });
    const meta: Record<string, unknown> = {
      id: sessao.id,
      title: `sessão ${sessao.status ?? "sem status"}`,
      createdAt: "2026-09-06T12:00:00.000Z",
      lastModifiedAt: "2026-09-06T12:30:00.000Z",
      workspacePaths: ["c:\\dev\\projeto-de-teste"],
    };
    if (sessao.status !== null) meta["status"] = sessao.status;
    writeFileSync(join(dir, "session.json"), JSON.stringify(meta), "utf8");
  }
  return { root, appData };
}

type SessaoVista = {
  agent: string;
  session_id: string;
  status: string;
  confidence: string;
  evidence: string[];
};

/** Roda o agente em modo sondagem contra o perfil semeado e devolve o que ele viu. */
async function sondar(nome: string, sessoes: Sessao[]) {
  const fs = semear(nome, sessoes);
  const proc = Bun.spawn([process.execPath, agentPath, "--probe", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Perfil redirecionado: sem isto o agente lê o `~/.kiro` REAL da máquina e
      // o caso passa a depender de quais abas o desenvolvedor deixou abertas.
      USERPROFILE: fs.root,
      HOME: fs.root,
      APPDATA: fs.appData,
      // O adaptador do Claude Code não está sob teste; mandá-lo para o perfil
      // falso evita que as sessões reais entrem no JSON e poluam as asserções.
      CLAUDE_CONFIG_DIR: join(fs.root, "claude"),
    },
  });
  const saida = await new Response(proc.stdout).text();
  await proc.exited;
  const vistas = JSON.parse(saida) as SessaoVista[];
  const porId = new Map(vistas.filter((s) => s.agent === "kiro").map((s) => [s.session_id, s]));
  return porId;
}

afterAll(() => rmSync(workRoot, { recursive: true, force: true }));

describe("adaptador do Kiro sem instância viva", () => {
  test("waiting_on_user sem Kiro rodando continua finished, não waiting", async () => {
    const vistas = await sondar("sem-kiro-vivo", [
      { id: "sess_espera", status: "waiting_on_user" },
      { id: "sess_idle", status: "idle" },
      { id: "sess_falhou", status: "failed" },
      { id: "sess_andando", status: "in_progress" },
      { id: "sess_sem_campo", status: null },
    ]);

    const espera = vistas.get("sess_espera");
    // Critério 3: a pergunta congelou junto com o processo. Dizer `waiting` aqui
    // prometeria uma interação que não existe mais.
    expect(espera?.status).toBe("finished");
    expect(espera?.confidence).toBe("confirmed");
    expect(espera?.evidence.join(" ")).toContain("nenhuma instância do Kiro viva");
  });

  test("os outros estados declarados mantêm a derivação de antes da SPEC", async () => {
    const vistas = await sondar("outros-estados", [
      { id: "sess_espera", status: "waiting_on_user" },
      { id: "sess_idle", status: "idle" },
      { id: "sess_falhou", status: "failed" },
      { id: "sess_andando", status: "in_progress" },
      { id: "sess_sem_campo", status: null },
    ]);

    // Critério 4: estados terminais gravados pela aplicação seguem `finished`.
    expect(vistas.get("sess_idle")?.status).toBe("finished");
    expect(vistas.get("sess_falhou")?.status).toBe("finished");

    // E o que congelou sem estado terminal segue `unknown` — o invariante de que
    // o que não se sabe continua não sabido.
    expect(vistas.get("sess_andando")?.status).toBe("unknown");
    expect(vistas.get("sess_andando")?.confidence).toBe("unknown");
    expect(vistas.get("sess_sem_campo")?.status).toBe("unknown");
  });

  test("o vocabulário do Kiro não vaza para o estado transportado", async () => {
    const vistas = await sondar("vocabulario", [{ id: "sess_espera", status: "waiting_on_user" }]);

    // `waiting_on_user` é palavra do Kiro; o contrato de `/sync` só conhece
    // `waiting`. O valor cru pode aparecer na evidência (é diagnóstico), nunca
    // no campo de estado.
    for (const sessao of vistas.values()) {
      expect(sessao.status).not.toBe("waiting_on_user");
    }
  });
});
