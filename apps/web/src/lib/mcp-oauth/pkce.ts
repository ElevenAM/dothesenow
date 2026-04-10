import { createHash, timingSafeEqual } from "crypto";

/**
 * Verify an OAuth 2.1 PKCE S256 code challenge.
 *
 * The client sends code_challenge = base64url(sha256(code_verifier)) during
 * authorization. At token exchange, the client sends code_verifier. We hash
 * the verifier and compare against the stored challenge.
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  storedChallenge: string,
): boolean {
  const computed = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Constant-time comparison to prevent timing attacks
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(storedChallenge);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
