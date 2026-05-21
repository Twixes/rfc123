---
name: extract-action-items
description: Use to surface explicit owner+action items buried in long RFC discussions ("@alice will write up the migration", "@bob to check with infra"). Shows the checklist in chat; the user edits it into the RFC themselves, in their own voice.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc_comments
---

# extract-action-items

Pull explicit action items out of an RFC's discussion and present them as a
markdown checklist **in chat**. The user decides whether to incorporate it
onto the RFC — typing it in themselves, in their own voice. This skill
never posts.

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

4. **Format the checklist.** Use GitHub task-list syntax as a reference
   format — the user adapts and rewrites items in their own words when
   incorporating them into the RFC:

   ```markdown
   ## Action items

   - [ ] @alice — write up the migration steps (from <link or quote>)
   - [ ] @bob — confirm with infra whether <thing> is feasible
   ```

5. **Include source citations.** Link to or quote the comment where each
   item was committed to. Without this, owners can dispute attribution.

6. **Show it to the user — do not post.** Tell them: "Here's the
   checklist. Edit it into the RFC yourself if you want it tracked there —
   rewrite items in your own voice as you go."

## What not to do

- Don't invent action items. If there are none, say so — don't manufacture
  filler to make the chat output feel substantive.
- Don't reassign existing items to different owners.
- Don't include items that have already been done in a follow-up comment.
- Don't post the checklist to GitHub — even if the user asks. Hand it to
  them in chat and remind them to type it into the RFC in their own voice.
  RFCs are human-written; copying LLM prose verbatim is what we're avoiding.
