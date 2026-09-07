import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SourceIcon, StatusDot, TermHints, TermIconButton } from "@/components/terminal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  projectName,
  relativeTime,
  sessionTitle,
  statusTone,
  STATUS_NO_PAINEL,
} from "@/lib/session-display";
import { cn } from "@/lib/utils";

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

function Dashboard() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", "painel"],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("sessions")
        .select("id, title, source, status, cwd, last_activity_at, ide, pid, detection_confidence")
        .in("status", [...STATUS_NO_PAINEL])
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      const sessions = rows ?? [];
      const firstMessages: Record<string, string> = {};
      if (sessions.length) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("session_id, content, created_at")
          .in(
            "session_id",
            sessions.map((s) => s.id),
          )
          .eq("role", "user")
          .order("created_at", { ascending: true })
          .limit(500);
        for (const m of msgs ?? []) {
          if (!firstMessages[m.session_id]) firstMessages[m.session_id] = m.content;
        }
      }
      return { sessions, firstMessages };
    },
  });

  const sessions = data?.sessions ?? [];
  const firstMessages = data?.firstMessages ?? {};

  return (
    <div className="min-h-dvh bg-background text-sm">
      <div className="mx-auto w-full max-w-4xl px-4 pt-3 pb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sessões</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TermIconButton label="Menu">☰</TermIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => void navigate({ to: "/agents" })}>
                Máquinas &amp; tokens
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await supabase.auth.signOut();
                  void navigate({ to: "/auth" });
                }}
              >
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <section className="mt-6">
          <h2 className="text-muted-foreground">Máquinas</h2>
          <Link
            to="/agents"
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-foreground transition-colors hover:border-primary/70"
          >
            <span className="select-none text-lg leading-none">+</span>
            Adicionar máquina
          </Link>
        </section>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-muted-foreground">Ativas e esperando você</h2>
            {/* O painel lista SÓ sessão ativa (SPEC-20260904-1433) mais a que parou
                esperando o usuário (SPEC-20260906-1932-kiro-aguardando-usuario-visivel)
                — dizer isso aqui evita a leitura de que a lista está vazia por falta
                de sessão. */}
            <span className="text-xs text-muted-foreground">atualiza a cada 3s</span>
          </div>

          <div className="mt-2 space-y-2">
            {isLoading ? (
              <p className="text-muted-foreground">✳ Carregando…</p>
            ) : sessions.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card px-4 py-4 text-muted-foreground">
                <p className="text-foreground">Nenhuma sessão ativa ou esperando você agora.</p>
                <p className="mt-1">
                  O painel lista as sessões rodando neste momento e as que pararam esperando uma
                  resposta sua. Crie um token em{" "}
                  <Link to="/agents" className="text-primary hover:underline">
                    Máquinas &amp; tokens
                  </Link>{" "}
                  e rode o agente local na máquina do editor.
                </p>
              </div>
            ) : (
              sessions.map((s) => (
                <Link
                  key={s.id}
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-card px-3 py-3 transition-colors hover:border-primary/70"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <SourceIcon source={s.source} className="border-0 bg-transparent" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {sessionTitle(s.title, firstMessages[s.id], s.cwd)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeTime(s.last_activity_at)}
                      </span>
                    </span>
                    {/* A segunda linha guarda o que a versão em log já mostrava —
                        estado, projeto, IDE, pid e confiança. Ela QUEBRA em vez de
                        truncar: num viewport de 360px truncar cortaria justamente
                        o pid e a confiança, que são a prova de vida da sessão. */}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span className={cn("inline-flex items-center gap-1", statusTone(s.status))}>
                        <StatusDot status={s.status} />
                        {s.status}
                      </span>
                      <span className="wrap-anywhere">
                        · {projectName(s.cwd, s.title)}
                        {s.ide ? ` · ${s.ide}` : " · IDE desconhecida"}
                        {s.pid ? ` · pid ${s.pid}` : ""}
                        {s.detection_confidence && s.detection_confidence !== "confirmed"
                          ? ` · ${s.detection_confidence}`
                          : ""}
                      </span>
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <TermHints items={["rodando ou esperando você", "projeto = pasta lida pelo agente"]} />
      </div>
    </div>
  );
}
