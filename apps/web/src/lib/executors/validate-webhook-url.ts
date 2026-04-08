/**
 * Reject URLs pointing to private/internal addresses to prevent SSRF.
 * Extracted from dispatch.ts for reuse by webhook-type executors.
 */
export function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid webhook URL: ${url}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Webhook URL must use http or https: ${url}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    throw new Error(`Webhook URL must not point to localhost: ${url}`);
  }

  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 127
    ) {
      throw new Error(`Webhook URL must not point to a private address: ${url}`);
    }
  }

  if (hostname === "metadata.google.internal" || hostname === "metadata.google") {
    throw new Error(`Webhook URL must not point to cloud metadata: ${url}`);
  }
}
