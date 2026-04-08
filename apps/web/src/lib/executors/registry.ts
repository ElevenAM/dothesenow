import type {
  ExecutorDefinition,
  ExecutorMetadata,
  ExecutorCapability,
  OrgIntegration,
} from "@dothesenow/types";

import { claude } from "./builtin/claude";
import { n8n } from "./builtin/n8n";
import { jasper } from "./builtin/jasper";

// ─── Dispatchable executor definitions (server-only) ─────────

const EXECUTOR_DEFINITIONS = new Map<string, ExecutorDefinition>([
  [claude.type, claude],
  [n8n.type, n8n],
  [jasper.type, jasper],
]);

// ─── All executor metadata (serializable, safe for client) ───

const EXECUTOR_METADATA: ExecutorMetadata[] = [
  {
    type: "self",
    label: "Self / Teammate",
    category: "builtin",
    icon: "User",
    description: "Assigned to you or a team member for manual execution.",
    configSchema: [],
    capabilities: [],
  },
  extractMetadata(claude),
  extractMetadata(n8n),
  {
    type: "freelancer",
    label: "Freelancer",
    category: "builtin",
    icon: "Briefcase",
    description: "Post to the marketplace for freelancer execution.",
    configSchema: [],
    capabilities: [],
  },
  extractMetadata(jasper),
];

function extractMetadata(def: ExecutorDefinition): ExecutorMetadata {
  return {
    type: def.type,
    label: def.label,
    category: def.category,
    icon: def.icon,
    description: def.description,
    configSchema: def.configSchema,
    capabilities: def.capabilities,
  };
}

// ─── Public API ──────────────────────────────────────────────

/** Get a dispatchable executor by type. Returns undefined for self/freelancer. */
export function getExecutor(type: string): ExecutorDefinition | undefined {
  return EXECUTOR_DEFINITIONS.get(type);
}

/** All executor metadata including non-dispatchable types. Serializable. */
export function getAllExecutorMetadata(): ExecutorMetadata[] {
  return EXECUTOR_METADATA;
}

/** Filter to executors available for an org given its integrations. */
export function getAvailableExecutors(
  orgIntegrations: OrgIntegration[],
): ExecutorMetadata[] {
  return EXECUTOR_METADATA.filter((meta) => {
    const def = EXECUTOR_DEFINITIONS.get(meta.type);
    if (!def) return true; // self/freelancer always available
    return def.checkAvailability(orgIntegrations).available;
  });
}

/** Filter by capability. */
export function getExecutorsWithCapability(
  cap: ExecutorCapability,
): ExecutorMetadata[] {
  return EXECUTOR_METADATA.filter((meta) => meta.capabilities.includes(cap));
}

/** Availability map for the task form UI. */
export function getExecutorAvailability(
  orgIntegrations: OrgIntegration[],
): Record<string, { available: boolean; hint?: string }> {
  const result: Record<string, { available: boolean; hint?: string }> = {};

  for (const meta of EXECUTOR_METADATA) {
    const def = EXECUTOR_DEFINITIONS.get(meta.type);
    if (!def) {
      // self/freelancer — always available
      result[meta.type] = { available: true };
    } else {
      result[meta.type] = def.checkAvailability(orgIntegrations);
    }
  }

  return result;
}
