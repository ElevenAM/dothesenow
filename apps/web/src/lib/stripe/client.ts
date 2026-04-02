import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazily initialized Stripe client.
 * Avoids crashing at module-load time if STRIPE_SECRET_KEY is unavailable
 * (e.g. during Next.js static page collection at build time).
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}
