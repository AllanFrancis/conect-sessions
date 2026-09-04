import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Sessões ao vivo — Remote Session Monitor" },
      {
        name: "description",
        content: "Acompanhe em tempo real todas as sessões de chat de IA das suas máquinas.",
      },
      { property: "og:title", content: "Sessões ao vivo — Remote Session Monitor" },
      { property: "og:description", content: "Suas sessões de chat de IA em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const statusTone: Record<string, string> = {
  running: "bg-primary text-primary-foreground",
  waiting: "bg-destructive text-destructive-foreground",
  idle: "bg-secondary text-secondary-foreground",
  done: "bg-secondary text-secondary-foreground",
  error: "bg-destructive text-destructive-foreground",
};

function Dashboard() {
  const navigate = useNavigate();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, title, source, status, cwd, last_activity_at")
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sessões ao vivo</h1>
          <p className="text-sm text-muted-foreground">
            Atualiza automaticamente a cada 3 segundos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/agents">Máquinas & tokens</Link>
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sair
          </Button>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma sessão ainda</CardTitle>
            <CardDescription>
              Crie um token em “Máquinas & tokens” e rode o agente local na máquina onde o Claude
              Code ou o Kiro estão trabalhando.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s) => (
            <Link key={s.id} to="/sessions/$sessionId" params={{ sessionId: s.id }}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.source} · {s.cwd ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.last_activity_at).toLocaleTimeString()}
                    </span>
                    <Badge className={statusTone[s.status] ?? ""}>{s.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
