import { afterEach, describe, expect, test } from "bun:test";
import { actAs, closePairingDatabases, createPairingDatabase } from "../support/pairing-db";

/*
 * As políticas do banco que sustentam o cancelamento do código pendente.
 *
 * Não é o `discardPendingCode` da rota que está sob teste aqui — ele é código de
 * componente e roda no navegador. O que estes testes fixam é o que o banco
 * permite e o que ele NÃO faz sozinho: a política de DELETE que torna o
 * cancelamento possível, e o fato de a RPC substituir apenas o código do MESMO
 * nome ou do mesmo alvo, que é a razão de a interface precisar cancelar.
 */

const userA = "aa000000-0000-4000-8000-00000000000a";
const userB = "bb000000-0000-4000-8000-00000000000b";

afterEach(closePairingDatabases);

async function pendingCodes(db: Awaited<ReturnType<typeof createPairingDatabase>>) {
  const { rows } = await db.query<{ agent_name: string }>(
    "select agent_name from public.agent_pairing_codes where consumed_at is null order by agent_name",
  );
  return rows.map((row) => row.agent_name);
}

describe("o que o banco garante sobre código pendente", () => {
  test("a RPC não substitui o código de OUTRA máquina — por isso o painel cancela", async () => {
    const db = await createPairingDatabase();
    await db.query("insert into auth.users(id) values ($1)", [userA]);
    await actAs(db, userA);
    await db.query("select * from public.create_agent_pairing($1, $2, null)", [
      "Notebook",
      "1".repeat(64),
    ]);
    await db.query("select * from public.create_agent_pairing($1, $2, null)", [
      "Desktop",
      "2".repeat(64),
    ]);
    // Dois códigos válidos ao mesmo tempo: o do "Notebook" seguiria vivo por
    // dez minutos sem nada na interface para mostrá-lo ou revogá-lo.
    expect(await pendingCodes(db)).toEqual(["Desktop", "Notebook"]);
    await db.exec("reset role");
  });

  test("o dono apaga o próprio código pendente, que é o que o cancelamento faz", async () => {
    const db = await createPairingDatabase();
    await db.query("insert into auth.users(id) values ($1)", [userA]);
    await actAs(db, userA);
    const { rows } = await db.query<{ pairing_id: string }>(
      "select pairing_id from public.create_agent_pairing($1, $2, null)",
      ["Notebook", "3".repeat(64)],
    );
    await db.query("delete from public.agent_pairing_codes where id = $1", [rows[0]!.pairing_id]);
    expect(await pendingCodes(db)).toEqual([]);
    await db.exec("reset role");
  });

  test("ninguém cancela o código de outra conta", async () => {
    const db = await createPairingDatabase();
    await db.query("insert into auth.users(id) values ($1), ($2)", [userA, userB]);
    await actAs(db, userA);
    await db.query("select * from public.create_agent_pairing($1, $2, null)", [
      "Notebook",
      "4".repeat(64),
    ]);
    await actAs(db, userB);
    await db.query("delete from public.agent_pairing_codes");
    await actAs(db, userA);
    expect(await pendingCodes(db)).toEqual(["Notebook"]);
    await db.exec("reset role");
  });

  test("código já consumido não some do histórico ao cancelar", async () => {
    const db = await createPairingDatabase();
    await db.query("insert into auth.users(id) values ($1)", [userA]);
    await actAs(db, userA);
    await db.query("select * from public.create_agent_pairing($1, $2, null)", [
      "Notebook",
      "5".repeat(64),
    ]);
    await db.exec("reset role");
    await db.exec("set role service_role");
    await db.query("select * from public.consume_agent_pairing($1, $2, $3, $4, $5)", [
      "5".repeat(64),
      "6".repeat(64),
      "lrc_novo",
      "0.1.0",
      "windows-x64",
    ]);
    await db.exec("reset role");

    await actAs(db, userA);
    await db.query("delete from public.agent_pairing_codes");
    const { rows } = await db.query<{ total: string }>(
      "select count(*)::text as total from public.agent_pairing_codes where consumed_at is not null",
    );
    expect(rows[0]!.total).toBe("1");
    await db.exec("reset role");
  });
});

describe("a máquina que o painel acabou de mostrar", () => {
  test("pareamento consumido nasce com installed_at e sem heartbeat", async () => {
    const db = await createPairingDatabase();
    await db.query("insert into auth.users(id) values ($1)", [userA]);
    await actAs(db, userA);
    await db.query("select * from public.create_agent_pairing($1, $2, null)", [
      "Notebook",
      "7".repeat(64),
    ]);
    await db.exec("reset role");
    await db.exec("set role service_role");
    await db.query("select * from public.consume_agent_pairing($1, $2, $3, $4, $5)", [
      "7".repeat(64),
      "8".repeat(64),
      "lrc_novo",
      "0.1.0",
      "windows-x64",
    ]);
    // É esta linha que o cartão lê: installed_at preenchido, last_seen_at
    // ainda nulo. Sem o estado "aguardando instalação", uma instalação em
    // curso apareceria como problema.
    const { rows } = await db.query<{
      installed_at: string | null;
      last_seen_at: string | null;
      plugin_status: string | null;
    }>("select installed_at, last_seen_at, plugin_status from public.agents");
    expect(rows[0]!.installed_at).not.toBeNull();
    expect(rows[0]!.last_seen_at).toBeNull();
    expect(rows[0]!.plugin_status).toBe("unknown");
    await db.exec("reset role");
  });
});
