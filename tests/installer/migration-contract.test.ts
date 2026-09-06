import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260906030510_agent_pairing.sql"),
  "utf8",
).toLowerCase();

describe("agent pairing migration contract", () => {
  test("isolates pairing rows with RLS and explicit grants", () => {
    expect(migration).toContain("alter table public.agent_pairing_codes enable row level security");
    expect(migration).toContain(
      "grant select, delete on table public.agent_pairing_codes to authenticated",
    );
    expect(migration).toContain("(select auth.uid()) = user_id");
    expect(migration).toContain("revoke all on table public.agent_pairing_codes from public, anon");
  });

  test("serializes replacement and enforces one pending code per destination", () => {
    expect(migration).toContain("create or replace function public.create_agent_pairing");
    expect(migration).toContain("security definer");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("agent_pairing_codes_one_pending_target_idx");
    expect(migration).toContain("agent_pairing_codes_one_pending_new_name_idx");
    expect(migration).toContain("delete from public.agent_pairing_codes");
    expect(migration).toContain("now() + interval '10 minutes'");
    expect(migration).not.toContain("p_expires_at");
    expect(migration).not.toMatch(/grant\s+[^;]*insert[^;]*agent_pairing_codes[^;]*authenticated/);
  });

  test("serializes and marks one-time consumption in one function", () => {
    const functionBody = migration.slice(migration.indexOf("create or replace function"));
    expect(functionBody).toContain("for update");
    expect(functionBody).toContain("pairing_consumed");
    expect(functionBody).toContain("pairing_expired");
    expect(functionBody).toContain("set consumed_at = now(), agent_id = v_agent_id");
  });

  test("limits the exchange RPC to the server role", () => {
    expect(migration).toContain(
      "revoke execute on function public.consume_agent_pairing(text, text, text, text, text)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("security invoker");
  });

  test("revocation is soft and does not cascade session history", () => {
    expect(migration).toContain("add column revoked_at timestamptz");
    expect(migration).not.toMatch(/delete\s+from\s+public\.agents/);
  });
});
