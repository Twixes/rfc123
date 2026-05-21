# RFC123 Agent Skills

Portable instruction sets that pair with the [RFC123 MCP server](../src/app/mcp/route.ts).
Each skill teaches an AI coding assistant how to use the MCP server's
deterministic tools to help a human think about an RFC.

The MCP server itself never calls an LLM and never builds embeddings.
Anything that needs judgement – synthesizing, comparing, pressure-testing –
lives here.

## The rule

The agent reads, clusters, strawmans, steelmans, and synthesizes – **in
chat**. Every word that lands on GitHub is typed by a human. None of the
skills below post comments, reply to threads, write to RFC bodies, or open
PRs. The only structural writes exposed by the MCP server are
`request_reviewers` (used by `suggest-reviewers`) and `merge_rfc` (no
skill).

## Install

```bash
# In Claude Code:
/plugin marketplace add PostHog/rfc-123
/plugin install rfc123-skills
```

Or clone individual `SKILL.md` files (plus their `references/`) into
`~/.claude/skills/` directly.

## Available skills

| Skill | Purpose |
|---|---|
| `discuss-rfc` | Ground a conversation about an RFC in the proposal + repo. |
| `pressure-test-rfc` | Strawman / steelman each claim; surface assumptions and missing options. |
| `compare-to-codebase` | Flag every RFC claim the actual code contradicts or omits. |
| `synthesize-discussion` | Cluster comments by theme; show the roll-up in chat. |
| `extract-action-items` | Surface explicit `@x will do Y` items as a checklist in chat. |
| `compare-alternatives` | Build an Option-A-vs-B comparison table in chat. |
| `suggest-reviewers` | Recommend reviewers from PR files + comment authors + teams. |

Each `SKILL.md` is a self-contained brief on when it applies, what RFC123
MCP tools to call, and how to format the output. References (templates,
checklists, examples) live in `<skill>/references/`.
