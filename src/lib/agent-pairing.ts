export const PAIRING_TTL_MS = 10 * 60 * 1000;

export function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createAgentToken(): string {
  return `lrc_${randomHex(24)}`;
}

export function pairingExpiresAt(now = Date.now()): string {
  return new Date(now + PAIRING_TTL_MS).toISOString();
}
