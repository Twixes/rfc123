---
name: compare-alternatives
description: Use when an RFC discusses multiple options but hasn't laid them out side-by-side. Reads the body, extracts the alternatives, proposes comparison axes, and builds a markdown table in chat. The user edits it into the RFC themselves – in their own voice – if they want it there.
allowed-tools:
  - mcp__rfc123__rfc123_get_rfc
---

# compare-alternatives

Convert a prose discussion of options into a comparison table the user can
scan in 10 seconds. **Output stays in chat.** If the user wants the table on
the RFC, they edit it in themselves – rewriting the cells in their own
voice. The chat table is a thinking aid, not source prose.

## When to use

The user says "compare the options", "build a table", or the RFC contains
phrases like "Option A would …, Option B would …" without a structured
comparison. Also good when the user is reviewing and is confused about which
option does what.

## Process

1. **Read the RFC.** Call `rfc123_get_rfc`.

2. **Extract the options.** List every distinct alternative the body
   discusses, in the order they appear. If you can only find one, stop and
   tell the user – there's nothing to compare.

3. **Pick comparison axes.** 4–7 axes typically. Choose axes that actually
   discriminate between options. Generic axes ("complexity", "cost") often
   end up with the same value in every cell – prefer specific axes that
   match the topic (e.g. "supports cross-region", "schema-compat with X",
   "blast radius if it breaks").

4. **Build the table in chat.**

   ```markdown
   |                       | Option A         | Option B         | Option C         |
   |-----------------------|------------------|------------------|------------------|
   | <axis 1>              | …                | …                | …                |
   ```

5. **Walk the user through your axes and cell values.** They may know domain
   facts you don't. Iterate in chat until the table looks right.

6. **Stop there.** Do not commit the table to the RFC. Tell the user:
   "Here's the table – edit it into the RFC body yourself, rewriting the
   cells in your own voice as you go."

## What not to do

- Don't invent values for cells you don't know. Use "?" or "unknown" and
  ask the user.
- Don't reduce nuanced trade-offs to ✅/❌ unless the axis really is binary.
- Don't generate a comparison if the RFC has already explicitly picked one
  option and explained why – the table would be revisionist.
- Don't commit anything to the RFC, even if the user asks. Hand them the
  markdown to incorporate themselves – and remind them to type the cells in
  their own voice rather than copying yours verbatim.
