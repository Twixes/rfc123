---
name: pressure-test-rfc
description: Use when the user wants to stress-test an RFC's reasoning – strawman and steelman each claim, surface unstated assumptions, list missing alternatives, and find weak links. Pulls the RFC + threads via the MCP server and runs the analysis in chat. Never posts back to GitHub.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_list_review_threads
---

# pressure-test-rfc

Help the user think more rigorously about an RFC by walking each substantive
claim with both adversarial (strawman) and charitable (steelman) lenses,
naming the unstated assumptions, and surfacing missing alternatives. **Output
stays in chat.** The user types any actual feedback into GitHub themselves.

## When to use

The user says "pressure-test this RFC", "what could go wrong", "stress-test
the reasoning", "play devil's advocate", or pastes an RFC and asks how it
holds up. Also useful before approving a controversial proposal – the user
wants to know what they might be missing.

## Process

1. **Read everything.** Call `rfc123_get_rfc` for the body and
   `rfc123_get_rfc_comments` + `rfc123_list_review_threads` for the existing
   discussion. You don't want to re-raise concerns that are already settled.

2. **Inventory the substantive claims.** Pull out every load-bearing
   assertion from the body: technical claims ("X is faster than Y"),
   strategic claims ("this unblocks team Z"), scope claims ("we don't need
   to handle case W"), constraint claims ("we can't change the schema").
   Skip framing prose and motivation – focus on things the proposal depends
   on.

3. **For each claim, do three passes:**
   - **Strawman.** What's the weakest version of this claim someone could
     attack? Where does it break under load? Concrete failure modes.
   - **Steelman.** What's the strongest version, given the most charitable
     read? What constraints or context would make it obviously right?
   - **Unstated assumptions.** What does this claim quietly assume about
     the system, the team, the timeline, or future requirements? Name
     each one explicitly.

4. **Look for missing alternatives.** The RFC names some options. What
   options does it *not* name? Specifically:
   - Smaller incremental versions of the proposal
   - "Do nothing" or "do less" alternatives
   - Adjacent approaches that solve the same root problem differently
   - Approaches that solve a slightly different but related problem better

5. **Find the weakest link.** Across all the claims, which single one – if
   wrong – would invalidate the most of the proposal? Call it out. The user
   should focus their reviewer attention there.

6. **Format the analysis in chat.** Use this shape:

   ```markdown
   ## Pressure test: <RFC title>

   ### Claim 1: <one-line statement of the claim>
   - **Strawman:** …
   - **Steelman:** …
   - **Assumes:** …

   ### Claim 2: …

   ## Missing alternatives
   - …

   ## Weakest link
   <which claim, why>
   ```

7. **Stop there.** Hand the analysis to the user. Tell them: "If you want
   any of this in front of the author, write the comment yourself on
   GitHub – in your own voice. What's above is to sharpen your thinking,
   not to be copied verbatim."

## What not to do

- Don't be contrarian for its own sake. If a claim is solid, say so –
  noise dilutes signal.
- Don't repeat concerns already raised in the existing discussion. Cite
  them ("@alice already flagged this in thread X") and move on.
- Don't propose specific replacement language. The user writes their own
  feedback if they choose to leave any.
- Don't post anything to GitHub, even if the user asks. The analysis is
  for their thinking – they write any feedback themselves, in their own
  voice. RFCs are human-written; verbatim LLM prose defeats the purpose.
