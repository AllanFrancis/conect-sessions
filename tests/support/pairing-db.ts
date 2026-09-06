import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Banco descartável com o mínimo que a migration de pareamento pressupõe:
 * os papéis do Supabase, `auth.uid()` e a tabela `agents` como ela era ANTES
 * da migration — é a própria migration que acrescenta as colunas novas.
 *
 * Vive fora de tests/installer porque o onboarding depende das mesmas
 * garantias: duas cópias deste bootstrap divergiriam da migration em silêncio,
 * e o teste continuaria verde provando um esquema que não existe.
 */

export const pairingMigration = readFileSync(
  resolve("supabase/migrations/20260906030510_agent_pairing.sql"),
  "utf8",
);

const open: PGlite[] = [];

export async function createPairingDatabase() {
  const db = new PGlite();
  open.push(db);
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.agents (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      name text not null,
      token_hash text not null unique,
      token_prefix text not null,
      last_seen_at timestamptz,
      created_at timestamptz not null default now()
    );
    grant select, insert, update, delete on public.agents to authenticated;
    grant all on public.agents to service_role;
    alter table public.agents enable row level security;
    create policy "own agents" on public.agents for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  `);
  await db.exec(pairingMigration);
  return db;
}

export async function closePairingDatabases() {
  await Promise.all(open.splice(0).map((db) => db.close()));
}

/** Entra no papel `authenticated` respondendo como o usuário informado. */
export async function actAs(db: PGlite, userId: string) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`,
  );
}
