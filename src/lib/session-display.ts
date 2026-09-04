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
