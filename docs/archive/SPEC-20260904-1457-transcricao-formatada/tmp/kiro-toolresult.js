/**
 * Quantos caracteres de saída de ferramenta atravessam para o painel.
 *
 * A mediana real é 339 e o p90 é 5746, mas um `read_file` de arquivo grande
 * chega a 78 mil — e a transcrição inteira é repolida a cada 2s no celular.
 * O corte é declarado na UI ("saída (truncada)"), nunca silencioso.
 */
const KIRO_RESULT_MAX = 4000;

/** Chaves de `args` que identificam a chamada, da mais específica à mais geral. */
const KIRO_ARG_KEYS = [
  "path",
  "targetFile",
  "command",
  "query",
  "url",
  "requirementsFilePath",
  "files",
  "name",
  "action",
  "title",
];

/**
 * O QUE a ferramenta operou, em uma linha: o caminho do read_file, o comando do
 * execute_pwsh, a query do grep_search. Despejar `args` inteiro seria o ruido
 * bruto que nao queremos; sem nada, "Read File" repetido 145x nao diz nada.
 */
function kiroTarget(args) {
  if (!args || typeof args !== "object") return null;
  for (const key of KIRO_ARG_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.slice(0, 300);
    if (Array.isArray(value) && value.every((v) => typeof v === "string") && value.length)
      return value.join(", ").slice(0, 300);
  }
  return null;
}

/**
 * Indice `toolCallId -> payload do tool_call` do arquivo INTEIRO.
 *
 * O `tool_result` do Kiro NAO carrega o nome da ferramenta — so `toolCallId`,
 * `content` e `success`. Quem sabe o que foi chamado e o `tool_call`, que veio
 * antes. Indexar o arquivo todo (e nao so as linhas novas do tick) e o que
 * garante a associacao mesmo quando a chamada foi lida num tick anterior: sem
 * isso o resultado chegaria orfao, sem dizer de que interacao ele e.
 */
function kiroToolCalls(lines) {
  const index = new Map();
  for (const line of lines) {
    // Filtro barato antes do JSON.parse: o arquivo inteiro passa aqui a cada tick.
    if (!line.includes('"tool_call"')) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = obj?.payload;
    if (payload?.type === "tool_call" && typeof payload.toolCallId === "string") {
      index.set(payload.toolCallId, payload);
    }
  }
  return index;
}
