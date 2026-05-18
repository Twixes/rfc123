---
name: extract-action-items
description: Use to surface explicit owner+action items buried in long RFC discussions ("@alice will write up the migration", "@bob to check with infra"). Posts a checklist comment so they're trackable.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc_comments
  - mcp__rfc123__rfc123_post_general_comment
---

# extract-action-items

Pull explicit action items out of an RFC's discussion and post them as a
markdown checklist.

## When to use

The discussion has reached a point where commitments are being made
("I'll do X", "@person to do Y") but nobody has rolled them up. Or the user
says "what are the action items?"

## Process

1. **Read every comment.** Call `rfc123_get_rfc_comments`.

2. **Find explicit owner+action pairs.** An action item has:
   - A clear owner (`@login` or an unambiguous "I'll" with author attribution)
   - A concrete action (verb + object, not a vague intent)
   - Was offered as a commitment, not as a question or hypothetical

   "@alice can you check?" → not an action item (question).
   "@alice will check with infra" → action item.
   "I'll write up the migration steps" by @alice in comment → action item.

3. **Skip near-misses.** If there's ambiguity about who owns it or what
   exactly they'll do, leave it off the list and note it as a follow-up
   question for the user.

4. **Format the checklist.** Use GitHub task-list syntax so reviewers can
   tick items off:

   ```markdown
   ## Action items

   - [ ] @alice — write up the migration steps (from <link or quote>)
   - [ ] @bob — confirm with infra whether <thing> is feasible
   ```

5. **Include source citations.** Link to or quote the comment where each
   item was committed to. Without this, owners can dispute attribution.

6. **Post it.** Call `rfc123_post_general_comment`.

## What not to do

- Don't invent action items. If there are none, say so — don't manufacture
  filler to make the comment feel substantive.
- Don't reassign existing items to different owners.
- Don't include items that have already been done in a follow-up comment.
