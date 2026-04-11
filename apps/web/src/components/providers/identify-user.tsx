"use client";

import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";

interface IdentifyUserProps {
  userId: string;
  email: string | null;
  orgId: string;
  orgName: string;
}

export function IdentifyUser({ userId, email, orgId, orgName }: IdentifyUserProps) {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;

    posthog.identify(userId, {
      email: email ?? undefined,
    });

    posthog.group("org", orgId, {
      name: orgName,
    });
  }, [posthog, userId, email, orgId, orgName]);

  return null;
}
