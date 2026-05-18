---
name: register-decision
description: Use when an RFC has reached a decision and the user wants to capture it durably in the markdown. Coaches the user through a one-sentence decision plus brief rationale, then commits a "Decision (YYYY-MM-DD)" block to the RFC body.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_list_review_threads
  - mcp__rfc123__rfc123_register_decision
---

# register-decision

Capture a resolved RFC decision in the markdown body so future readers don't
have to reconstruct it from comments.

## When to use

The user says "we decided X", "register the decision", or an RFC has been
discussed enough that they're ready to commit to a path. Also good
proactively when threads are mostly resolved.

## Process

1. **Read the RFC.** Call `rfc123_get_rfc`. The response carries
   `decisionBlocks` (parsed prior decisions) and `hasDecision`; use those
   to decide whether you're appending or registering the first one.
   `rfc123_register_decision` will append to the existing `## Decisions`
   section rather than overwrite.

2. **Check the air is clear.** Call `rfc123_list_review_threads`. If any
   unresolved threads still exist on the central question, surface them and
   ask whether the user really wants to lock in the decision now. Sometimes
   yes (decision was reached out-of-band); sometimes the user forgot a
   thread. Note which thread IDs the decision settles — you'll pass them to
   the tool below.

3. **Coach the decision text.** Push for:
   - **One sentence** stating what was decided, in the active voice.
     "We will use Postgres as the primary store" — not "Postgres is good".
   - **Specific.** "Use approach B" is too vague if there are 3 approaches;
     restate the choice.

4. **Coach the rationale.** Two to four short sentences. The rationale exists
   so a reader six months from now can tell *why*, not just *what*. Cite
   thread links or commenters if the reasoning came from the discussion.

5. **Confirm before committing.** Show the user exactly what will be appended:

   ```markdown
   ### Decision (2026-05-18 by @author)

   <decision sentence>

   **Rationale:** <rationale>
   ```

6. **Commit.** Call `rfc123_register_decision` with `decision`, `rationale`
   (required), and `resolvesThreadIds` for the threads identified in step 2.
   The tool sets the date + decided-by automatically, applies the
   `decision-registered` label (so `hasDecision` shows up in list views),
   resolves the named threads, and appends the via-Claude footer.

7. **Any straggler threads?** If unresolved threads exist on adjacent
   questions, point the user at the `resolve-threads` skill.

## What not to do

- Don't record a decision the user hasn't explicitly stated. Inferring
  decisions from discussion is the author's job, not the agent's.
- Don't include implementation steps in the decision block — it's a decision,
  not a plan. Implementation lives elsewhere.
- Don't combine multiple decisions in one block. One block per decision.
