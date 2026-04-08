/**
 * Shared markdown parsing utilities for strategy documents.
 */

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a ## section from markdown content by name.
 * Returns the full section text from the heading to just before the next ## heading (not ###).
 * Returns null if the section is not found.
 */
export function extractSection(
  content: string,
  sectionName: string,
): string | null {
  const escaped = escapeRegex(sectionName);
  // Try matching up to the next ## heading (not ###)
  const withNext = new RegExp(
    `^##\\s+${escaped}[\\s\\S]*?(?=\\n##\\s+(?!#))`,
    "m",
  );
  let match = content.match(withNext);
  if (match) return match[0];
  // Last section: match from heading to end of string (greedy)
  const toEnd = new RegExp(`^##\\s+${escaped}[\\s\\S]*`, "m");
  match = content.match(toEnd);
  return match ? match[0] : null;
}
