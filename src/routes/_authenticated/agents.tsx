import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createAgent } from "@/lib/agents.functions";
import { TermBox, TermHints, TermScreen } from "@/components/terminal";
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

  // A URL de preview exige login no navegador (o curl recebe "Unauthorized").
  // Use sempre a URL pública estável do projeto para o agente local.
  const baseUrl = "https://project--6db84ef0-e8b7-4d09-8f52-05d7d24dd80a.lovable.app";

  return (
    <TermScreen>
      <TermBox tone="accent" className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-primary">✻ Máquinas & tokens</p>
          <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-primary">
            /sessions
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          cada máquina (notebook, desktop, servidor) recebe um token próprio
        </p>
      </TermBox>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-border px-3 py-2 focus-within:border-primary/70">
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
        <button
          onClick={() => void add()}
          className="shrink-0 text-xs text-muted-foreground hover:text-primary"
        >
          enter ⏎
        </button>
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
            ⚠ Use exatamente essa URL. A URL de preview pede login no navegador e o download
            retorna “Unauthorized” (arquivo de 12 bytes). Publique o projeto uma vez para essa URL
            ficar ativa.
          </p>
        </TermBox>
      )}

      <div className="mt-4 space-y-1">
        {agents.length === 0 && (
          <p className="text-muted-foreground">Nenhuma máquina cadastrada ainda.</p>
        )}
        {agents.map((a) => (
          <div
            key={a.id}
            className="group flex items-baseline gap-2 rounded px-2 py-1.5 hover:bg-accent/50"
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
            <button
              onClick={() => void remove(a.id)}
              className="shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              remover
            </button>
          </div>
        ))}
      </div>

      <TermHints items={["enter cria token", "token só aparece uma vez", "/sessions voltar"]} />
    </TermScreen>
  );
}
