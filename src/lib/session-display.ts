/** Helpers para mostrar um nome legível da sessão em vez do código/uuid. */

const ID_LIKE = /^[0-9a-f]{8}-?[0-9a-f-]{4,}$/i;

/** Nome do projeto = última pasta do cwd (ou o título, se ele não for um código). */
export function projectName(cwd?: string | null, fallbackTitle?: string | null): string {
  const path = (cwd ?? "").replace(/[\\/]+$/, "");
  const base = path.split(/[\\/]/).pop();
  if (base) return base;
  if (fallbackTitle && !isCodeLike(fallbackTitle)) return fallbackTitle;
  return "projeto";
}

export function isCodeLike(value?: string | null): boolean {
  const v = (value ?? "").trim();
  return !v || ID_LIKE.test(v) || /^[0-9a-f]{16,}$/i.test(v);
}

/** Título legível: usa a primeira mensagem do usuário quando o título é um código. */
export function sessionTitle(
  title?: string | null,
  firstUserMessage?: string | null,
  cwd?: string | null,
): string {
  const t = (title ?? "").trim();
  if (t && !isCodeLike(t) && t !== projectName(cwd)) return t;
  const msg = (firstUserMessage ?? "").replace(/\s+/g, " ").trim();
  if (msg) return msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
  return t || "Sessão sem título";
}

/**
 * Quando foi, na forma que se lê de relance no celular.
 *
 * Hora cheia ("19:46:03") obriga a pessoa a comparar com o relógio para saber
 * se a sessão é de agora ou de ontem. Perto do presente o que importa é a
 * distância ("agora", "há 5 min"); longe, o que importa é a data — e aí a hora
 * exata só ocupa espaço numa tela estreita.
 */
export function relativeTime(value?: string | null, now: Date = new Date()): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.round((now.getTime() - t) / 60000);
  // Relógio de máquina remota adianta: futuro perto é desvio, não viagem no tempo.
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas} h`;
  return new Date(t).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

/**
 * Os estados que a lista do painel mostra.
 *
 * A DEC-20260904-1443 fechou a lista em `active` para tirar dela o ruído das
 * sessões mortas, e isso continua valendo: `idle` e `unknown` seguem fora.
 * `waiting` entra por inclusão explícita DESSE estado, não por afrouxar o
 * filtro — é a sessão que parou esperando o usuário e que, sem o painel, ele
 * só descobre chegando no computador. Era a única que não aparecia, e é a que
 * mais precisa aparecer.
 */
export const STATUS_NO_PAINEL = ["active", "waiting"] as const;

/**
 * A palavra do estado ganha a cor do estado, como o marcador já tem.
 *
 * Num cartão a pessoa lê a palavra antes do símbolo; deixar as duas coisas
 * dizendo a mesma coisa é o que faz "está rodando" saltar sem precisar
 * procurar. Só os dois estados que pedem os olhos dela recebem destaque — se
 * tudo destacasse, nada destacaria. `waiting` puxa mais que `active` porque é o
 * único que não anda sozinho: sem o usuário, fica parado para sempre.
 */
export function statusTone(status: string): string {
  if (status === "waiting") return "text-destructive";
  return status === "active" || status === "running" ? "text-primary" : "";
}
