-- Estrutura que não cabe em `content`: hoje a pergunta de escolha do Claude
-- Code (`AskUserQuestion`), que carrega enunciado e opções, e o `tool_result`
-- que prova qual opção foi escolhida.
--
-- Nullable e sem default de propósito: mensagem antiga e agente não atualizado
-- continuam gravando só `content`, e a UI trata `meta` ausente como o normal.
-- Sem índice: a leitura é sempre pela sessão inteira, já coberta por
-- messages_session_created_idx.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS meta JSONB;

COMMENT ON COLUMN public.messages.meta IS
  'Payload estruturado da mensagem. Chaves: ask (questions do AskUserQuestion), '
  'tool_use_id (id da pergunta), answers_tool_use_id (id da pergunta que esta '
  'mensagem responde).';
