import { createTwoFilesPatch } from "diff";

const DEFAULT_PATH = "rfc.md";
/** Bail out of the (worst-case O(n·d)) line diff once an edit gets this big.
 *  The diff only feeds a commit-message summary, so a coarse fallback is fine
 *  for pathological full rewrites of large RFCs. */
const MAX_EDIT_LENGTH = 1500;

/**
 * Formats a git-style unified diff string for LLM prompts and logging using
 * jsdiff's `createTwoFilesPatch` (proper `@@` hunks + context windowing).
 * Truncates when `maxChars` is exceeded, and degrades to a coarse summary when
 * the change is too large to diff cheaply.
 */
export function formatUnifiedDiff(
  before: string,
  after: string,
  opts?: { path?: string; maxChars?: number },
): string {
  const path = opts?.path ?? DEFAULT_PATH;
  const maxChars = opts?.maxChars ?? 12_000;

  const patch = createTwoFilesPatch(
    `a/${path}`,
    `b/${path}`,
    before,
    after,
    undefined,
    undefined,
    { context: 3, maxEditLength: MAX_EDIT_LENGTH },
  );

  // `createTwoFilesPatch` returns undefined when `maxEditLength` is exceeded.
  if (patch == null) {
    const beforeLines = before ? before.split("\n").length : 0;
    const afterLines = after ? after.split("\n").length : 0;
    return `--- a/${path}\n+++ b/${path}\n(diff too large to compute precisely; ${beforeLines} lines before, ${afterLines} lines after)`;
  }

  let text = patch
    // Drop the leading "===…" index separator jsdiff prepends.
    .replace(/^=+\n/, "")
    .trimEnd();

  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n… (diff truncated)`;
  }
  return text;
}
