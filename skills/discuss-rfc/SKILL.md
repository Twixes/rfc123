---
name: discuss-rfc
description: Use when the user wants to talk through a specific RFC in depth — understanding the proposal, pressure-testing it, comparing it against the actual codebase, and surfacing gaps the author missed. Pulls the RFC + threads via the MCP server, grounds the discussion in the current code, and stays in chat. Never posts back to the RFC.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_list_review_threads
---

# discuss-rfc

Help the user think through a specific RFC by grounding the conversation in
both the proposal and the codebase it touches. Surface gaps the author
missed. **The output is the conversation itself** — nothing gets posted back
to GitHub by this skill. If the user wants to leave a comment, they type it
into GitHub themselves.

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

## What not to do

- Don't summarize the RFC back to the user in long form — they're reading it.
  Surface what they wouldn't see by reading.
- **Don't post anything to GitHub.** No comments, no replies, no reviews —
  not even if the user explicitly asks. If they want to leave feedback,
  direct them to the RFC page so they can write it themselves, in their
  own voice. RFCs and the discussion around them are human-written; copying
  LLM prose verbatim is what we're avoiding.
- Don't draft RFC body rewrites — the agent doesn't author RFC prose.
- Don't try to resolve threads or merge. There's no MCP tool for thread
  resolution; merge is its own structural action.
