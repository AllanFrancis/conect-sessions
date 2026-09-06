import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AddMachineForm,
  MachineCard,
  PairingPanel,
  type PairingView,
} from "@/components/agent-onboarding";
import { TermBox, TermHints, TermScreen, termLinkClass } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  buildInstallCommand,
  buildUninstallCommand,
  describePairingError,
  formatPairingCountdown,
} from "@/lib/agent-onboarding";
import { cancelAgentPairing, createAgentPairing, revokeAgent } from "@/lib/agents.functions";

type ActivePairing = {
  pairingId: string;
  code: string;
  expiresAt: string;
  mode: "add" | "repair";
  name: string;
  targetAgentId?: string;
};

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "Máquinas — Remote Session Monitor" },
      { name: "description", content: "Instale e acompanhe suas máquinas em poucos passos." },
      { property: "og:title", content: "Máquinas — Remote Session Monitor" },
      { property: "og:description", content: "Instale e acompanhe suas máquinas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentsPage,
});

async function fetchAgents() {
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id,name,last_seen_at,installed_at,agent_version,platform,plugin_status,install_error,revoked_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchPairing(pairingId: string) {
  const { data, error } = await supabase
    .from("agent_pairing_codes")
    .select("id,consumed_at,agent_id,expires_at")
    .eq("id", pairingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function usePairingView(active: ActivePairing | null, consumed: boolean): PairingView | null {
  const [baseUrl, setBaseUrl] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    setBaseUrl(window.location.origin);
    setNow(Date.now());
    if (!active || consumed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active, consumed]);
  return useMemo(() => {
    if (!active || !baseUrl) return null;
    const countdown = formatPairingCountdown(active.expiresAt, now);
    return {
      command: buildInstallCommand(baseUrl, active.code),
      countdown,
      expiresAt: active.expiresAt,
      mode: active.mode,
      name: active.name,
      state: consumed ? "connected" : countdown ? "waiting" : "expired",
    };
  }, [active, baseUrl, consumed, now]);
}

function AgentsPage() {
  const createPairing = useServerFn(createAgentPairing);
  const cancelPairing = useServerFn(cancelAgentPairing);
  const revoke = useServerFn(revokeAgent);
  const queryClient = useQueryClient();
  const [active, setActive] = useState<ActivePairing | null>(null);
  // Mesmo polling do painel de sessões (3s). Não é só para ver a máquina nova
  // chegar: o estado envelhece sozinho — "conectada" vira "com atenção" quando
  // o heartbeat para —, e sem re-render o cartão continuaria mentindo.
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
    refetchInterval: 3_000,
  });
  const pairingQuery = useQuery({
    queryKey: ["agent-pairing", active?.pairingId],
    queryFn: () => fetchPairing(active!.pairingId),
    enabled: Boolean(active),
    refetchInterval: (query) => {
      if (!active || query.state.data?.consumed_at) return false;
      return Date.now() < new Date(active.expiresAt).getTime() ? 2_000 : false;
    },
  });
  const consumed = Boolean(pairingQuery.data?.consumed_at);
  const pairingView = usePairingView(active, consumed);

  useEffect(() => {
    if (consumed) void queryClient.invalidateQueries({ queryKey: ["agents"] });
  }, [consumed, queryClient]);

  /*
   * Cancela o código pendente ao trocar de pareamento ou fechar o painel.
   *
   * O banco só substitui o código pendente do MESMO nome ou do mesmo alvo, então
   * começar "Desktop" com o de "Notebook" na tela deixava dois códigos válidos e
   * só um visível. Isto fecha o caminho pela interface — NÃO o caso de sair da
   * rota, dar refresh ou fechar a aba: aí o componente desmonta sem chamar nada
   * e o código continua vivo até expirar. Cancelar no cleanup do efeito seria
   * pior: em StrictMode o ciclo monta-desmonta-monta apagaria o código recém
   * criado. A garantia dura contra código órfão continua sendo a expiração de
   * dez minutos e o consumo atômico, não esta função.
   */
  async function discardPendingCode(pairing: ActivePairing | null, alreadyConsumed: boolean) {
    if (!pairing || alreadyConsumed) return;
    try {
      await cancelPairing({ data: { pairingId: pairing.pairingId } });
    } catch {
      toast.error("Não foi possível cancelar o código anterior, mas ele expira automaticamente.");
    }
  }

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; targetAgentId?: string }) => {
      await discardPendingCode(active, consumed);
      const result = await createPairing({ data: input });
      return {
        ...result,
        ...input,
        mode: input.targetAgentId ? ("repair" as const) : ("add" as const),
      };
    },
    onSuccess: (result) => setActive(result),
    onError: (error) => toast.error(describePairingError(error)),
  });

  async function closePairing() {
    await discardPendingCode(active, consumed);
    setActive(null);
  }

  function finishOrRetryPairing() {
    if (!active || pairingView?.state !== "expired") return void closePairing();
    const input = active.targetAgentId
      ? { name: active.name, targetAgentId: active.targetAgentId }
      : { name: active.name };
    createMutation.mutate(input);
  }

  async function revokeMachine(agentId: string) {
    try {
      await revoke({ data: { agentId } });
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Acesso revogado");
    } catch {
      toast.error("Não foi possível revogar o acesso.");
    }
  }

  return (
    <TermScreen>
      <TermBox tone="accent" className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base text-primary">✻ Máquinas</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Instale uma vez e acompanhe o Claude Code pelo celular.
            </p>
          </div>
          <Link to="/dashboard" className={termLinkClass}>
            ← Sessões
          </Link>
        </div>
      </TermBox>

      <AddMachineForm
        busy={createMutation.isPending}
        existingNames={(agentsQuery.data ?? []).map((machine) => machine.name)}
        onAdd={(name) => createMutation.mutate({ name })}
      />

      {pairingView && <PairingPanel pairing={pairingView} onCancel={finishOrRetryPairing} />}

      <section className="mt-6" aria-labelledby="machines-heading">
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <h2 id="machines-heading" className="text-base text-foreground">
              Suas máquinas
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Estado, versão e última conexão em um só lugar.
            </p>
          </div>
          {/*
            `shrink-0` e sem quebra: em 390px o subtítulo empurrava a contagem
            até ela partir em "1 no" / "total", empilhado em cima do texto ao
            lado. Agora o subtítulo é quem quebra, e a contagem fica inteira.
          */}
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            {agentsQuery.data?.length ?? 0} no total
          </span>
        </div>
        {agentsQuery.isLoading && (
          <p role="status" className="text-muted-foreground">
            Carregando máquinas…
          </p>
        )}
        {agentsQuery.isError && (
          <p role="alert" className="text-destructive">
            Não foi possível carregar. Recarregue a página.
          </p>
        )}
        {!agentsQuery.isLoading && !agentsQuery.data?.length && (
          <TermBox className="py-8 text-center text-muted-foreground">
            Nenhuma máquina instalada. Dê um nome acima para começar.
          </TermBox>
        )}
        <div className="space-y-3">
          {agentsQuery.data?.map((machine) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              uninstallCommand={buildUninstallCommand()}
              onRepair={() =>
                createMutation.mutate({ name: machine.name, targetAgentId: machine.id })
              }
              onRevoke={() => void revokeMachine(machine.id)}
            />
          ))}
        </div>
      </section>

      <TermHints
        items={["códigos expiram automaticamente", "revogar bloqueia o acesso imediatamente"]}
      />
    </TermScreen>
  );
}
