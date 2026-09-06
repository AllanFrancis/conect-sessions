import { describe, expect, test } from "bun:test";
import {
  PAIRING_TTL_MS,
  createAgentToken,
  pairingExpiresAt,
  randomHex,
  sha256Hex,
} from "../../src/lib/agent-pairing";

describe("agent pairing secrets", () => {
  test("creates independent 256-bit one-time codes", () => {
    const first = randomHex();
    const second = randomHex();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  test("stores deterministic SHA-256 instead of the code", async () => {
    const code = "a".repeat(64);
    const hash = await sha256Hex(code);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(code);
    expect(hash).toBe(await sha256Hex(code));
  });

  test("expires after exactly ten minutes", () => {
    const now = Date.parse("2026-09-05T20:00:00.000Z");
    expect(Date.parse(pairingExpiresAt(now)) - now).toBe(PAIRING_TTL_MS);
  });

  test("permanent agent tokens retain the existing protocol", () => {
    const token = createAgentToken();
    expect(token).toMatch(/^lrc_[0-9a-f]{48}$/);
  });
});
