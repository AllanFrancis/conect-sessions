import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SourceIcon,
  StatusDot,
  TermBox,
  TermButton,
  TermCode,
  TermScreen,
  TermTag,
} from "@/components/terminal";
import { Markdown } from "@/components/markdown";
import { projectName, sessionTitle } from "@/lib/session-display";
import { parseChoices } from "@/lib/parse-choices";
import { chosenFor } from "@/lib/ask-answer";
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

/**
 * Uma pergunta de escolha, como o agente a entregou. Vale para o
 * `AskUserQuestion` do Claude Code e para o `pending_interaction` do Kiro —
 * o agente normaliza os dois para esta forma. O `id` da opção só existe no
 * Kiro, e existe porque é ele, não o rótulo, que volta na escolha.
 */
type AskQuestion = {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options?: { label: string; description?: string; id?: string }[];
};

/**
 * Uma chamada de ferramenta do Kiro DOBRADA com o resultado dela.
 *
 * O `tool_result` do Kiro só traz `toolCallId`, `content` e `success` — quem a
 * ferramenta é, e sobre o quê ela operou, vem do `tool_call` que veio antes no
 * arquivo. O agente resolve essa associação e entrega o par pronto, para o
 * painel nunca mostrar saída solta sem dizer de onde veio. O `call_id` é o
 * MESMO id da aprovação, quando a chamada precisou passar por uma.
 */
type ToolMeta = {
  call_id?: string | null;
  /** Nome técnico: `read_file`, `execute_pwsh`. */
  name?: string | null;
  /** Título legível que o próprio Kiro escreve: "Read File", "Run Command". */
  title?: string | null;
  kind?: string | null;
  /** O que foi operado: o caminho, o comando, a query. */
  target?: string | null;
  ok?: boolean;
  truncated?: boolean;
};

type MessageMeta = {
  ask?: AskQuestion[];
  tool_use_id?: string | null;
  answers_tool_use_id?: string | null;
  /** Claude Code: mapa `{enunciado: escolha}`, extraído do `tool_result`. */
  answers?: Record<string, string> | null;
  /** Kiro: a escolha crua — rótulo na pergunta, `optionId` na aprovação. */
  answer?: string | null;
  /** Kiro: `selected` | `answered` | `cancelled`. */
  outcome?: string | null;
  /** `reasoning` quando o bloco é pensamento do modelo, não fala. */
  kind?: string | null;
  /** Kiro: resultado de ferramenta, já casado com a chamada que o produziu. */
  tool?: ToolMeta;
};

/**
 * A escolha registrada para uma pergunta, como texto cru.
 *
 * O Claude Code guarda um mapa `{enunciado: escolha}`, porque uma mensagem pode
 * carregar várias perguntas. O Kiro resolve uma interação por vez e não repete
 * o enunciado na resolução — sobra `answer`. Quando nenhum dos dois veio, a
 * pergunta ainda tranca (o `answers_tool_use_id` já provou que foi respondida),
 * só não marca opção.
 */
function pickedOption(resolved: MessageMeta | undefined, q: AskQuestion): string | null {
  if (!resolved) return null;
  return resolved.answers?.[q.question] ?? resolved.answer ?? null;
}

