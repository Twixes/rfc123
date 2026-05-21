---
name: synthesize-discussion
description: Use when an RFC has accumulated enough comments that newcomers can't easily see the shape of the discussion. Reads every comment and review thread, groups concerns by theme, distinguishes settled vs. unresolved, and shows the roll-up in chat. Never posts back to GitHub – the user reworks any of it into the RFC in their own words.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_list_review_threads
---

# synthesize-discussion

Roll up a long RFC discussion into a short, structured summary that lets the
user orient quickly. **Output stays in chat.** If the user wants the
synthesis to land on the RFC, they edit it in themselves – rewriting it in
their own voice, not copying yours verbatim. The chat synthesis is a
thinking aid, not source prose.

## When to use

The user says "synthesize the discussion", "summarize the comments", or "what
are people arguing about?" on a specific RFC. Also worth offering proactively
when an RFC has 20+ comments and the user is about to engage.

## Process

1. **Read the RFC.** Call `rfc123_get_rfc` so you understand what was proposed.

2. **Read every comment and thread.** Call `rfc123_get_rfc_comments` and
   `rfc123_list_review_threads` in parallel. You need both: review threads carry the
   resolved/unresolved state; general comments don't.

3. **Group by theme.** Cluster comments into 3–6 themes. A theme is a concern
   or topic, not a person. Examples: "migration risk", "naming", "scope of
   the change", "perf". Two unrelated points from the same person → two
   themes.

4. **Within each theme, distinguish:**
   - **Settled** – the question was raised and answered, or the thread is
     marked resolved. Note the resolution.
   - **Unresolved** – still being debated, or pending a response from the
     author.

5. **Cite people by `@login`.** Specific attributions ("@alice flagged X,
   @bob countered with Y") are more useful than passive voice.

6. **Show the synthesis in chat.** Use this template (adapt as needed):

   ```markdown
   ## Discussion synthesis

   ### Theme 1: <name>

   **Settled:**
   - @alice raised X. Resolved by Y. (thread <link or short quote>)

   **Unresolved:**
   - @bob is pushing back on Z because <reason>. No response yet.

   ### Theme 2: <name>
   …
   ```

7. **Stop there.** Do not post the synthesis. If the user wants this on the
   RFC, they incorporate it themselves on GitHub – in their own words. The
   chat output is for them to read and think with, not to copy verbatim.

## What not to do

- Don't paraphrase comments in a way that changes their meaning. When
  in doubt, quote.
- Don't take sides. Surface the disagreement; let humans resolve it.
- Don't post the synthesis to GitHub – even if the user asks. Hand it to
  them in chat and remind them to rewrite the bits they want to share in
  their own voice. RFCs are human-written documents; verbatim LLM prose
  defeats the purpose.
- Don't include a synthesis if the discussion is short (under ~10 comments)
  – just point the user at it directly.
