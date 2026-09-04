import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TermBox, TermScreen } from "@/components/terminal";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Remote Session Monitor" },
      {
        name: "description",
        content:
          "Acesse o painel para acompanhar e responder remotamente sessões de chat do Claude Code e do Kiro.",
      },
      { property: "og:title", content: "Entrar — Remote Session Monitor" },
      {
        property: "og:description",
        content: "Acompanhe e responda remotamente suas sessões de chat de IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Conta criada. Verifique seu e-mail se for solicitado.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    // signInWithOAuth navega o browser para o Google; em caso de sucesso esta
    // função nunca retorna — só tratamos o erro de montagem da URL.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      toast.error("Não foi possível entrar com Google");
    }
  }

  const fieldClass =
    "flex items-center gap-2 rounded-md border border-border px-3 py-2 focus-within:border-primary/70";

  return (
    <TermScreen className="flex min-h-screen max-w-xl flex-col justify-center">
      <TermBox tone="accent" className="px-4 py-3">
        <p className="text-primary">✻ {mode === "signin" ? "Entrar" : "Criar conta"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          painel remoto das suas sessões de chat de IA
        </p>
      </TermBox>

      <form onSubmit={submit} className="mt-4 space-y-2">
        <div className={fieldClass}>
          <span className="select-none text-muted-foreground">email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 bg-transparent text-foreground outline-none"
          />
        </div>
        <div className={fieldClass}>
          <span className="select-none text-muted-foreground">senha</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 bg-transparent text-foreground outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center gap-2 rounded-md border border-primary/70 px-3 py-2 text-left text-foreground hover:bg-accent/50 disabled:opacity-50"
        >
          <span className="text-primary">&gt;</span>
          {loading ? "✳ autenticando…" : mode === "signin" ? "entrar" : "criar conta"}
        </button>
      </form>

      <button
        onClick={google}
        className="mt-2 flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-muted-foreground hover:text-foreground"
      >
        <span className="text-primary">&gt;</span> continuar com Google
      </button>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "/signup criar conta" : "/signin já tenho conta"}
        </button>
        <span className="opacity-30">·</span>
        <Link to="/" className="hover:text-primary">
          /home
        </Link>
      </div>
    </TermScreen>
  );
}