/** `meta` chega como jsonb: só confiamos no que der para checar em runtime. */
function readMeta(value: unknown): MessageMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as MessageMeta;
}

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
          .select("id, role, content, meta, created_at")
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

  async function sendReply(content: string) {
    const text = content.trim();
    if (!text) return false;
    setSending(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("replies")
      .insert({ session_id: sessionId, user_id: userData.user!.id, content: text });
    setSending(false);
    if (error) {
      toast.error("Não foi possível enviar a resposta");
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    return true;
  }

  async function send() {
    if (await sendReply(reply)) {
      setReply("");
      inputRef.current?.focus();
    }
  }

  const session = data?.session;
  const messages = data?.messages ?? [];

  // Qual pergunta já foi respondida no terminal. O upsert de mensagens usa
  // ignoreDuplicates, então a linha da pergunta nunca é atualizada: o estado
  // vem por derivação, de uma mensagem POSTERIOR que carrega a prova.
  const answeredBy = new Map<string, MessageMeta>();
  for (const m of messages) {
    const meta = readMeta(m.meta);
    if (meta?.answers_tool_use_id) answeredBy.set(meta.answers_tool_use_id, meta);
  }

  return (
    <TermScreen className="flex min-h-screen flex-col">
      <TermBox tone="accent" className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/dashboard">
            <TermButton variant="ghost">← Voltar</TermButton>
          </Link>
          <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-primary">
            <SourceIcon source={session?.source} />
            <span className="truncate">
              {sessionTitle(
                session?.title,
                messages.find((m) => m.role === "user")?.content,
                session?.cwd,
              )}
            </span>
          </p>
        </div>
        <p className="mt-1 flex items-center gap-2 truncate text-xs text-muted-foreground">
          <StatusDot status={session?.status ?? "idle"} />
          {session?.status ?? "…"} · {projectName(session?.cwd, session?.title)}
        </p>
      </TermBox>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.map((m) => {
          const meta = readMeta(m.meta);

          if (meta?.ask?.length) {
            // Duas coisas distintas, de propósito. Que a pergunta FOI respondida
            // é provado pelo tool_result existir — e só isso decide o bloqueio.
            // QUAL opção foi escolhida é um extra, que pode faltar quando a
            // transcrição não traz as respostas estruturadas; nesse caso o bloco
            // ainda tranca, apenas sem marcar a opção.
            const answered = Boolean(meta.tool_use_id && answeredBy.has(meta.tool_use_id));
            const resolved = meta.tool_use_id ? answeredBy.get(meta.tool_use_id) : undefined;
            return (
              <div key={m.id} className="flex gap-2">
                <span className="select-none text-primary">?</span>
                <div className="min-w-0 flex-1 space-y-3">
                  {meta.ask.map((q, i) => {
                    const choice = pickedOption(resolved, q);
                    return (
                      <AskBlock
                        key={i}
                        question={q}
                        answered={answered}
                        {...(choice ? { answeredLabel: choice } : {})}
                        disabled={sending}
                        onPick={sendReply}
                      />
                    );
                  })}
                </div>
              </div>
            );
          }

          // Marcador de resposta sem texto: a escolha já aparece dentro do
          // bloco da pergunta, repetir aqui seria eco. O teste é pelo
          // `answers_tool_use_id` (o que prova ser um marcador) e não pelo
          // `answers`, que vem null quando o texto do CLI muda de formato —
          // aí sobraria uma linha `>` vazia na transcrição.
          if (meta?.answers_tool_use_id && !m.content.trim()) return null;

          // Resultado de ferramenta: cabeçalho sempre visível (o que rodou, sobre
          // o quê, deu certo?) e a saída dobrada. Despejar o corpo aberto seria o
          // ruído bruto que não queremos — um `read_file` sozinho enterra a
          // conversa. Fechado, ele vira uma linha de log; aberto, é o log inteiro.
          if (meta?.tool) {
            return <ToolBlock key={m.id} tool={meta.tool} output={m.content} />;
          }

          if (m.role === "user") {
            return (
              <div key={m.id} className="flex gap-2">
                <span className="select-none text-primary">&gt;</span>
                <div className="min-w-0 flex-1 whitespace-pre-wrap text-foreground">
                  {m.content}
                </div>
              </div>
            );
          }

          // O Kiro grava pensamento e fala com o mesmo papel; quem separa é o
          // `meta.kind`. Pensamento entra esmaecido e rotulado — sem ele a
          // transcrição do Kiro fica incoerente, misturado vira ruído. E não
          // vale procurar pergunta em prosa aqui: raciocínio não é convite a
          // responder, é o modelo falando consigo mesmo.
          const reasoning = meta?.kind === "reasoning";
          const choices = reasoning ? null : parseChoices(m.content);
          return (
            <div key={m.id} className={reasoning ? "flex gap-2 opacity-60" : "flex gap-2"}>
              <span className="select-none text-primary">{reasoning ? "·" : "⏺"}</span>
              <div className="min-w-0 flex-1 text-muted-foreground">
                {reasoning && <TermTag className="mb-1">raciocínio</TermTag>}
                <Markdown content={m.content} />
                {choices && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {choices.map((c) => (
                      <TermButton
                        key={c}
                        variant="ghost"
                        onClick={() => {
                          setReply(c);
                          inputRef.current?.focus();
                        }}
                      >
                        {c}
                      </TermButton>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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

      <div className="sticky bottom-0 bg-background pt-2 pb-4">
        <div className="flex items-end gap-2 rounded-md border border-border bg-card px-3 py-2 focus-within:border-primary/70">
          <span className="pb-1 select-none text-primary">&gt;</span>
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
          <TermButton
            variant="primary"
            disabled={sending || !reply.trim()}
            onClick={() => void send()}
          >
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

/**
 * Uma ferramenta que o Kiro rodou, com o resultado dobrado.
 *
 * O cabeçalho responde as três perguntas que importam de relance — QUAL
 * ferramenta, sobre O QUÊ, e deu certo? — e por isso fica sempre visível. A
 * saída vai dentro de um `<details>` fechado: ela é grande (mediana 339
 * caracteres, mas chega a dezenas de milhares) e aberta enterraria a conversa.
 * Quando o agente cortou, o rótulo diz que cortou; corte silencioso mentiria
 * sobre o que a ferramenta devolveu.
 */
function ToolBlock({ tool, output }: { tool: ToolMeta; output: string }) {
  const failed = tool.ok === false;
  const label = tool.title || tool.name || "ferramenta";
  return (
    <div className="flex gap-2">
      <span className="select-none text-primary">⚒</span>
      <div className="min-w-0 flex-1">
        <TermBox className={failed ? "space-y-1.5 border-destructive/70" : "space-y-1.5"}>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-foreground">{label}</span>
            {tool.target && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {tool.target}
              </span>
            )}
            <span
              className={
                failed
                  ? "ml-auto shrink-0 text-xs text-destructive"
                  : "ml-auto shrink-0 text-xs text-muted-foreground"
              }
            >
              {failed ? "falhou" : "ok"}
            </span>
          </div>
          {output.trim() && (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                saída{tool.truncated ? " (cortada pelo agente)" : ""}
              </summary>
              <div className="mt-1.5">
                <TermCode language={tool.name ?? "saída"} code={output} />
              </div>
            </details>
          )}
        </TermBox>
      </div>
    </div>
  );
}

/**
 * Uma pergunta de escolha com as opções clicáveis.
 *
 * `answered` diz que a pergunta já foi respondida NO TERMINAL — é o que tranca
 * as opções. `answeredLabel`, quando vem, diz qual opção foi escolhida e a
 * marca; ele pode faltar sem que o bloqueio se perca. Enquanto não há resposta,
 * clicar aqui só envia a escolha como resposta pendente: tanto o AskUserQuestion
 * do Claude Code quanto a interação do Kiro são modais que só o terminal
 * desbloqueia, então a UI promete envio, nunca resposta.
 */
function AskBlock({
  question,
  answered,
  answeredLabel,
  disabled,
  onPick,
}: {
  question: AskQuestion;
  answered: boolean;
  answeredLabel?: string;
  disabled: boolean;
  onPick: (content: string) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const options = question.options ?? [];
  const multi = question.multiSelect === true;
  const locked = answered || sent;

  // Rótulo (Claude Code) ou optionId (aprovação do Kiro) — `chosenFor` conhece
  // as duas provas. Em 137 respostas reais desta máquina, acertou todas.
  const chosen = answeredLabel ? chosenFor(answeredLabel, options) : picked;

  async function pick(label: string) {
    if (locked) return;
    if (multi) {
      setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
      return;
    }
    if (await onPick(label)) setSent(true);
  }

  return (
    <TermBox tone="accent" className="space-y-2">
      {question.header && <TermTag>{question.header}</TermTag>}
      <p className="text-foreground">{question.question}</p>
      <div className="space-y-1.5">
        {options.map((o) => {
          const active = chosen.includes(o.label);
          return (
            <button
              key={o.label}
              type="button"
              disabled={locked || disabled}
              onClick={() => void pick(o.label)}
              className={[
                "block w-full rounded-md border px-3 py-2 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/70",
                locked ? "cursor-default opacity-70" : "",
              ].join(" ")}
            >
              <span className="flex items-start gap-2">
                <span className="select-none text-primary">{active ? "◉" : "○"}</span>
                <span className="min-w-0">
                  <span className="block text-foreground">{o.label}</span>
                  {o.description && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {o.description}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {multi && !locked && (
        <TermButton
          variant="primary"
          disabled={disabled || picked.length === 0}
          onClick={async () => {
            if (await onPick(picked.join(", "))) setSent(true);
          }}
        >
          Enviar seleção
        </TermButton>
      )}
      <p className="text-xs text-muted-foreground">
        {answered
          ? "respondida no terminal"
          : sent
            ? "✳ escolha enviada ao agente — o terminal ainda precisa confirmar"
            : multi
              ? "escolha uma ou mais e envie"
              : "toque para enviar a escolha ao agente"}
      </p>
    </TermBox>
  );
}
