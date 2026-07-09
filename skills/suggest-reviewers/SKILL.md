---
name: suggest-reviewers
description: Recommend reviewers for an RFC based on file paths in the PR, prior commenters on related RFCs, and the team mapping already visible from listed RFCs. Shows a ranked list with reasons, then requests reviewers on the user's approval.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_list_rfcs
  - mcp__rfc123__rfc123_search_reviewers
  - mcp__rfc123__rfc123_request_reviewers
---

# suggest-reviewers

Help the user pick the right reviewers for an RFC.

## When to use

The user just drafted an RFC and isn't sure who should review, or wants to
add reviewers to an existing RFC.

## Process

1. **Read the RFC.** Call `rfc123_get_rfc` for the target RFC and note: the file
   paths the PR touches, the author, and any reviewers already requested.

2. **Look for adjacent context.** Call `rfc123_list_rfcs` on the same repo. Scan for
   prior RFCs that:
   - Touch overlapping file paths (similar paths in `files`).
   - Have the same author or were authored by reviewers already on this RFC.
   - Carry team slugs in `requestedTeamSlugs` that match the topic area.

3. **Build a candidate list.** For each candidate, write down the *reason*
   they're a good fit ("authored related RFC #X about Y"; "is on
   `${org}/${team}` which has reviewed every storage RFC"). Bare names with
   no reason are not useful – the user can't sanity-check them.

4. **Rank.** Cap the list at 5 individuals + up to 2 teams. Rank by
   directness of relevance, not seniority.

5. **Show the user.** Surface the ranked list with reasons. Do not call
   `rfc123_request_reviewers` yet.

6. **Verify handles.** Once the user picks who to request, run
   `rfc123_search_reviewers` on any name you're uncertain about. The tool is
   org-scoped (across orgs that host RFC repos visible to you) and returns
   mixed users + teams with a `kind` discriminator and a ready-to-use
   `handle`. For teams, `handle` comes back as `org/slug`.

7. **Request.** Call `rfc123_request_reviewers` with the chosen `users` and
   `teams`. The response echoes back `added`, `alreadyRequested`, `removed`,
   and the final `pending` set – share the relevant slice with the user. If
   the user wants to swap a stalled reviewer, use `removeUsers` /
   `removeTeams` in the same call.

## What not to do

- Don't recommend reviewers without giving the user a reason. "Add Alice"
  with no rationale is worse than no suggestion.
- Don't recommend the author. (It happens – check.)
- Don't propose more than 5 individuals; reviewer overload kills response time.
- Don't invent team slugs. If you can't see the team in `requestedTeamSlugs`
  of any existing RFC, ask the user to confirm the team exists.
