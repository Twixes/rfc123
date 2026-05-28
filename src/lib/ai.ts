import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const DEFAULT_MODEL = "gpt-5.4-mini";

/**
 * Runs a one-shot text generation with our standard OpenAI model + PostHog
 * telemetry wiring (functionId + per-user distinct id). Throws on failure –
 * callers own their fallback behavior.
 */
export async function generateTextWithTelemetry(input: {
  functionId: string;
  system: string;
  prompt: string;
  githubLogin?: string;
  model?: string;
}): Promise<string> {
  const { text } = await generateText({
    model: openai(input.model ?? DEFAULT_MODEL),
    experimental_telemetry: {
      isEnabled: true,
      functionId: input.functionId,
      metadata: input.githubLogin
        ? { posthog_distinct_id: input.githubLogin }
        : {},
    },
    system: input.system,
    prompt: input.prompt,
  });
  return text;
}
