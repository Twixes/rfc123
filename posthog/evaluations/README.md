# PostHog offline evaluations

Offline, dataset-based evals for our LLM features. The runner lives next to the
code it exercises (e.g. `src/lib/rfc-commit-message.eval.test.ts`); the
PostHog-side scorer lives here as version-controlled Hog.

## RFC commit-message generator

Evaluates `generateRfcCommitMessage` (`src/lib/rfc-commit-message.ts`), which
writes a one-line commit message from the diff between the saved RFC body and an
edit when the author leaves the message blank.

### 1. Run the dataset

```bash
pnpm eval:commit-message
```

This runs the curated dataset in `src/lib/rfc-commit-message.eval.test.ts`
against the real model, asserts hard structural invariants locally (single
line, length cap, not the generic fallback, no wrapping quotes), and emits one
PostHog `$ai_generation` event per case, tagged:

- `$ai_span_name = "rfc-commit-message-eval"`
- `eval = true`, `eval_dataset = "rfc-commit-message-v1"`, `eval_run_id`, `eval_case`
- `eval_message` – the generated message, verbatim

Requires `OPENAI_API_KEY` (and `NEXT_PUBLIC_POSTHOG_KEY` to ship results to
PostHog). Both are read from `.env.local` automatically. The eval is skipped in
the normal `pnpm test` run (it's gated on `RUN_EVALS`).

### 2. Score it in PostHog

Create the evaluation once, then every dataset run is scored automatically and
trends show up under AI Evals.

- **UI:** AI Evals → New evaluation → Code-based (Hog). Paste
  `rfc-commit-message.hog`, enable **Allows N/A**, and add a property filter
  `eval = true`.
- **MCP:** `evaluation-create` (PostHog MCP server) with the same Hog code and
  filter.

The `eval = true` filter keeps the evaluation scoped to offline dataset runs so
it never spends quota on live production traffic.
