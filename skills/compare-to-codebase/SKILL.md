---
name: compare-to-codebase
description: Use when reviewing an RFC that proposes code changes. Reads the RFC, then reads the actual repository at the PR head ref, and flags every factual claim the proposal makes about the codebase that the code contradicts or omits. Output stays in chat – the user types any feedback into GitHub themselves.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_list_review_threads
---

# compare-to-codebase

The most common reviewer failure mode is taking an RFC's claims about the
current codebase at face value. This skill grounds the review in the actual
code. **Output stays in chat.** Any feedback the user wants to leave on the
RFC, they type into GitHub themselves – in their own voice.

## When to use

The user is reviewing an RFC that proposes code changes and says "check this
against the code", "is this accurate?", "what does the code actually do?",
or simply "review this RFC." Skip for non-code RFCs (process, org, policy).

## Process

1. **Read the RFC.** Call `rfc123_get_rfc`. Note the `headRef` field – that's
   the PR's head branch, the canonical version of the code the proposal
   refers to. Also note `markdownFilePath` and which repo this RFC lives in.

2. **Read the existing discussion.** Call `rfc123_get_rfc_comments` and
   `rfc123_list_review_threads`. Don't re-raise points already on the table.

3. **Inventory the codebase claims.** Walk the RFC body and pull out every
   factual claim about the *current* state of the code:
   - "File X does Y today"
   - "We currently use library Z"
   - "Function `foo()` returns A"
   - "There is no existing support for B"
   - "The schema for table T has columns C, D, E"
   - Dependency / version claims
   - Behavior under specific edge cases

   Skip claims about the *future* state – those are proposals, not facts.

4. **Verify each claim against the actual code.** Use the host agent's
   repo-reading tools (e.g. Read, Grep, Glob in Claude Code) to look at the
   repo at `headRef`. For each claim, mark one of:
   - **Confirmed** – the code matches.
   - **Contradicted** – the code says otherwise; cite file:line.
   - **Omits** – the proposal misses a file/module/API that would have to
     change for the proposal to work; cite file:line.
   - **Stale** – the code has moved since the RFC was written; cite the
     newer state.
   - **Unverifiable** – can't be answered from the code alone (e.g. a claim
     about prod behavior, performance, or team capacity).

5. **Cross-check against existing reviewer threads.** If a thread already
   flags one of your "contradicted" or "omits" findings, downgrade your note
   to "@alice already raised this in thread X" – the goal is to add signal,
   not duplicate it.

6. **Format the report in chat.** Group by severity:

   ```markdown
   ## RFC vs. codebase

   ### Contradicted by the code
   - <RFC claim> – actually <what the code does>. (`path/to/file.ts:42`)

   ### Omitted from the proposal
   - The RFC doesn't mention <file/module>, but it would have to change
     because <reason>. (`path/to/file.ts:N`)

   ### Stale
   - <RFC claim> – the code has changed since the RFC was written.
     (`path/to/file.ts:N`)

   ### Unverifiable from the code
   - <RFC claim> – needs a human to confirm.

   ### Confirmed (sanity-check pass)
   - <claim> ✓
   ```

7. **Stop there.** Tell the user: "If you want to raise any of these on
   the RFC, write the comment yourself on GitHub – in your own voice.
   What's above is to inform your review, not to be copied verbatim."

## What not to do

- Don't second-guess design decisions – that's `pressure-test-rfc`. This
  skill is strictly about whether the *factual* claims hold.
- Don't propose code edits, even small ones. The deliverable is a checklist
  for the human reviewer, not a patch.
- Don't fabricate file paths. If you can't find what the RFC references,
  mark it "Unverifiable" rather than guessing.
- Don't post anything to GitHub. The findings are a thinking aid for the
  user's review – they write any feedback themselves, in their own voice.
