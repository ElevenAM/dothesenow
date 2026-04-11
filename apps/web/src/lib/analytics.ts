import posthog from "posthog-js";
import { PostHog } from "posthog-node";

// ---------------------------------------------------------------------------
// Client-side (browser) — uses posthog-js
// ---------------------------------------------------------------------------

let clientInitialized = false;

function ensureClientInit() {
  if (
    clientInitialized ||
    typeof window === "undefined" ||
    !process.env.NEXT_PUBLIC_POSTHOG_KEY
  ) {
    return;
  }

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false, // We handle this manually in the provider
    capture_pageleave: true,
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") {
        ph.debug();
      }
    },
  });

  clientInitialized = true;
}

export function getPostHogClient() {
  ensureClientInit();
  return posthog;
}

export const analytics = {
  track(event: string, properties?: Record<string, unknown>) {
    ensureClientInit();
    posthog.capture(event, properties);
  },

  identify(
    userId: string,
    traits?: Record<string, unknown>,
  ) {
    ensureClientInit();
    posthog.identify(userId, traits);
  },

  group(groupType: string, groupKey: string, traits?: Record<string, unknown>) {
    ensureClientInit();
    posthog.group(groupType, groupKey, traits);
  },

  reset() {
    ensureClientInit();
    posthog.reset();
  },
};

// ---------------------------------------------------------------------------
// Server-side — uses posthog-node
// ---------------------------------------------------------------------------

let serverClient: PostHog | null = null;

function getServerClient(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;

  if (!serverClient) {
    serverClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      // Serverless: send each event immediately (no batching)
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return serverClient;
}

/**
 * Track an event from server-side code (server actions, API routes).
 * Catches all errors internally — analytics never breaks business logic.
 */
export function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
) {
  try {
    const client = getServerClient();
    if (!client) return;
    client.capture({
      distinctId,
      event,
      properties,
    });
  } catch (err) {
    console.error("[analytics] trackServerEvent failed:", err);
  }
}
