# RFC123 Agent Skills

Portable instruction sets that pair with the [RFC123 MCP server](../src/app/mcp/route.ts).
Each skill teaches an AI coding assistant how to use the MCP server's deterministic
tools to perform a multi-step collaboration task on an engineering RFC.

The MCP server itself never calls an LLM and never builds embeddings. Anything
that needs judgement — drafting, synthesizing, comparing — lives here.

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
| `draft-rfc` | Turn a brief into a structured RFC body, then create the PR. |
| `synthesize-discussion` | Cluster comments by theme and post a roll-up. |
| `propose-revision` | Read RFC + threads, propose a revised body diff. |
| `compare-alternatives` | Build an Option-A-vs-B comparison table. |
| `extract-action-items` | Surface explicit `@x will do Y` items as a checklist. |
| `suggest-reviewers` | Recommend reviewers from PR files + comment authors + teams. |
| `register-decision` | Capture a decision + rationale, commit to the RFC body. |
| `resolve-threads` | Walk unresolved threads, propose replies, mark resolved. |

Each `SKILL.md` is a self-contained brief on when it applies, what RFC123
MCP tools to call, and how to format the output. References (templates,
checklists, examples) live in `<skill>/references/`.
