import { cn } from "@/lib/utils";
import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode, RefObject } from "react";
import { toast } from "sonner";

/** Container central com o respiro típico de um terminal. */
export function TermScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto w-full max-w-4xl px-4 py-6 text-sm", className)}>{children}</main>
  );
}

/**
 * Barra fixa do topo em página de conversa: voltar, título centralizado, ação.
 *
 * O título fica no centro e truncado em uma linha porque no celular ele briga
 * com os dois botões pelo mesmo espaço — deixar quebrar empurraria a conversa
 * para baixo a cada sessão de nome comprido. O subtítulo carrega o contexto
 * (projeto, estado) que não cabe no título.
 */
export function TermTopBar({
  left,
  title,
  subtitle,
  right,
}: {
  left?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-2 py-2">
        <div className="flex size-9 shrink-0 items-center justify-center">{left}</div>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-foreground">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center">{right}</div>
      </div>
    </header>
  );
}

/** Botão redondo da barra/composer, do tamanho que um polegar acerta (44px). */
export function TermIconButton({
  children,
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Bolha da fala do usuário, encostada à direita.
 *
 * `max-w` de 85% em vez de largura cheia: é o que faz o lado direito ser lido
 * como "isto foi você", sem precisar de rótulo. E `break-words` porque a fala
 * do usuário frequentemente é um caminho ou um comando sem espaço, que estoura
 * a linha num viewport de 360px.
 */
export function ChatBubble({
  children,
  className,
  tone = "user",
}: {
  children: ReactNode;
  className?: string;
  tone?: "user" | "pending";
}) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 wrap-anywhere whitespace-pre-wrap",
          tone === "pending"
            ? "border border-dashed border-primary/50 bg-secondary/50 text-muted-foreground"
            : "bg-secondary text-foreground",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Linha discreta que resume algo dobrado e abre ao toque ("Executou 8 comandos ›").
 *
 * Ferramenta é ruído até você querer o detalhe: fechada ela é uma linha, aberta
 * é o log inteiro. O chevron gira para dizer qual dos dois estados está valendo,
 * porque só a palavra "saída" não diz se há algo escondido ali.
 */
export function CollapsedRow({
  summary,
  children,
  tone = "muted",
}: {
  summary: ReactNode;
  children?: ReactNode;
  tone?: "muted" | "danger";
}) {
  return (
    <details className="group">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 py-1 text-sm transition-colors marker:content-none hover:text-foreground",
          tone === "danger" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span className="shrink-0 select-none transition-transform group-open:rotate-90">›</span>
      </summary>
      {children && <div className="pb-1">{children}</div>}
    </details>
  );
}

/** Caixa arredondada estilo Claude Code (╭──╮). */
export function TermBox({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "accent" ? "border-primary/70" : "border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Etiqueta curta que rotula um bloco (cabeçalho de pergunta, raciocínio). */
export function TermTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-[4px] border border-border px-1.5 py-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Linha de log: ⏺ marcador + conteúdo. */
export function TermLine({
  marker = "⏺",
  tone = "muted",
  children,
  className,
}: {
  marker?: string;
  tone?: "muted" | "accent" | "fg" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === "accent"
      ? "text-primary"
      : tone === "danger"
        ? "text-destructive"
        : tone === "fg"
          ? "text-foreground"
          : "text-muted-foreground";
  return (
    <div className={cn("flex gap-2 leading-6", className)}>
      <span className={cn("select-none", toneClass)}>{marker}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const statusColor: Record<string, string> = {
  // vocabulário do session monitor
  active: "text-primary",
  idle: "text-muted-foreground",
  finished: "text-muted-foreground",
  unknown: "text-muted-foreground",
  // valores legados de agentes ainda não atualizados
  running: "text-primary",
  waiting: "text-destructive",
  error: "text-destructive",
  done: "text-muted-foreground",
};

// "?" deixa explícito o que o monitor não conseguiu provar, em vez de fingir
// um estado. Ver docs/session-monitoring.md.
const statusMarker: Record<string, string> = {
  active: "✳",
  running: "✳",
  unknown: "?",
  finished: "○",
  done: "○",
};

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn("select-none", statusColor[status] ?? "text-muted-foreground")}
      title={status}
    >
      {statusMarker[status] ?? "⏺"}
    </span>
  );
}

/** Botão com aparência clicável explícita. */
export function TermButton({
  children,
  className,
  variant = "ghost",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
        variant === "primary" &&
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" &&
          "border-border bg-card text-muted-foreground hover:border-primary/70 hover:text-primary",
        variant === "danger" &&
          "border-border bg-card text-muted-foreground hover:border-destructive hover:text-destructive",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Estilo de link que parece clicável (usado com <Link>). */
export const termLinkClass =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/70 hover:text-primary";

/** Barra de dicas inferior, como o rodapé do CLI. */
export function TermHints({ items }: { items: string[] }) {
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {items.map((i, idx) => (
        <span key={i}>
          {idx > 0 && <span className="mx-2 opacity-40">·</span>}
          {i}
        </span>
      ))}
    </p>
  );
}

/**
 * Composer fixo no rodapé: pílula com o campo que cresce e a fileira de ações.
 *
 * Fica preso embaixo com a área segura somada ao padding — sem isso, no iPhone
 * a barra de gestos come o botão de enviar, e quem está no celular fica com a
 * mensagem escrita e sem como mandar.
 *
 * O Enter envia e o Shift+Enter quebra linha, como no CLI. No celular o teclado
 * manda um Enter "solto" a cada nova linha desejada, então o `enterKeyHint`
 * avisa o teclado que aquela tecla envia — sem isso a pessoa escreve um
 * parágrafo e o manda picado em cinco respostas.
 */
export function TermComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  hint,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const vazio = !value.trim();
  return (
    <div
      className="sticky bottom-0 z-20 border-t border-border bg-background px-3 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
    >
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-border bg-card px-4 py-2.5 focus-within:border-primary/70">
        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          enterKeyHint="send"
          placeholder={placeholder}
          className="max-h-40 min-h-7 w-full resize-none bg-transparent py-1 text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <div className="flex items-center gap-2 pt-1">
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{hint}</div>
          <button
            type="button"
            disabled={disabled || vazio}
            onClick={onSend}
            aria-label="Enviar resposta"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path
                d="M12 19V5M5 12l7-7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Marca visual de cada origem (no lugar do nome "kiro"/"claude-code"). */
export function SourceIcon({
  source,
  className,
}: {
  source?: string | null | undefined;
  className?: string | undefined;
}) {
  const key = (source ?? "").toLowerCase();
  const label =
    key === "claude-code" ? "Claude Code" : key === "kiro" ? "Kiro" : source || "agente";
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-border bg-secondary",
        className,
      )}
    >
      {key === "claude-code" ? (
        <svg viewBox="0 0 24 24" className="size-3.5 text-primary" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
          </g>
        </svg>
      ) : key === "kiro" ? (
        <svg viewBox="0 0 24 24" className="size-3.5 text-foreground" aria-hidden="true">
          <path d="M6 20V9a6 6 0 1 1 12 0v11l-3-2-3 2-3-2-3 2Z" fill="currentColor" opacity="0.9" />
          <circle cx="9.6" cy="10" r="1.15" className="fill-secondary" />
          <circle cx="14.4" cy="10" r="1.15" className="fill-secondary" />
        </svg>
      ) : (
        <span className="text-[10px] text-muted-foreground">◆</span>
      )}
    </span>
  );
}

/**
 * Bloco de código como card: rótulo da linguagem, copiar e rolagem própria.
 *
 * O `overflow-x-auto` fica AQUI, não no pai: linha longa de código é o único
 * conteúdo largo da transcrição, e sem esse contêiner ela empurraria o body
 * inteiro de lado — que no celular é a diferença entre ler e não ler.
 */
export function TermCode({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sem permissão de clipboard (http, iOS antigo): o texto segue
      // selecionável na mão, então não vale interromper com erro.
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate text-xs text-muted-foreground">{language || "código"}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          {copied ? "copiado ✓" : "copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
