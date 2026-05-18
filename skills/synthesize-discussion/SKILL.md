---
name: synthesize-discussion
description: Use when an RFC has accumulated enough comments that newcomers can't easily see the shape of the discussion. Reads every comment and review thread, groups concerns by theme, distinguishes settled vs. unresolved, and posts a roll-up as a general comment on the RFC.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_list_review_threads
  - mcp__rfc123__rfc123_post_general_comment
---

# synthesize-discussion

Roll up a long RFC discussion into a short, structured summary that lets the
author and new reviewers orient quickly.

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
   - **Settled** — the question was raised and answered, or the thread is
     marked resolved. Note the resolution.
   - **Unresolved** — still being debated, or pending a response from the
     author.

5. **Cite people by `@login`.** Specific attributions ("@alice flagged X,
   @bob countered with Y") are more useful than passive voice. Don't include
   the via-Claude footer of any prior bot comments in your tally.

6. **Format the output.** Use this template (adapt as needed):

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

7. **Post it.** Call `rfc123_post_general_comment` with the synthesis. The MCP
   server appends the via-Claude footer automatically.

## What not to do

- Don't paraphrase comments in a way that changes their meaning. When
  in doubt, quote.
- Don't take sides. Surface the disagreement; let humans resolve it.
- Don't include a synthesis if the discussion is short (under ~10 comments)
  — just point the user at it directly.
