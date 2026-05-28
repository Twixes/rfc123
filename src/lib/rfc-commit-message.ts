import { generateTextWithTelemetry } from "@/lib/ai";
import { formatUnifiedDiff } from "@/lib/unified-diff";

const FALLBACK_MESSAGE = "Update RFC";
export const MAX_COMMIT_MESSAGE_BYTES = 1024;
const MAX_PREVIOUS_BODY_CHARS = 8_000;

export type GenerateRfcCommitMessageInput = {
  previousBody: string;
  body: string;
  /** Markdown file path for diff headers, when known. */
  markdownFilePath?: string;
  githubLogin?: string;
};

/**
 * Produces a short git commit message for an RFC body edit. Uses the shared
 * model (see `@/lib/ai`) when OPENAI_API_KEY is set; else a generic fallback.
 */
export async function generateRfcCommitMessage(
  input: GenerateRfcCommitMessageInput,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return FALLBACK_MESSAGE;
  }

  const diff = formatUnifiedDiff(input.previousBody, input.body, {
    path: input.markdownFilePath?.split("/").pop(),
  });
  const previousExcerpt = input.previousBody.slice(0, MAX_PREVIOUS_BODY_CHARS);

  try {
    const text = await generateTextWithTelemetry({
      functionId: "rfc-commit-message",
      githubLogin: input.githubLogin,
      system:
        "You write very short git commit messages for RFC (markdown) edits. One line only. Imperative mood (e.g. 'Add auth section', 'Clarify rollout timeline'). No quotes, no period at the end. Never invent changes not shown in the diff.",
      prompt: `Write a single-line git commit message (max 72 characters) summarizing this RFC edit.

Previous RFC body (excerpt):
"""
${previousExcerpt}
"""

Unified diff (before → after):
"""
${diff}
"""

Reply with only the commit message, nothing else.`,
    });

    const message = sanitizeCommitMessage(text);
    return message.length > 0 ? message : FALLBACK_MESSAGE;
  } catch (error) {
    console.error("Error generating RFC commit message:", error);
    return FALLBACK_MESSAGE;
  }
}

function sanitizeCommitMessage(raw: string): string {
  const firstLine = raw
    .trim()
    .split("\n")[0]
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!firstLine) return "";

  const bytes = Buffer.byteLength(firstLine, "utf-8");
  if (bytes <= MAX_COMMIT_MESSAGE_BYTES) return firstLine;

  // Truncate on UTF-8 byte boundary.
  let end = firstLine.length;
  while (
    end > 0 &&
    Buffer.byteLength(firstLine.slice(0, end), "utf-8") >
      MAX_COMMIT_MESSAGE_BYTES
  ) {
    end--;
  }
  return firstLine.slice(0, end).trim();
}
