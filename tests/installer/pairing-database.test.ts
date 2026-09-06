import { afterEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260906030510_agent_pairing.sql"),
  "utf8",
);

const databases: PGlite[] = [];

async function database() {
  const db = new PGlite();
  databases.push(db);
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
  await db.exec(migration);
  return db;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});

describe("agent pairing database", () => {
  test("anon has no table privilege even before RLS is considered", async () => {
    const db = await database();
    await db.exec("set role anon");
    await expect(db.query("select * from public.agent_pairing_codes")).rejects.toThrow(
      /permission denied/i,
    );
    await db.exec("reset role");
  });

  test("RLS hides another user's pending pairing", async () => {
    const db = await database();
    const userA = "10000000-0000-4000-8000-000000000001";
    const userB = "20000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users(id) values ($1), ($2)", [userA, userB]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${userA}', false);`,
    );
    await db.query("select * from public.create_agent_pairing($1, $2, null)", [
      "Notebook",
      "a".repeat(64),
    ]);
    await db.exec(`select set_config('request.jwt.claim.sub', '${userB}', false);`);
    const hidden = await db.query<{ count: string }>(
      "select count(*)::text as count from public.agent_pairing_codes",
    );
    expect(hidden.rows[0]?.count).toBe("0");
    await db.exec("reset role");
  });

  test("authenticated clients cannot choose an arbitrary TTL by inserting directly", async () => {
    const db = await database();
    const userId = "90000000-0000-4000-8000-000000000009";
    await db.query("insert into auth.users(id) values ($1)", [userId]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`,
    );
    await expect(
      db.query(
        `insert into public.agent_pairing_codes(
           user_id, agent_name, code_hash, created_at, expires_at
         ) values ($1, 'Unsafe', $2, now() + interval '1 year', now() + interval '1 year 10 minutes')`,
        [userId, "9".repeat(64)],
      ),
    ).rejects.toThrow(/permission denied/i);
    await db.exec("reset role");
  });

  test("allows only one consumption of a pairing code", async () => {
    const db = await database();
    const userId = "30000000-0000-4000-8000-000000000003";
    const codeHash = "b".repeat(64);
    await db.query("insert into auth.users(id) values ($1)", [userId]);
    await db.query(
      `insert into public.agent_pairing_codes(user_id, agent_name, code_hash, expires_at)
       values ($1, 'Desktop', $2, now() + interval '10 minutes')`,
      [userId, codeHash],
    );
    await db.exec("set role service_role");
    const exchange = (tokenSeed: string) =>
      db.query("select * from public.consume_agent_pairing($1, $2, $3, $4, $5)", [
        codeHash,
        tokenSeed.repeat(64),
        `lrc_${tokenSeed.repeat(8)}`,
        "1.0.0",
        "windows-x64",
      ]);
    await exchange("c");
    await expect(exchange("d")).rejects.toThrow("PAIRING_CONSUMED");
    const agents = await db.query<{ count: string }>(
      "select count(*)::text as count from public.agents",
    );
    expect(agents.rows[0]?.count).toBe("1");
    await db.exec("reset role");
  });

  test("atomically replaces a pending code for the same machine name", async () => {
    const db = await database();
    const userId = "70000000-0000-4000-8000-000000000007";
    await db.query("insert into auth.users(id) values ($1)", [userId]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`,
    );
    const create = (hash: string) =>
      db.query("select * from public.create_agent_pairing($1, $2, null)", ["Desktop", hash]);
    await create("7".repeat(64));
    await create("8".repeat(64));
    const pending = await db.query<{ code_hash: string }>(
      "select code_hash from public.agent_pairing_codes where consumed_at is null",
    );
    expect(pending.rows).toEqual([{ code_hash: "8".repeat(64) }]);
    const ttl = await db.query<{ seconds: number }>(
      "select extract(epoch from (expires_at - created_at))::float8 as seconds from public.agent_pairing_codes",
    );
    expect(ttl.rows[0]?.seconds).toBe(600);
    await db.exec("reset role");
  });

  test("expired pairing cannot create an agent", async () => {
    const db = await database();
    const userId = "60000000-0000-4000-8000-000000000006";
    await db.query("insert into auth.users(id) values ($1)", [userId]);
    await db.query(
      `insert into public.agent_pairing_codes(user_id, agent_name, code_hash, created_at, expires_at)
       values ($1, 'Expired', $2, now() - interval '10 minutes', now() - interval '1 second')`,
      [userId, "2".repeat(64)],
    );
    await db.exec("set role service_role");
    await expect(
      db.query("select * from public.consume_agent_pairing($1, $2, $3, $4, $5)", [
        "2".repeat(64),
        "3".repeat(64),
        "lrc_33333333",
        "1.0.0",
        "windows-x64",
      ]),
    ).rejects.toThrow("PAIRING_EXPIRED");
    const agents = await db.query<{ count: string }>(
      "select count(*)::text as count from public.agents",
    );
    expect(agents.rows[0]?.count).toBe("0");
    await db.exec("reset role");
  });

  test("repair rotates the same agent and revocation remains soft", async () => {
    const db = await database();
    const userId = "40000000-0000-4000-8000-000000000004";
    const agentId = "50000000-0000-4000-8000-000000000005";
    await db.query("insert into auth.users(id) values ($1)", [userId]);
    await db.query(
      `insert into public.agents(id, user_id, name, token_hash, token_prefix, revoked_at)
       values ($1, $2, 'PC', $3, 'lrc_old', now())`,
      [agentId, userId, "e".repeat(64)],
    );
    await db.query(
      `insert into public.agent_pairing_codes(user_id, agent_name, code_hash, target_agent_id, expires_at)
       values ($1, 'PC', $2, $3, now() + interval '10 minutes')`,
      [userId, "f".repeat(64), agentId],
    );
    await db.exec("set role service_role");
    const result = await db.query<{ agent_id: string; repaired: boolean }>(
      "select agent_id, repaired from public.consume_agent_pairing($1, $2, $3, $4, $5)",
      ["f".repeat(64), "1".repeat(64), "lrc_new", "1.1.0", "windows-x64"],
    );
    expect(result.rows[0]).toEqual({ agent_id: agentId, repaired: true });
    const row = await db.query<{ token_prefix: string; revoked_at: string | null }>(
      "select token_prefix, revoked_at from public.agents where id = $1",
      [agentId],
    );
    expect(row.rows[0]).toEqual({ token_prefix: "lrc_new", revoked_at: null });
    await db.exec("reset role");
  });
});
