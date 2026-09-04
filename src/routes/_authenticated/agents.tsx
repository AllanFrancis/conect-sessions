import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createAgent } from "@/lib/agents.functions";
import { TermBox, TermButton, TermHints, TermScreen, termLinkClass } from "@/components/terminal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "Máquinas & tokens — Remote Session Monitor" },
      {
        name: "description",
        content: "Gere tokens para conectar o agente local das suas máquinas ao painel remoto.",
      },
      { property: "og:title", content: "Máquinas & tokens — Remote Session Monitor" },
      { property: "og:description", content: "Conecte suas máquinas ao painel remoto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const create = useServerFn(createAgent);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, token_prefix, last_seen_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function add() {
    if (!name.trim()) return;
    try {
      const result = await create({ data: { name: name.trim() } });
      setNewToken(result.token);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch {
      toast.error("Não foi possível criar o token");
    }
  }

  async function remove(id: string) {
    await supabase.from("agents").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["agents"] });
  }

  // A URL do snippet tem que ser a do app que EMITIU o token: o agente
  // autentica contra o banco daquele deploy. Uma URL fixa fazia o token criado
  // num ambiente ser enviado para outro, resultando em 401 "Token invalido".
  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => setBaseUrl(window.location.origin), []);

  return (
    <TermScreen>
      <TermBox tone="accent" className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-primary">✻ Máquinas & tokens</p>
          <Link to="/dashboard" className={termLinkClass}>
            ← Sessões
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          cada máquina (notebook, desktop, servidor) recebe um token próprio
        </p>
      </TermBox>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 focus-within:border-primary/70">
          <span className="select-none text-primary">&gt;</span>
          <input
            value={name}
            placeholder="nome da máquina, ex.: MacBook trabalho"
            className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
        </div>
        <TermButton variant="primary" disabled={!name.trim()} onClick={() => void add()}>
          Criar token
        </TermButton>
      </div>

      {newToken && (
        <TermBox tone="accent" className="mt-4 space-y-3 px-4 py-3">
          <p className="text-primary">⏺ Token criado — copie agora, não será exibido novamente</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-card p-3 text-xs text-foreground">
            {newToken}
          </pre>
          <p className="text-xs text-muted-foreground">macOS / Linux:</p>
          <pre className="overflow-x-auto rounded bg-card p-3 text-xs text-muted-foreground">
            {`cd ~
curl -fL -o remote-agent.mjs ${baseUrl}/api/public/agent/remote-agent
LRC_URL=${baseUrl} LRC_TOKEN=${newToken} node remote-agent.mjs`}
          </pre>
          <p className="text-xs text-muted-foreground">Windows (PowerShell):</p>
          <pre className="overflow-x-auto rounded bg-card p-3 text-xs text-muted-foreground">
            {`cd $HOME
curl.exe -fL -o remote-agent.mjs ${baseUrl}/api/public/agent/remote-agent
$env:LRC_URL="${baseUrl}"
$env:LRC_TOKEN="${newToken}"
node remote-agent.mjs`}
          </pre>
          <p className="text-xs text-muted-foreground">
            ⚠ O token vale só para este endereço ({baseUrl || "esta URL"}), porque é nele que ele
            foi gravado. Mantenha o -fL.
          </p>
        </TermBox>
      )}

      <div className="mt-4 space-y-2">
        {agents.length === 0 && (
          <p className="text-muted-foreground">Nenhuma máquina cadastrada ainda.</p>
        )}
        {agents.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
          >
            <span className="select-none text-primary">⏺</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-foreground">{a.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {a.token_prefix}… ·{" "}
                {a.last_seen_at
                  ? `visto em ${new Date(a.last_seen_at).toLocaleString()}`
                  : "nunca conectou"}
              </p>
            </div>
            <TermButton variant="danger" onClick={() => void remove(a.id)}>
              Remover
            </TermButton>
          </div>
        ))}
      </div>

      <TermHints items={["o token só aparece uma vez", "rode o agente na máquina do editor"]} />
    </TermScreen>
  );
}
