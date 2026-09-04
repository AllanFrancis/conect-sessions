import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createAgent } from "@/lib/agents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">
        ← Sessões
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold">Máquinas & tokens</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Nova máquina</CardTitle>
          <CardDescription>
            Cada máquina (notebook, desktop, servidor) recebe um token próprio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="Ex.: MacBook trabalho"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={() => void add()}>Gerar token</Button>
        </CardContent>
      </Card>

      {newToken && (
        <Card className="mb-6 border-primary">
          <CardHeader>
            <CardTitle>Token criado</CardTitle>
            <CardDescription>Copie agora — ele não será exibido novamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block break-all rounded bg-muted p-3 text-xs">{newToken}</code>
            <p className="text-sm text-muted-foreground">Na máquina onde o editor roda:</p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {`curl -o remote-agent.mjs ${baseUrl}/agent/remote-agent.mjs
LRC_URL=${baseUrl} LRC_TOKEN=${newToken} node remote-agent.mjs`}
            </pre>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {agents.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.token_prefix}… ·{" "}
                  {a.last_seen_at
                    ? `visto em ${new Date(a.last_seen_at).toLocaleString()}`
                    : "nunca conectou"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void remove(a.id)}>
                Remover
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
