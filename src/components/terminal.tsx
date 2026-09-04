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

