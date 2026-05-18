---
name: discuss-rfc
description: Use when the user wants to talk through a specific RFC in depth — understanding the proposal, pressure-testing it, comparing it against the actual codebase, and surfacing gaps the author missed. Pulls the RFC + threads via the MCP server, grounds the discussion in the current code, then takes the user's lead before posting anything back.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_list_review_threads
  - mcp__rfc123__rfc123_post_general_comment
  - mcp__rfc123__rfc123_post_inline_comment
  - mcp__rfc123__rfc123_reply_to_comment
  - mcp__rfc123__rfc123_submit_review
---

# discuss-rfc

Help the user think through a specific RFC by grounding the conversation in
both the proposal and the codebase it touches. Surface gaps the author missed.
Only post back to the RFC when the user explicitly asks.

## When to use

The user says "help me think about this RFC", "discuss RFC #N", "review this
proposal with me", or pastes an RFC URL and wants to engage with it.

## Process

1. **Read the RFC and its discussion.** Call `rfc123_get_rfc` for the body,
   `rfc123_get_rfc_comments` for general comments, and
   `rfc123_list_review_threads` for inline discussion. Skim all three before
   forming an opinion.

2. **Ground in the codebase.** If the RFC proposes changes to code, locate the
   files / modules / APIs it touches in the current repository (or repositories
   it depends on). Read enough to know the current state, not just the
   proposed state. Skip this step for non-code RFCs (process, policy,
   organizational).

3. **Surface gaps.** Compare the proposal against reality and list:
   - Files / modules / APIs the proposal omits but would have to change
   - Edge cases the author didn't address
   - Claims in the proposal that the code contradicts
   - Work already done that the proposal can be tightened around
   - Things that are harder than the proposal implies given current structure
   - Existing threads that already raise (or contradict) any of the above

4. **Hand the conversation to the user.** They might want to push back,
   brainstorm alternatives, dig into a specific section, or just understand
   something. Don't lecture — ask what they want to focus on. Whenever you
   need a choice or clarification from the user — at this hand-off or anywhere
   later in the conversation — prefer your structured question-asking tool
   (e.g. `AskUserQuestion` in Claude Code) over a plain prose question, so the
   user can answer with one click. Fall back to free-text questions only if
   no such tool is available.

5. **Post only when asked.** When the user says "comment this", "post this as
   a reply", or similar, route to the right tool:
   - Stateless top-level note → `rfc123_post_general_comment`.
   - One-off inline note (no verdict) → `rfc123_post_inline_comment`. `line`
     refers to the PR head file; pass `startLine`+`line` for a range.
   - Verdict (APPROVE/REQUEST_CHANGES/COMMENT) or ≥2 inline notes →
     `rfc123_submit_review` (bundles into one notification). For
     REQUEST_CHANGES pass `confirmBlocksMerge: true`.
   - Reply inside an existing thread → `rfc123_reply_to_comment`, with
     `andResolve: true` when the reply also closes the discussion.
   RFC123 appends a `— via Claude on RFC123` footer automatically; don't
   add it yourself.

## What not to do

- Don't summarize the RFC back to the user in long form — they're reading it.
  Surface what they wouldn't see by reading.
- Don't propose body rewrites here. That's `propose-revision`.
- Don't resolve threads or merge. Those are explicit, separate skills.
- Don't post a comment without an explicit user instruction, even if the
  conversation feels like it's pointing that way.
