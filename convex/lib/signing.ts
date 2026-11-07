/**
 * HMAC-SHA256 request signing shared by both directions of the n8n integration.
 *
 *   signature = hex(HMAC_SHA256(secret, `${timestamp}.${body}`))
 *   headers:   X-LendLoop-Timestamp: <unix seconds>
 *              X-LendLoop-Signature: v1=<signature>
 *
 * The timestamp is part of the signed material and must be recent, which limits
 * replay of captured requests. Each direction uses its own secret.
 */

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signPayload(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<{ timestamp: string; signature: string }> {
  const ts = String(timestamp);
  return { timestamp: ts, signature: `v1=${await hmacHex(secret, `${ts}.${body}`)}` };
}

/** Constant-time string comparison (avoids leaking how many bytes matched). */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifySignature(
  secret: string,
  body: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing signature headers" };
  if (!/^\d{1,12}$/.test(timestampHeader)) return { ok: false, reason: "bad timestamp" };
  const ts = Number(timestampHeader);
  if (Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = `v1=${await hmacHex(secret, `${timestampHeader}.${body}`)}`;
  return timingSafeEqual(expected, signatureHeader) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
