---
name: draft-rfc
description: Use when the user wants to draft a new RFC from a one-paragraph brief. Walks them through Background → Proposal → Alternatives → Open questions, then opens the pull request via the RFC123 MCP server.
allowed-tools:
  - mcp__rfc123__rfc123_list_repos_with_rfcs
  - mcp__rfc123__rfc123_search_rfcs
  - mcp__rfc123__rfc123_search_reviewers
  - mcp__rfc123__rfc123_create_rfc
---

# draft-rfc

Help the user turn a brief into a complete RFC body and open it as a pull
request on the right repository.

## When to use

The user has a topic or problem they want to RFC about and says something like
"draft an RFC for…", "help me write an RFC on…", or "propose this as an RFC."

## Process

1. **Read the brief.** If it's shorter than a sentence, ask for more context
   before going further: what problem, who's affected, what change.

2. **Pick the repo.** If the user didn't name one, call `rfc123_list_repos_with_rfcs`
   and ask them which one this RFC belongs in. Don't guess.

3. **Check for prior art.** Call `rfc123_search_rfcs` with 2–3 key phrases from the
   brief, scoped to the chosen owner. Surface any matches to the user before
   drafting — duplicating an existing RFC is a waste of everyone's time.

4. **Draft the body using the template in `references/template.md`.** The
   template is a *suggestion*, not a contract: adapt it to fit the topic
   (e.g. drop "Alternatives considered" if there genuinely is only one path).
   Keep prose terse and factual. No marketing language. No emoji unless the
   user adds them.

5. **Iterate with the user.** Show them the draft. Ask focused follow-up
   questions to fill specific gaps ("you didn't say what happens on rollback —
   what's the plan?"). Don't ask broad "is this good?" questions.

6. **Pick reviewers.** Ask the user who should review. If they hesitate, point
   them at the `suggest-reviewers` skill. Resolve any uncertain logins or
   teams with `rfc123_search_reviewers` (org-scoped; returns mixed users +
   teams with `kind` discriminator and `handle` ready for `create_rfc`).

7. **Open the PR.** Call `rfc123_create_rfc` with the final body. The PR
   opens as a draft by default — only pass `draft: false` if the user
   explicitly wants reviewers pinged immediately. `directory` is
   auto-detected from the repo's layout; override only if the user wants a
   non-conventional path.

## What not to do

- Don't add filler ("This RFC proposes…"). Get to the point in the first line.
- Don't invent details that aren't in the brief or the user's answers.
- Don't add a "Conclusion" or "Summary" section — the body itself is the proposal.
- Don't append "— via Claude on RFC123" yourself; the MCP server adds it.

## References

- `references/template.md` — the suggested four-section structure RFC123 uses.
