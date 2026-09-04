import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  SourceIcon,
  StatusDot,
  TermBox,
  TermButton,
  TermHints,
  TermScreen,
  termLinkClass,
} from "@/components/terminal";
import { projectName, sessionTitle } from "@/lib/session-display";

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
    queryKey: ["sessions"],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("sessions")
        .select("id, title, source, status, cwd, last_activity_at, ide, pid, detection_confidence")
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
    <TermScreen>
      <TermBox tone="accent" className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-primary">✻ Sessões ao vivo</p>
          <div className="flex items-center gap-2">
            <Link to="/agents" className={termLinkClass}>
              Máquinas & tokens
            </Link>
            <TermButton
              variant="danger"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              Sair
            </TermButton>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          atualiza a cada 3s · {sessions.length} sessão(ões) conectada(s)
        </p>
      </TermBox>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground">✳ Carregando…</p>
        ) : sessions.length === 0 ? (
          <TermBox className="text-muted-foreground">
            <p className="text-foreground">Nenhuma sessão ainda.</p>
            <p className="mt-1">
              Crie um token em{" "}
              <Link to="/agents" className="text-primary hover:underline">
                Máquinas & tokens
              </Link>{" "}
              e rode o agente local na máquina do editor.
            </p>
          </TermBox>
        ) : (
          sessions.map((s) => (
            <Link
              key={s.id}
              to="/sessions/$sessionId"
              params={{ sessionId: s.id }}
              className="block rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/70"
            >
              <div className="flex items-center gap-2">
                <StatusDot status={s.status} />
                <SourceIcon source={s.source} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {sessionTitle(s.title, firstMessages[s.id], s.cwd)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(s.last_activity_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-0.5 truncate pl-[3.25rem] text-xs text-muted-foreground">
                {projectName(s.cwd, s.title)} · {s.status}
                {s.ide ? ` · ${s.ide}` : " · IDE desconhecida"}
                {s.pid ? ` · pid ${s.pid}` : ""}
                {s.detection_confidence && s.detection_confidence !== "confirmed"
                  ? ` · ${s.detection_confidence}`
                  : ""}{" "}
                · abrir conversa →
              </p>
            </Link>
          ))
        )}
      </div>

      <TermHints items={["clique numa sessão para abrir", "projeto = pasta lida pelo agente"]} />
    </TermScreen>
  );
}
