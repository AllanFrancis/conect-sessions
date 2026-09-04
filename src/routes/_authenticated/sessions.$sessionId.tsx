import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { StatusDot, TermBox, TermButton, TermScreen, termLinkClass } from "@/components/terminal";
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
    <TermScreen className="flex min-h-screen flex-col">
      <TermBox tone="accent" className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-primary">✻ {session?.title ?? "Sessão"}</p>
          <Link to="/dashboard" className={termLinkClass}>
            ← Sessões
          </Link>
        </div>
        <p className="mt-1 flex items-center gap-2 truncate text-xs text-muted-foreground">
          <StatusDot status={session?.status ?? "idle"} />
          {session?.status ?? "…"} · {session?.source} · {session?.cwd ?? "—"}
        </p>
      </TermBox>


      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {(data?.messages ?? []).map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex gap-2">
              <span className="select-none text-primary">&gt;</span>
              <div className="min-w-0 flex-1 whitespace-pre-wrap text-foreground">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <span className="select-none text-primary">⏺</span>
              <div className="prose prose-sm min-w-0 max-w-none flex-1 text-muted-foreground dark:prose-invert prose-p:my-1 prose-pre:bg-card prose-pre:text-xs">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          ),
        )}
        {(data?.replies ?? [])
          .filter((r) => r.status === "pending")
          .map((r) => (
            <div key={r.id} className="flex gap-2 opacity-70">
              <span className="select-none text-primary">&gt;</span>
              <div className="min-w-0 flex-1">
                <span className="whitespace-pre-wrap text-foreground">{r.content}</span>
                <span className="ml-2 text-xs text-muted-foreground">✳ enviando…</span>
              </div>
            </div>
          ))}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 bg-background pb-4 pt-2">
        <div className="flex items-end gap-2 rounded-md border border-border bg-card px-3 py-2 focus-within:border-primary/70">
          <span className="select-none pb-1 text-primary">&gt;</span>
          <textarea
            ref={inputRef}
            value={reply}
            rows={1}
            placeholder="Responder ao agente…"
            className="max-h-40 min-h-6 flex-1 resize-none bg-transparent py-1 text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <TermButton variant="primary" disabled={sending || !reply.trim()} onClick={() => void send()}>
            {sending ? "Enviando…" : "Enviar"}
          </TermButton>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          enter envia · shift+enter nova linha · atualiza a cada 2s
        </p>
      </div>

    </TermScreen>
  );
}
