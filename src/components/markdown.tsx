import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TermCode } from "@/components/terminal";

/**
 * Renderer de markdown da transcrição.
 *
 * Não usamos `@tailwindcss/typography`: o preflight do Tailwind v4 zera
 * headings e listas, e o `prose` genérico traria uma paleta própria brigando
 * com os tokens oklch de styles.css. Mapear os elementos à mão custa o mesmo e
 * mantém a transcrição com a cara do terminal.
 */
const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? "");
    // Sem `language-*` é code inline — fence sempre chega com a classe, mesmo
    // quando o autor não declarou a linguagem (aí vem só `language-`).
    if (!match && !String(children).includes("\n")) {
      return (
        <code
          className="rounded-[4px] bg-secondary px-1 py-0.5 text-[0.9em] text-foreground"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <TermCode
        {...(match ? { language: match[1] } : {})}
        code={String(children).replace(/\n$/, "")}
      />
    );
  },
  // O card já é o contêiner do bloco; deixar o <pre> original aqui aninharia
  // um <pre> dentro do outro.
  pre({ children }) {
    return <>{children}</>;
  },
  p({ children }) {
    return <p className="my-1.5 leading-6">{children}</p>;
  },
  h1({ children }) {
    return <h1 className="mt-4 mb-1.5 text-base font-medium text-foreground">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mt-4 mb-1.5 text-sm font-medium text-foreground">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mt-3 mb-1 text-sm font-medium text-foreground">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="mt-3 mb-1 text-sm font-medium text-muted-foreground">{children}</h4>;
  },
  ul({ children }) {
    return <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-6 marker:text-primary">{children}</li>;
  },
  strong({ children }) {
    return <strong className="font-medium text-foreground">{children}</strong>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground italic">
        {children}
      </blockquote>
    );
  },
  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  hr() {
    return <hr className="my-3 border-border" />;
  },
  // Tabela larga rola dentro do próprio wrapper, pelo mesmo motivo do TermCode.
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-border px-2 py-1.5 text-left font-medium text-foreground">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border-b border-border/50 px-2 py-1.5 align-top">{children}</td>;
  },
};

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
