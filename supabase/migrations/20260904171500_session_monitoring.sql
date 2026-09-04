-- Session monitoring: campos descobertos pelo monitor do agente local.
-- Tudo é anulável de propósito: o que não pode ser provado fica NULL em vez de
-- receber um valor inventado.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS ide TEXT,
  ADD COLUMN IF NOT EXISTS pid INTEGER,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detection_source TEXT,
  ADD COLUMN IF NOT EXISTS detection_confidence TEXT;

COMMENT ON COLUMN public.sessions.ide IS
  'IDE de origem provada pela cadeia de processos/lock (ex.: Visual Studio Code, Kiro). NULL = indeterminada.';
COMMENT ON COLUMN public.sessions.pid IS
  'PID do processo do agente, quando a sessão tem um processo próprio. NULL para agentes sem PID por sessão.';
COMMENT ON COLUMN public.sessions.started_at IS
  'Início relatado pelo próprio agente. NULL quando não registrado.';
COMMENT ON COLUMN public.sessions.ended_at IS
  'Fim conhecido ou estimado pela última observação viva. NULL quando o fim não é determinável.';
COMMENT ON COLUMN public.sessions.detection_source IS
  'Fontes que sustentaram a detecção, separadas por "+" (ex.: claude:pid-registry+claude:process+claude:ide-lock).';
COMMENT ON COLUMN public.sessions.detection_confidence IS
  'confirmed | inferred | unknown — quão sustentada por evidência está a linha.';

-- Consultas do painel: sessões vivas primeiro.
CREATE INDEX IF NOT EXISTS sessions_user_status_idx
  ON public.sessions (user_id, status, last_activity_at DESC);
