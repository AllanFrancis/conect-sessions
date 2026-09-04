import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Container central com o respiro típico de um terminal. */
export function TermScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto w-full max-w-4xl px-4 py-6 text-sm", className)}>{children}</main>
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
  running: "text-primary",
  waiting: "text-destructive",
  error: "text-destructive",
  idle: "text-muted-foreground",
  done: "text-muted-foreground",
};

export function StatusDot({ status }: { status: string }) {
  return (
    <span className={cn("select-none", statusColor[status] ?? "text-muted-foreground")}>
      {status === "running" ? "✳" : "⏺"}
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


/** Marca visual de cada origem (no lugar do nome "kiro"/"claude-code"). */
export function SourceIcon({ source, className }: { source?: string | null; className?: string }) {
  const key = (source ?? "").toLowerCase();
  const label = key === "claude-code" ? "Claude Code" : key === "kiro" ? "Kiro" : source || "agente";
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
          <path
            d="M6 20V9a6 6 0 1 1 12 0v11l-3-2-3 2-3-2-3 2Z"
            fill="currentColor"
            opacity="0.9"
          />
          <circle cx="9.6" cy="10" r="1.15" className="fill-secondary" />
          <circle cx="14.4" cy="10" r="1.15" className="fill-secondary" />
        </svg>
      ) : (
        <span className="text-[10px] text-muted-foreground">◆</span>
      )}
    </span>
  );
}
