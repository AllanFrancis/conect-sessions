CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own agents" ON public.agents FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  title TEXT NOT NULL DEFAULT 'Sessão',
  cwd TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX sessions_user_activity_idx ON public.sessions (user_id, last_activity_at DESC);

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  external_id TEXT,
  role TEXT NOT NULL DEFAULT 'assistant',
  content TEXT NOT NULL DEFAULT '',
  seq INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX messages_session_created_idx ON public.messages (session_id, created_at);

CREATE TABLE public.replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replies TO authenticated;
GRANT ALL ON public.replies TO service_role;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replies" ON public.replies FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replies_session_status_idx ON public.replies (session_id, status, created_at);