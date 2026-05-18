---
name: propose-revision
description: Use when reviewers' feedback warrants a substantive edit to an RFC's body. Reads the RFC and unresolved threads, drafts a revised body, shows a diff for the user to approve, and commits via the RFC123 MCP server.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_list_review_threads
  - mcp__rfc123__rfc123_update_rfc_body
---

# propose-revision

Help the user incorporate review feedback into a revised RFC body.

## When to use

The user says "revise the RFC", "rewrite section X", or "update the proposal
based on the feedback". Also useful when an unresolved thread is asking for
specific changes the user agrees with.

## Process

1. **Read the RFC and threads.** Call `rfc123_get_rfc`, `rfc123_get_rfc_comments`, and
   `rfc123_list_review_threads` to gather context. Pay particular attention to
   threads whose `isResolved` is false and `isOutdated` is false.

2. **Decide scope.** Ask the user: are we addressing a specific thread, a
   specific section, or "everything that's still open"? Don't try to rewrite
   the whole thing if scoping it tighter is possible.

3. **Draft the revision in-line.** Show the user the proposed new body as
   markdown. Do *not* call `rfc123_update_rfc_body` yet.

4. **Show a diff summary.** Highlight what changed (added/removed/reworded).
   A 5-line "what changed" digest before the full body works well for long
   bodies.

5. **Wait for user approval.** Only call `rfc123_update_rfc_body` after the
   user says go. Pass `changeDescription` — a one-line summary of the
   revision (e.g. "Tighten security section; address @alice feedback") that
   becomes the commit message. The footer is added automatically; don't add
   it yourself. The response includes `linesAdded`/`linesRemoved` so you
   can report the size of the change without re-reading.

6. **Mention follow-ups.** If the revision settles a previously-unresolved
   thread, suggest also using the `resolve-threads` skill to close it out.

## What not to do

- Don't change meaning silently. If you're rewriting a sentence whose intent
  is ambiguous, ask the user what they meant before writing the new version.
- Don't reorder sections without saying so.
- Don't strip the existing Decisions section if one is present — append, never
  overwrite.
