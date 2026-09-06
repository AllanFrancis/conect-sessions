import { describe, expect, test } from "bun:test";
import { handleAgentPair, type ConsumePairingArgs } from "../../src/lib/agent-pairing-api";
import {
  buildAgentTelemetryUpdate,
  parseAgentSyncRequest,
  requireAgentAccess,
} from "../../src/lib/agent-sync-api";

const code = "a".repeat(64);

function pairingRequest(body: unknown) {
  return new Request("https://example.test/api/public/agent/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/agent/pair", () => {
  test("exchanges a code without echoing it or its hash", async () => {
    let received: ConsumePairingArgs | undefined;
    const response = await handleAgentPair(
      pairingRequest({ code, version: "1.2.3" }),
      async (args) => {
        received = args;
        return {
          data: [{ agent_id: "agent-1", repaired: false }],
          error: null,
        };
      },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.token).toMatch(/^lrc_[0-9a-f]{48}$/);
    expect(body).toMatchObject({
      agentId: "agent-1",
      repaired: false,
      apiUrl: "https://example.test",
    });
    expect(JSON.stringify(body)).not.toContain(code);
    expect(received?.p_code_hash).not.toBe(code);
    expect(received?.p_version).toBe("1.2.3");
  });

  test.each([
    ["PAIRING_EXPIRED", 410],
    ["PAIRING_CONSUMED", 409],
  ])("maps %s to HTTP %d", async (message, status) => {
    const response = await handleAgentPair(pairingRequest({ code }), async () => ({
      data: null,
      error: { message },
    }));
    expect(response.status).toBe(status);
  });
});

function syncRequest(body: unknown) {
  return new Request("https://example.test/api/public/agent/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const legacyPayload = {
  token: "lrc_legacy_token",
  session: { external_id: "claude-code:123", source: "claude-code" },
  messages: [],
};

describe("POST /api/public/agent/sync contract", () => {
  test("accepts the legacy payload without installer telemetry", async () => {
    const result = await parseAgentSyncRequest(syncRequest(legacyPayload));
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.agent).toBeUndefined();
      expect(result.data.session.status).toBe("unknown");
    }
  });

  test("returns 403 for a revoked machine", async () => {
    const access = requireAgentAccess({ revoked_at: "2026-09-05T23:00:00.000Z" });
    if (!("response" in access)) throw new Error("revoked agent should be blocked");
    expect(access.response.status).toBe(403);
    expect(await access.response.json()).toEqual({ error: "Máquina revogada" });
  });

  test("persists optional telemetry and permits clearing install_error", async () => {
    const result = await parseAgentSyncRequest(
      syncRequest({
        ...legacyPayload,
        agent: {
          version: "1.2.3",
          platform: "windows-x64",
          plugin_status: "ready",
          install_error: null,
        },
      }),
    );
    if (!("data" in result)) throw new Error("payload should be valid");
    expect(buildAgentTelemetryUpdate(result.data.agent, "2026-09-05T23:00:00.000Z")).toEqual({
      last_seen_at: "2026-09-05T23:00:00.000Z",
      updated_at: "2026-09-05T23:00:00.000Z",
      agent_version: "1.2.3",
      platform: "windows-x64",
      plugin_status: "ready",
      install_error: null,
    });
  });
});
