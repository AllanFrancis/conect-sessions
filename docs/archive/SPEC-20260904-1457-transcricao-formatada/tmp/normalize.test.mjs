import { normalize } from "./load-normalize.mjs";

const show = (name, obj) => console.log(name.padEnd(34), JSON.stringify(normalize(obj)));

// 1. Pergunta de escolha: SÓ tool_use, sem nenhum text. Antes virava null.
show("AskUserQuestion puro", {
  uuid: "u1",
  message: {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "toolu_01ABC",
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: "Qual abordagem?",
              header: "Approach",
              multiSelect: false,
              options: [
                { label: "Refatorar", description: "mais lento, mais limpo" },
                { label: "Patch", description: "rapido" },
              ],
            },
          ],
        },
      },
    ],
  },
});

// 2. Texto + pergunta na mesma mensagem: o texto sobrevive E a pergunta sai em meta.
show("texto + AskUserQuestion", {
  uuid: "u2",
  message: {
    role: "assistant",
    content: [
      { type: "text", text: "Achei dois caminhos." },
      { type: "tool_use", id: "toolu_02", name: "AskUserQuestion", input: { questions: [{ question: "Qual?", options: [{ label: "A" }, { label: "B" }] }] } },
    ],
  },
});

// 3. tool_result da resposta: o texto em ingles some, sobra o marcador.
show("tool_result de resposta", {
  uuid: "u3",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_01ABC",
        content: 'Your questions have been answered:\n"Qual abordagem?"="Refatorar"',
      },
    ],
  },
});

// 4. multiSelect: o CLI junta as escolhas por virgula.
show("tool_result multiSelect", {
  uuid: "u4",
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "toolu_09", content: 'Your questions have been answered:\n"Quais?"="A, B"' }],
  },
});

// 5. Regressao: mensagem de texto comum continua igual, e SEM meta.
show("texto simples (regressao)", { uuid: "u5", message: { role: "assistant", content: [{ type: "text", text: "Deploy ok." }] } });
show("content string (regressao)", { uuid: "u6", message: { role: "user", content: "roda os testes" } });

// 6. tool_use que NAO e AskUserQuestion continua invisivel (fora de escopo).
show("tool_use Bash -> null", {
  uuid: "u7",
  message: { role: "assistant", content: [{ type: "tool_use", id: "t9", name: "Bash", input: { command: "ls" } }] },
});

// 7. Lixo continua null.
show("vazio -> null", { uuid: "u8", message: { role: "assistant", content: [] } });
show("nao-objeto -> null", null);
