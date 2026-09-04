import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId")({
  head: () => ({
    meta: [
      { title: "Sessão de chat — Remote Session Monitor" },
      {
        name: "description",
        content: "Acompanhe a conversa em tempo real e responda ao agente remotamente.",
      },
      { property: "og:title", content: "Sessão de chat — Remote Session Monitor" },
      { property: "og:description", content: "Acompanhe e responda a sessão remotamente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const { sessionId } = Route.useParams();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data } = useQuery({
    queryKey: ["session", sessionId],
    refetchInterval: 2000,
    queryFn: async () => {
      const [session, messages, replies] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, title, source, status, cwd, last_activity_at")
          .eq("id", sessionId)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .order("seq", { ascending: true }),
        supabase
          .from("replies")
          .select("id, content, status, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
      ]);
      return {
        session: session.data,
        messages: messages.data ?? [],
        replies: replies.data ?? [],
      };
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  async function send() {
    const content = reply.trim();
    if (!content) return;
    setSending(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("replies")
      .insert({ session_id: sessionId, user_id: userData.user!.id, content });
    setSending(false);
    if (error) {
      toast.error("Não foi possível enviar a resposta");
      return;
    }
    setReply("");
    inputRef.current?.focus();
    queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
  }

  const session = data?.session;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">
            ← Todas as sessões
          </Link>
          <h1 className="truncate text-xl font-semibold">{session?.title ?? "Sessão"}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {session?.source} · {session?.cwd ?? "—"}
          </p>
        </div>
        <Badge>{session?.status ?? "…"}</Badge>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {(data?.messages ?? []).map((m) => (
          <article
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-primary px-4 py-3 text-primary-foreground"
                : "max-w-[95%] rounded-lg bg-card px-4 py-3 text-card-foreground ring-1 ring-border"
            }
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{m.role}</p>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          </article>
        ))}
        {(data?.replies ?? [])
          .filter((r) => r.status === "pending")
          .map((r) => (
            <article
              key={r.id}
              className="ml-auto max-w-[85%] rounded-lg border border-dashed border-primary px-4 py-3 text-sm"
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                sua resposta · aguardando entrega
              </p>
              {r.content}
            </article>
          ))}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background py-3">
        <Textarea
          ref={inputRef}
          value={reply}
          placeholder="Responder ao agente…"
          rows={2}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button onClick={() => void send()} disabled={sending || !reply.trim()}>
          Enviar
        </Button>
      </div>
    </main>
  );
}
