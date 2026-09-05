-- Uma sessão de IA aparecia mais de uma vez no painel porque a unicidade era
-- por (agent_id, external_id). Duas cópias do agente na mesma máquina, com
-- tokens diferentes, criavam duas linhas para a MESMA sessão — medido em
-- 2026-09-05: 12 external_id duplicados, sempre entre agentes distintos do
-- mesmo usuário, nunca dentro do mesmo agente.
--
-- A chave certa é (user_id, external_id): trata o caso medido e preserva o que
-- deve continuar separado — o mesmo id nativo sob usuários diferentes é sessão
-- de outra pessoa, não duplicata (existe hoje: kiro:sess_169703b9-...).

begin;

-- 1) Eleger o sobrevivente de cada grupo: o mais antigo.
create temporary table lrc_consolidacao on commit drop as
select
  s.id,
  first_value(s.id) over (
    partition by s.user_id, s.external_id order by s.created_at, s.id
  ) as vencedor
from public.sessions s;

-- 2) Mover mensagens para o sobrevivente, pulando as que ele já tem.
--    `messages` tem UNIQUE (session_id, external_id): sem o NOT EXISTS o UPDATE
--    quebraria na primeira mensagem repetida — e elas são todas repetidas, as
--    duas metades medidas tinham conjuntos idênticos.
update public.messages m
set session_id = c.vencedor
from lrc_consolidacao c
where m.session_id = c.id
  and c.id <> c.vencedor
  and not exists (
    select 1 from public.messages j
    where j.session_id = c.vencedor
      and j.external_id is not distinct from m.external_id
  );

-- 3) Respostas seguem a sessão sobrevivente. Não têm chave única por conteúdo,
--    então movem todas: perder uma resposta pendente seria perder uma fala do
--    usuário que o painel já disse ter enviado.
update public.replies r
set session_id = c.vencedor
from lrc_consolidacao c
where r.session_id = c.id and c.id <> c.vencedor;

-- 4) Agora as perdedoras só têm cópias do que o sobrevivente já tem.
delete from public.sessions s
using lrc_consolidacao c
where s.id = c.id and c.id <> c.vencedor;

-- 5) A chave nova. A antiga sai depois da consolidação, nunca antes.
alter table public.sessions drop constraint if exists sessions_agent_id_external_id_key;
alter table public.sessions add constraint sessions_user_id_external_id_key unique (user_id, external_id);

-- O agent_id continua na linha (por qual agente a sessão entrou é informação),
-- mas deixou de participar da identidade. O índice mantém baratas as consultas
-- que filtravam pela constraint antiga.
create index if not exists sessions_agent_id_idx on public.sessions (agent_id);

commit;
