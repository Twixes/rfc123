---
name: resolve-threads
description: Use to clear out unresolved review threads on an RFC. Walks each open thread, proposes a reply that resolves the concern, posts the reply, and marks the thread resolved – all gated on user approval per thread.
allowed-tools:
  - mcp__rfc123__rfc123_list_review_threads
  - mcp__rfc123__rfc123_reply_to_comment
  - mcp__rfc123__rfc123_resolve_review_thread
---

# resolve-threads

Help the user close out lingering review threads on an RFC.

## When to use

The user says "let's resolve the open threads", "address remaining feedback",
or you can see (e.g. from a synthesis) that several threads on the RFC are
unresolved and ready to be answered.

## Process

1. **List unresolved threads.** Call `rfc123_list_review_threads` (without
   `includeResolved`). If the result is empty, tell the user and stop.

2. **For each thread, in order:**

   a. Summarize the concern in one sentence. Quote the original commenter
      verbatim if the wording matters.

   b. Propose a reply that responds to the concern. Reply types:
      - **Accept** — "Yes, good point. Updated in <commit>." Use this when
        the RFC body has been changed to address it.
      - **Push back** — "I considered that, but… <reason>." Use when the
        author disagrees; include the reason.
      - **Defer** — "Out of scope for this RFC; tracking as <link>." Use
        when valid but not for this RFC.

   c. Show the proposed reply to the user. Wait for them to approve, edit,
      or skip the thread. Don't ever post without explicit approval.

3. **Post + resolve in one call.** On approval, call
   `rfc123_reply_to_comment` with the thread's `firstCommentId` and
   `andResolve: true`. The reply lands and the thread is marked resolved
   atomically — no second tool call required. If `andResolve` reports an
   error (rare), fall back to `rfc123_resolve_review_thread` with the
   thread's `id`.

4. **Move on.** Continue to the next unresolved thread. Track which ones the
   user skipped so you can flag them at the end.

5. **Summary.** When you finish, report: N resolved, M skipped (with one
   line each for skipped). The user may want to come back to skipped ones.

## What not to do

- Don't batch all replies and post them at once. Each gets explicit
  approval — there are real social consequences to a bad reply at scale.
- Don't resolve a thread without posting a reply that explains the
  resolution. Silent resolution is a trust-eroder.
- Don't push back without a reason. "I disagree" is not a reply; it's a
  dead-end.
