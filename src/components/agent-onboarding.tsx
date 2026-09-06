import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleArrowUp,
  Clock3,
  Copy,
  Monitor,
  Plus,
  RefreshCw,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TermBox } from "@/components/terminal";
import {
  claudeReloadCommand,
  deriveMachineStatus,
  describeMachineAdvice,
  describeMachineStatus,
  formatLastSeen,
  isDuplicateMachineName,
  type MachineStatus,
  type MachineTelemetry,
} from "@/lib/agent-onboarding";
import { cn } from "@/lib/utils";

export type Machine = MachineTelemetry & {
  id: string;
  name: string;
  platform: string | null;
};

export type PairingView = {
  command: string;
  countdown: string | null;
  expiresAt: string;
  mode: "add" | "repair";
  name: string;
  state: "waiting" | "connected" | "expired";
};

const statusStyles: Record<MachineStatus, string> = {
  pending: "border-primary/50 text-primary",
  connected: "border-primary/50 text-primary",
  outdated: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  attention: "border-destructive/50 text-destructive",
  revoked: "border-border text-muted-foreground",
};

/** Mesma severidade do badge, para o estado não ser lido de dois jeitos. */
const adviceStyles: Record<MachineStatus, string> = {
  pending: "text-muted-foreground",
  connected: "text-muted-foreground",
  outdated: "text-amber-600 dark:text-amber-400",
  attention: "text-destructive",
  revoked: "text-muted-foreground",
};

// Cada estado tem forma própria além da cor — inclusive "desatualizada" e "com
// atenção", que são vizinhas em severidade: quem não distingue âmbar de vermelho
// separa as duas pela seta e pelo triângulo, antes de chegar ao rótulo.
function StatusIcon({ status }: { status: MachineStatus }) {
  if (status === "connected") return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (status === "pending") return <Clock3 className="size-4" aria-hidden="true" />;
  if (status === "revoked") return <ShieldOff className="size-4" aria-hidden="true" />;
  if (status === "outdated") return <CircleArrowUp className="size-4" aria-hidden="true" />;
  return <AlertTriangle className="size-4" aria-hidden="true" />;
}

export function MachineStatusBadge({ machine }: { machine: MachineTelemetry }) {
  const status = deriveMachineStatus(machine);
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs",
        statusStyles[status],
      )}
    >
      <StatusIcon status={status} />
      {describeMachineStatus(status)}
    </span>
  );
}

/**
 * Porta de entrada da jornada: dá nome à máquina e dispara o pareamento.
 *
 * Mora aqui, e não no arquivo da rota, para poder ser exportada e renderizada em
 * teste como o resto da jornada — era o único pedaço cuja única prova era ler o
 * código.
 */
export function AddMachineForm({
  busy,
  existingNames,
  onAdd,
}: {
  busy: boolean;
  existingNames: string[];
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const duplicate = isDuplicateMachineName(name, existingNames);
  return (
    <form
      className="mt-4 flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || duplicate) return;
        onAdd(trimmed);
        setName("");
      }}
    >
      {/*
        O aviso é IRMÃO do label, não filho.
        Dentro do <label> ele entrava no nome acessível do campo e voltava de
        novo pelo aria-describedby — a mesma frase anunciada duas vezes.
      */}
      <div className="flex-1">
        <label htmlFor="machine-name">
          <span className="sr-only">Nome da máquina</span>
        </label>
        <input
          id="machine-name"
          value={name}
          maxLength={80}
          placeholder="Nome da máquina, ex.: Notebook do trabalho"
          aria-invalid={duplicate}
          aria-describedby={duplicate ? "machine-name-error" : undefined}
          className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
          onChange={(event) => setName(event.target.value)}
        />
        {duplicate && (
          <span
            id="machine-name-error"
            role="alert"
            className="mt-1 block text-xs text-destructive"
          >
            Você já tem uma máquina com esse nome. Reinstale pelo cartão dela, na lista abaixo.
          </span>
        )}
      </div>
      <Button type="submit" className="min-h-11" disabled={busy || !trimmed || duplicate}>
        <span className="relative" aria-hidden="true">
          <Monitor />
          <Plus className="absolute -right-1.5 -top-1.5 size-3 rounded-full bg-primary text-primary-foreground" />
        </span>
        {busy ? "Preparando…" : "Adicionar máquina"}
      </Button>
    </form>
  );
}

