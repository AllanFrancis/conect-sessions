-- Pareamento temporario e telemetria de instalacao.
-- A credencial permanente continua armazenada somente como SHA-256 em agents.

alter table public.agents
  add column revoked_at timestamptz,
  add column installed_at timestamptz,
  add column agent_version text,
  add column platform text,
  add column plugin_status text,
  add column install_error text,
  add column updated_at timestamptz not null default now();

alter table public.agents
  add constraint agents_plugin_status_check
  check (plugin_status is null or plugin_status in ('unknown', 'ready', 'attention'));

create table public.agent_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null check (char_length(agent_name) between 1 and 80),
  code_hash text not null unique check (char_length(code_hash) = 64),
  target_agent_id uuid references public.agents(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '10 minutes')
);

create index agent_pairing_codes_user_pending_idx
  on public.agent_pairing_codes (user_id, created_at desc)
  where consumed_at is null;

create index agent_pairing_codes_user_id_idx
  on public.agent_pairing_codes (user_id);

create unique index agent_pairing_codes_one_pending_target_idx
  on public.agent_pairing_codes (target_agent_id)
  where consumed_at is null and target_agent_id is not null;

create unique index agent_pairing_codes_one_pending_new_name_idx
  on public.agent_pairing_codes (user_id, lower(agent_name))
  where consumed_at is null and target_agent_id is null;

create index agent_pairing_codes_target_agent_idx
  on public.agent_pairing_codes (target_agent_id)
  where target_agent_id is not null;

create index agent_pairing_codes_agent_idx
  on public.agent_pairing_codes (agent_id)
  where agent_id is not null;

alter table public.agent_pairing_codes enable row level security;

revoke all on table public.agent_pairing_codes from public, anon;
grant select, delete on table public.agent_pairing_codes to authenticated;
grant all on table public.agent_pairing_codes to service_role;

create policy "own pairing codes select"
  on public.agent_pairing_codes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own pairing codes delete"
  on public.agent_pairing_codes for delete
  to authenticated
  using ((select auth.uid()) = user_id and consumed_at is null);

create or replace function public.create_agent_pairing(
  p_agent_name text,
  p_code_hash text,
  p_target_agent_id uuid default null
)
returns table (pairing_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_pairing_id uuid;
  v_expires_at timestamptz;
  v_lock_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'PAIRING_AUTH_REQUIRED';
  end if;

  if char_length(trim(p_agent_name)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'PAIRING_NAME_INVALID';
  end if;

  if p_target_agent_id is not null and not exists (
    select 1 from public.agents
     where id = p_target_agent_id and user_id = v_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'PAIRING_TARGET_INVALID';
  end if;

  v_lock_key := v_user_id::text || ':' || coalesce(
    p_target_agent_id::text,
    'new:' || lower(trim(p_agent_name))
  );
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  if p_target_agent_id is not null then
    delete from public.agent_pairing_codes
     where user_id = v_user_id
       and target_agent_id = p_target_agent_id
       and consumed_at is null;
  else
    delete from public.agent_pairing_codes
     where user_id = v_user_id
       and target_agent_id is null
       and lower(agent_name) = lower(trim(p_agent_name))
       and consumed_at is null;
  end if;

  insert into public.agent_pairing_codes (
    user_id, agent_name, code_hash, target_agent_id, expires_at
  ) values (
    v_user_id, trim(p_agent_name), p_code_hash, p_target_agent_id, now() + interval '10 minutes'
  )
  returning id, agent_pairing_codes.expires_at into v_pairing_id, v_expires_at;

  return query select v_pairing_id, v_expires_at;
end;
$$;

revoke execute on function public.create_agent_pairing(text, text, uuid)
  from public, anon;
grant execute on function public.create_agent_pairing(text, text, uuid)
  to authenticated, service_role;

create or replace function public.consume_agent_pairing(
  p_code_hash text,
  p_token_hash text,
  p_token_prefix text,
  p_version text default null,
  p_platform text default 'windows-x64'
)
returns table (agent_id uuid, pairing_id uuid, repaired boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pairing public.agent_pairing_codes%rowtype;
  v_agent_id uuid;
  v_repaired boolean;
begin
  select *
    into v_pairing
    from public.agent_pairing_codes
   where code_hash = p_code_hash
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAIRING_NOT_FOUND';
  end if;

  if v_pairing.consumed_at is not null then
    raise exception using errcode = 'P0001', message = 'PAIRING_CONSUMED';
  end if;

  if v_pairing.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'PAIRING_EXPIRED';
  end if;

  v_repaired := v_pairing.target_agent_id is not null;

  if v_repaired then
    update public.agents
       set token_hash = p_token_hash,
           token_prefix = p_token_prefix,
           revoked_at = null,
           installed_at = now(),
           agent_version = nullif(p_version, ''),
           platform = nullif(p_platform, ''),
           plugin_status = 'unknown',
           install_error = null,
           updated_at = now()
     where id = v_pairing.target_agent_id
       and user_id = v_pairing.user_id
     returning id into v_agent_id;

    if v_agent_id is null then
      raise exception using errcode = 'P0001', message = 'PAIRING_TARGET_INVALID';
    end if;
  else
    insert into public.agents (
      user_id, name, token_hash, token_prefix, installed_at,
      agent_version, platform, plugin_status, updated_at
    ) values (
      v_pairing.user_id, v_pairing.agent_name, p_token_hash, p_token_prefix, now(),
      nullif(p_version, ''), nullif(p_platform, ''), 'unknown', now()
    ) returning id into v_agent_id;
  end if;

  update public.agent_pairing_codes
     set consumed_at = now(), agent_id = v_agent_id
   where id = v_pairing.id;

  return query select v_agent_id, v_pairing.id, v_repaired;
end;
$$;

revoke execute on function public.consume_agent_pairing(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_agent_pairing(text, text, text, text, text)
  to service_role;
