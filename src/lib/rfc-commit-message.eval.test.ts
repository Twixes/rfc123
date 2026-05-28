import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPostHogServer } from "@/lib/posthog-server";
import {
  generateRfcCommitMessage,
  MAX_COMMIT_MESSAGE_BYTES,
} from "@/lib/rfc-commit-message";
import { formatUnifiedDiff } from "@/lib/unified-diff";

/**
 * Offline (dataset-based) evaluation for the RFC commit-message generator.
 *
 * This is NOT a unit test – it calls the real OpenAI model and streams each
 * result to PostHog as a `$ai_generation` event tagged `eval: true`, so a
 * PostHog code-based (Hog) evaluation can score the dataset over time (see
 * `posthog/evaluations/`). It also asserts a few hard structural invariants
 * locally so a regression fails the run immediately.
 *
 * Skipped by default. Run with: `pnpm eval:commit-message`
 * (sets RUN_EVALS=1; requires OPENAI_API_KEY, optionally NEXT_PUBLIC_POSTHOG_KEY).
 */

// Load local secrets the way Next.js does for `pnpm dev`. Optional – CI may
// inject env another way.
try {
  process.loadEnvFile?.(".env.local");
} catch {
  // No .env.local – rely on the ambient environment.
}

const SHOULD_RUN = !!process.env.RUN_EVALS && !!process.env.OPENAI_API_KEY;

interface EvalCase {
  name: string;
  markdownFilePath: string;
  previousBody: string;
  body: string;
  /** What a good message should capture – for human review, not asserted. */
  expectation: string;
}

const DATASET: EvalCase[] = [
  {
    name: "add-section",
    markdownFilePath: "rfcs/auth.md",
    expectation: "Mentions adding a security / threat-model section",
    previousBody: `# Auth RFC

## Goals
Single sign-on for the dashboard.

## Rollout
Behind a flag for two weeks.`,
    body: `# Auth RFC

## Goals
Single sign-on for the dashboard.

## Security considerations
Tokens are encrypted at rest; sessions expire after 24h.

## Rollout
Behind a flag for two weeks.`,
  },
  {
    name: "clarify-wording",
    markdownFilePath: "rfcs/auth.md",
    expectation: "Notes clarifying the rollout timeline",
    previousBody: `## Rollout
Behind a flag for two weeks.`,
    body: `## Rollout
Behind a flag for two weeks, then a 10% canary before full enablement.`,
  },
  {
    name: "fix-typo",
    markdownFilePath: "rfcs/storage.md",
    expectation: "Notes a typo / wording fix, stays terse",
    previousBody: `We will store blobs in S3 and serv them via CDN.`,
    body: `We will store blobs in S3 and serve them via CDN.`,
  },
  {
    name: "adjust-number",
    markdownFilePath: "rfcs/limits.md",
    expectation: "Mentions changing the rate limit value",
    previousBody: `Each API key is limited to 100 requests per minute.`,
    body: `Each API key is limited to 500 requests per minute.`,
  },
  {
    name: "remove-section",
    markdownFilePath: "rfcs/auth.md",
    expectation: "Mentions dropping the open-questions section",
    previousBody: `## Proposal
Use JWTs.

## Open questions
- Do we need refresh tokens?
- Which library?`,
    body: `## Proposal
Use JWTs.`,
  },
  {
    name: "large-rewrite",
    markdownFilePath: "rfcs/migration.md",
    expectation: "Stays a single short line even for a big rewrite",
    previousBody: Array.from(
      { length: 60 },
      (_, i) => `Old approach point ${i}: do it the legacy way.`,
    ).join("\n"),
    body: Array.from(
      { length: 60 },
      (_, i) => `New approach point ${i}: do it the modern way.`,
    ).join("\n"),
  },
];

/** Hard checks fail the run; soft checks are warnings (and captured to
 *  PostHog) but don't break CI, since they encode style guidance rather than
 *  correctness. */
function checkMessage(message: string): {
  hardFailures: string[];
  softFailures: string[];
} {
  const hardFailures: string[] = [];
  const softFailures: string[] = [];
  const trimmed = message.trim();

  if (trimmed.length === 0) hardFailures.push("empty");
  if (message.includes("\n")) hardFailures.push("multiline");
  if (/^["'`]/.test(trimmed) || /["'`]$/.test(trimmed)) {
    hardFailures.push("wrapped-in-quotes");
  }
  if (Buffer.byteLength(message, "utf-8") > MAX_COMMIT_MESSAGE_BYTES) {
    hardFailures.push("exceeds-byte-cap");
  }
  if (trimmed === "Update RFC") hardFailures.push("fallback");

  if (/\.$/.test(trimmed)) softFailures.push("trailing-period");
  if (message.length > 72) softFailures.push(`too-long-${message.length}`);

  return { hardFailures, softFailures };
}

const posthog = getPostHogServer();
const evalRunId = randomUUID();

describe.skipIf(!SHOULD_RUN)("rfc-commit-message offline eval", () => {
  it.each(DATASET)(
    "$name",
    async (testCase) => {
      const startedAt = Date.now();
      const message = await generateRfcCommitMessage({
        previousBody: testCase.previousBody,
        body: testCase.body,
        markdownFilePath: testCase.markdownFilePath,
      });
      const latencySeconds = (Date.now() - startedAt) / 1000;

      const diff = formatUnifiedDiff(testCase.previousBody, testCase.body, {
        path: testCase.markdownFilePath.split("/").pop(),
      });
      const { hardFailures, softFailures } = checkMessage(message);

      // Emit a PostHog `$ai_generation` so a code-based (Hog) evaluation can
      // score the dataset offline. `eval_message` carries the plain string so
      // the Hog evaluator doesn't have to parse `$ai_output_choices`.
      posthog?.capture({
        distinctId: "rfc-commit-message-eval",
        event: "$ai_generation",
        properties: {
          $ai_trace_id: randomUUID(),
          $ai_span_name: "rfc-commit-message-eval",
          $ai_model: "gpt-5.4-mini",
          $ai_provider: "openai",
          $ai_input: [
            { role: "user", content: `Summarize this RFC edit:\n\n${diff}` },
          ],
          $ai_output_choices: [{ role: "assistant", content: message }],
          $ai_latency: latencySeconds,
          eval: true,
          eval_dataset: "rfc-commit-message-v1",
          eval_run_id: evalRunId,
          eval_case: testCase.name,
          eval_message: message,
          eval_hard_failures: hardFailures,
          eval_soft_failures: softFailures,
        },
      });

      const summary = `[${testCase.name}] "${message}"`;
      if (softFailures.length > 0) {
        console.warn(`${summary} — soft: ${softFailures.join(", ")}`);
      } else {
        console.log(summary);
      }

      expect(hardFailures, `${summary} — hard failures`).toEqual([]);
    },
    60_000,
  ); // LLM round-trips routinely exceed Vitest's default 5s timeout.

  afterAll(async () => {
    await posthog?.shutdown();
  });
});
