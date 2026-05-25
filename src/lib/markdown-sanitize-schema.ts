import { defaultSchema, type Schema } from "hast-util-sanitize";

/**
 * Sanitization schema for markdown that flows through `rehype-raw` (i.e. raw
 * HTML in RFC bodies / PR comments authored by any GitHub user with comment
 * permission). Built on top of `hast-util-sanitize`'s default schema with two
 * adjustments:
 *
 *  1. **Allow `className` everywhere** so `rehype-highlight`'s syntax-highlight
 *     spans survive the sanitizer pass.
 *  2. **Allow `<input type="checkbox">`** so GFM task list items still render.
 *
 * Everything dangerous (`<script>`, `<iframe>`, `<style>`, `on*` handlers,
 * `javascript:` / `data:` URLs in href/src) is rejected by the default schema –
 * we intentionally do not relax that.
 *
 * Order in the rehype pipeline matters: `rehype-raw` must run first (so the
 * parsed raw HTML becomes hast nodes), then `rehype-sanitize` (to strip the
 * dangerous ones), then `rehype-highlight` (so highlight spans are not stripped).
 */
export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      // Our own line-marker plugin emits these; they're inert.
      "dataLine",
      "dataLineElement",
      "dataLineEnd",
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      "checked",
      "disabled",
    ],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    // GFM checkbox in task lists
    "input",
  ],
};