/**
 * Passo do rastreador.
 *
 * O círculo e o ícone são decorativos, então a conclusão precisa existir em
 * texto: sem o rótulo escondido, "aguardando" e "concluído" produziam a MESMA
 * lista para um leitor de tela, e a única diferença entre os dois estados era a
 * cor da linha.
 */
function Step({ done, number, children }: { done: boolean; number: number; children: string }) {
  return (
    <li
      className={cn("flex items-center gap-2", done ? "text-foreground" : "text-muted-foreground")}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
          done && "border-primary bg-primary text-primary-foreground",
        )}
        aria-hidden="true"
      >
        {done ? <Check className="size-4" /> : number}
      </span>
      <span>
        {children}
        <span className="sr-only">{done ? " (concluído)" : " (pendente)"}</span>
      </span>
    </li>
  );
}

/**
 * Comando copiável.
 *
 * O nome acessível do botão carrega o comando inteiro porque, sem enxergar o
 * bloco, "Copiar comando" não diz o que vai para a área de transferência — e
 * este é um comando que executa código na máquina de quem cola.
 */
function CopyCommand({
  command,
  caption,
  label = "Copiar comando",
}: {
  command: string;
  caption: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar. Selecione o comando manualmente.");
    }
  }
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">{caption}</span>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          aria-label={`${label}: ${command}`}
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copiado" : label}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 py-3 text-xs leading-relaxed">
        <code>{command}</code>
      </pre>
    </div>
  );
}

export function PairingPanel({
  pairing,
  onCancel,
}: {
  pairing: PairingView;
  onCancel: () => void;
}) {
  const complete = pairing.state === "connected";
  const expired = pairing.state === "expired";
  const progress = complete ? 100 : expired ? 34 : 67;
  return (
    <TermBox tone="accent" className="mt-4 space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base text-foreground">
            {pairing.mode === "repair" ? "Reparar" : "Adicionar"} {pairing.name}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Um comando instala, configura e inicia tudo automaticamente.
          </p>
        </div>
        {/*
          O contador fica fora da região `aria-live`: ele muda a cada segundo e
          um leitor de tela repetiria a linha inteira sessenta vezes por minuto.
          A mudança que importa — conectou, expirou — é anunciada abaixo.
        */}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="size-4" aria-hidden="true" />
          {complete
            ? "instalação concluída"
            : pairing.countdown
              ? `código expira em ${pairing.countdown}`
              : "código expirado"}
        </span>
      </div>
      <Progress value={progress} aria-label={`Progresso da instalação: ${progress}%`} />
      <ol className="grid gap-3 sm:grid-cols-3">
        <Step number={1} done>
          Comando criado
        </Step>
        <Step number={2} done={complete}>
          Instalar na máquina
        </Step>
        <Step number={3} done={complete}>
          Confirmar conexão
        </Step>
      </ol>
      {!complete && !expired && (
        <CopyCommand command={pairing.command} caption="PowerShell no Windows" />
      )}
      <div role="status" aria-live="polite" className="flex items-start gap-2 text-sm">
        {complete ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : null}
        {expired ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : null}
        {!complete && !expired ? (
          <RefreshCw
            className="mt-0.5 size-4 shrink-0 animate-spin text-primary"
            aria-hidden="true"
          />
        ) : null}
        <span>
          {complete
            ? "Máquina conectada. A instalação terminou."
            : expired
              ? "O código expirou. Gere outro para continuar."
              : "Aguardando a máquina conectar. Esta tela atualiza sozinha."}
        </span>
      </div>
      {/*
        O plugin entra sozinho em sessões novas do Claude Code; as que já estavam
        abertas quando o instalador rodou precisam recarregar. É o único passo
        manual da jornada, então só aparece quando ele é de fato o próximo.
      */}
      {complete && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Se você já tinha uma sessão do Claude Code aberta nesta máquina, ative o plugin nela:
          </p>
          <CopyCommand
            command={claudeReloadCommand}
            caption="Dentro do Claude Code"
            label="Copiar atalho"
          />
        </div>
      )}
      {/*
        Sempre há uma saída do painel. Sem o botão no estado conectado a jornada
        não terminava: o cartão de instalação ficava na tela cobrindo a lista de
        máquinas até alguém recarregar a página.
      */}
      <Button
        type="button"
        variant={complete || expired ? "default" : "outline"}
        className="min-h-11"
        onClick={onCancel}
      >
        {complete ? "Concluir" : expired ? "Gerar outro código" : "Cancelar instalação"}
      </Button>
    </TermBox>
  );
}

