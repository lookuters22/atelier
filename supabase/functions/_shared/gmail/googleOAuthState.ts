/**
 * Signed OAuth state for Google callback — embeds photographer_id without trusting the client body.
 */
const textEncoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type GoogleOAuthStatePayload = {
  v: 1;
  photographerId: string;
  exp: number;
  nonce: string;
};

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signGoogleOAuthState(
  payload: GoogleOAuthStatePayload,
  secret: string,
): Promise<string> {
  const body = JSON.stringify(payload);
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(body));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${base64UrlEncode(textEncoder.encode(body))}.${sigB64}`;
}

export async function verifyGoogleOAuthState(
  state: string,
  secret: string,
): Promise<GoogleOAuthStatePayload | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  let bodyBytes: Uint8Array;
  try {
    bodyBytes = base64UrlDecode(payloadB64);
  } catch {
    return null;
  }
  const body = new TextDecoder().decode(bodyBytes);
  const key = await importHmacKey(secret);
  let sig: Uint8Array;
  try {
    sig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", key, sig, bodyBytes);
  if (!ok) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1 || typeof o.photographerId !== "string" || typeof o.exp !== "number" || typeof o.nonce !== "string") {
    return null;
  }
  if (o.exp < Math.floor(Date.now() / 1000)) return null;
  return {
    v: 1,
    photographerId: o.photographerId,
    exp: o.exp,
    nonce: o.nonce,
  };
}
