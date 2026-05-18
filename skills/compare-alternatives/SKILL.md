---
name: compare-alternatives
description: Use when an RFC discusses multiple options but hasn't laid them out side-by-side. Reads the body, extracts the alternatives, proposes comparison axes, builds a markdown table, and offers to commit it as a new section.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
  - mcp__rfc123__rfc123_update_rfc_body
---

# compare-alternatives

Convert a prose discussion of options into a comparison table reviewers can
scan in 10 seconds.

## When to use

The user says "compare the options", "build a table", or the RFC contains
phrases like "Option A would …, Option B would …" without a structured
comparison. Also good when reviewers are confused about which option does what.

## Process

1. **Read the RFC.** Call `rfc123_get_rfc`.

2. **Extract the options.** List every distinct alternative the body
   discusses, in the order they appear. If you can only find one, stop and
   tell the user — there's nothing to compare.

3. **Pick comparison axes.** 4–7 axes typically. Choose axes that actually
   discriminate between options. Generic axes ("complexity", "cost") often
   end up with the same value in every cell — prefer specific axes that
   match the topic (e.g. "supports cross-region", "schema-compat with X",
   "blast radius if it breaks").

4. **Build the table.**

   ```markdown
   |                       | Option A         | Option B         | Option C         |
   |-----------------------|------------------|------------------|------------------|
   | <axis 1>              | …                | …                | …                |
   ```

5. **Show the user.** Get their sign-off on the axes and the cell values
   before committing. They may know domain facts you don't.

6. **Commit.** Insert the table just below the "Alternatives considered"
   header if one exists; otherwise insert it as a new "## Alternatives
   considered" section. Call `rfc123_update_rfc_body` with the full new
   body and a `changeDescription` like "Add alternatives comparison table".

## What not to do

- Don't invent values for cells you don't know. Use "?" or "unknown" and
  ask the user.
- Don't reduce nuanced trade-offs to ✅/❌ unless the axis really is binary.
- Don't generate a comparison if the RFC has already explicitly picked one
  option and explained why — the table would be revisionist.