export function MachineCard({
  machine,
  uninstallCommand,
  onRepair,
  onRevoke,
}: {
  machine: Machine;
  uninstallCommand: string;
  onRepair: () => void;
  onRevoke: () => void;
}) {
  const status = deriveMachineStatus(machine);
  const advice = describeMachineAdvice(machine, status);
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
          <Monitor className="size-5 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {/*
            O nome quebra, não corta. Medido em 390px: com `truncate`, o cartão
            mostrava "Windows do Al…" — o identificador da máquina virava o único
            texto ilegível da tela, justo o que o usuário usa para saber em qual
            delas está mexendo.
          */}
          <h3 className="text-base wrap-anywhere text-foreground">{machine.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {machine.platform || "Windows"} · versão {machine.agent_version || "não informada"} ·{" "}
            {formatLastSeen(machine.last_seen_at)}
          </p>
        </div>
        {/*
          No celular o badge desce para a própria linha em vez de disputar a
          largura com o nome; no desktop, onde sobra espaço, volta para o canto.
        */}
        <div className="w-full sm:w-auto">
          <MachineStatusBadge machine={machine} />
        </div>
      </div>
      {/*
        O conselho herda a severidade do badge. Antes ele era vermelho para tudo
        que não fosse `pending`, então "Desatualizada" aparecia âmbar na pílula e
        vermelha na frase logo abaixo — duas leituras de gravidade para o mesmo
        estado.
      */}
      {advice && (
        <p className={cn("mt-3 text-xs", adviceStyles[status])}>
          {advice.message} Use “{advice.action}” abaixo.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {/*
          Máquina revogada também repara: `consume_agent_pairing` com alvo limpa
          o `revoked_at` e gira o token do MESMO agente, então reconectar
          preserva identidade e histórico em vez de criar uma segunda máquina.
        */}
        <Button type="button" variant="outline" className="min-h-11" onClick={onRepair}>
          <RefreshCw /> {advice?.action ?? "Reparar"}
        </Button>
        {status !== "revoked" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="min-h-11 text-destructive">
                <ShieldOff /> Revogar acesso
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revogar acesso de {machine.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  A máquina deixa de sincronizar imediatamente. As sessões já recebidas continuam no
                  histórico e você pode reconectá-la depois.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {/*
                min-h-11 também aqui: são os dois controles destrutivos da tela e
                herdavam o h-9 (36px) do botão padrão. O teste de SSR não alcança
                este trecho — o Radix só monta o conteúdo do diálogo depois de
                aberto —, então a verificação de geometria fica no passe de
                navegador da task 5.
              */}
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">Manter acesso</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11 bg-destructive text-destructive-foreground"
                  onClick={onRevoke}
                >
                  Revogar acesso
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <details className="w-full pt-1 text-xs text-muted-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center py-3 hover:text-foreground">
            <Trash2 className="mr-1.5 inline size-4" aria-hidden="true" /> Remover do Windows
          </summary>
          <p className="mb-2">Na máquina, abra o PowerShell e execute:</p>
          <CopyCommand command={uninstallCommand} caption="PowerShell no Windows" />
        </details>
      </div>
    </article>
  );
}
