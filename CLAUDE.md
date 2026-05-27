# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RFC123 is a Next.js application for reviewing GitHub pull requests containing RFCs (Request for Comments). It provides an interface to view PR-based RFCs from a specified GitHub repository, with inline commenting capabilities on markdown files.

## Environment Setup

1. **Install dependencies**: `pnpm install`
2. **Configure environment variables**: Copy `.env.example` to `.env.local` and fill in:
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` - GitHub OAuth App credentials
   - `AUTH_SECRET` - Generate with: `openssl rand -base64 32`
   - `AUTH_URL` - Production deployment URL (optional for local dev)

## Common Commands

- **Development server**: `pnpm dev` - Starts Next.js dev server on http://localhost:3000
- **Build**: `pnpm build` - Creates production build
- **Production server**: `pnpm start` - Runs production build
- **Lint**: `pnpm lint` - Runs Biome linter (`biome check`)
- **Format**: `pnpm format` - Formats code with Biome
- **Type-check**: `pnpm typecheck` - `tsc --noEmit`
- **Tests**: `pnpm test` (Vitest, single run) / `pnpm test:watch`. Run a single file with `pnpm test src/lib/foo.test.ts`; tests currently live next to the modules in `src/lib/`.
- **Pre-commit**: Husky + `lint-staged` run `biome check --write` on staged JS/TS/JSON/CSS automatically – don't bypass with `--no-verify`.

## Architecture

### Core Technology Stack

- **Next.js 16** with App Router and React Server Components
- **React 19.2** with React Compiler enabled (experimental compiler optimizations)
- **NextAuth 5** for GitHub OAuth authentication
- **Octokit** for GitHub API interactions
- **Biome** for linting and formatting (not ESLint/Prettier)
- **Tailwind CSS 4** for styling

### Authentication Flow

The app uses NextAuth with GitHub OAuth (src/auth.ts):
- Requests `read:user user:email repo read:org` GitHub scopes (`read:org` is required to resolve team-review-request slugs in the GraphQL `listRFCs` query and team memberships for the briefing)
- Stores GitHub access token in JWT session for API calls
- Access token is required to fetch PR data and post comments
- Unauthenticated users are redirected to `/api/auth/signin`

### GitHub Integration (src/lib/github.ts)

The app interacts with GitHub PRs that contain `.md` files (RFC content can live in any directory, e.g. `/engineering/`):

- **`listRFCs()`** - Fetches all PRs from target repo, filters for RFC markdown files, returns list with comment counts
- **`getRFCDetail()`** - Fetches specific PR with markdown content, comments, and reviewer information
- **`postComment()`** - Posts either a review comment (on specific line/path) or general issue comment
- **Path helpers** (`src/lib/markdown-assets.ts`, re-exported from `github.ts`) - `normalizeRepoPath`, `resolveMarkdownImageRepoPath`, `isRelativeMarkdownAssetSrc` resolve repo-relative image paths the same way GitHub does (relative to the markdown file, or repo root when there is no `.md` file). Kept in a separate module so client components do not import server-only `github.ts`.

Key interfaces:
- `RFC` - Basic PR metadata with comment counts
- `RFCDetail` - Extended RFC with markdown content, `markdownFilePath`, `headRef` (PR head branch for fetching repo files), comments, and reviewers
- `Comment` - Individual comment with optional line/path for inline comments

### Routing Structure

- `/` - Landing page (src/app/page.tsx)
- `/rfcs` - Homepage listing all RFCs (src/app/rfcs/page.tsx)
- `/rfcs/[owner]/[repo]/[number]/[[...slug]]` - Individual RFC detail (optional slug segment for readable URLs; src/app/rfcs/[owner]/[repo]/[number]/[[...slug]]/page.tsx)
- `/invite` - Pre-auth landing for deep links to RFC pages (src/app/invite/page.tsx)
- `/api/auth/[...nextauth]` - NextAuth authentication endpoints
- `/api/rfcs/*` - JSON APIs for RFC list/detail and comments
- `/api/comment` - POST endpoint for submitting comments
- `/api/github-image` - GET proxy for allowlisted GitHub-hosted images (e.g. issue/PR uploads on `github.com/user-attachments/...` and `private-user-images.githubusercontent.com`); requires session
- `/api/rfc-asset` - GET proxy for files in the repo at the PR head ref (used for relative markdown images so private repos work); uses Octokit Contents API; `Content-Type` from `src/lib/asset-mime.ts` (magic bytes + SVG sniff + extension fallback)
- `/rfcs/new` - "Start an RFC" flow; `/settings` - per-user notification + Slack workspace settings
- `/mcp` - Streamable HTTP MCP endpoint (see "MCP server" below); OAuth discovery served from `src/app/.well-known/oauth-authorization-server` and `oauth-protected-resource`, token/register/authorize endpoints under `/api/mcp-oauth/*`

### Inline Commenting System

The core feature is line-by-line commenting on RFC markdown files. This is implemented through several interconnected components:

**InlineCommentableMarkdown** (src/components/InlineCommentableMarkdown.tsx):
- Main component rendering markdown with line numbers and comment UI
- Rewrites image `src`: relative paths → `/api/rfc-asset` (repo files at `headRef`); `github.com` user-attachment URLs → `/api/github-image`
- Uses two-column layout: markdown content + comments sidebar (400px fixed width)
- Tracks line positions by injecting invisible markers via rehype plugin
- Supports commenting by clicking line numbers or selecting text
- Handles comment positioning to prevent overlaps (cascading push-down algorithm)

**rehypeLineMarkers** (src/lib/rehype-line-markers.ts):
- Custom rehype plugin that injects `<span id="line-marker-{lineNum}">` elements
- Enables accurate line position calculation after markdown rendering
- Special handling for code blocks (each line gets its own marker)
- Adds `data-line-element` attributes for hover styling

**LineCommentBox** (src/components/LineCommentBox.tsx):
- Form for submitting new comments on a specific line
- Positioned absolutely based on calculated line offsets

**ExistingLineComments** (src/components/ExistingLineComments.tsx):
- Displays existing comments for a line with reply functionality
- Positioned absolutely to align with corresponding markdown lines

**Comment positioning algorithm**:
1. Calculate base positions from line markers in the DOM
2. Process all comment boxes top-to-bottom
3. Track the bottom edge of each box
4. If next box would overlap, push it down below previous box
5. Maintains 8px gap between boxes

### Server Actions

The app uses Next.js server actions for mutations where applicable:
- Inline review comments are posted from the client via `fetch("/api/comment", ...)` in `RFCDetailClient` (src/app/rfcs/[owner]/[repo]/[number]/[[...slug]]/RFCDetailClient.tsx)
- Log out action in src/app/page.tsx - Handles user logout

### MCP server and agent skills

RFC123 ships an MCP surface paired with portable agent skills – the "agent-native" half of the product.

- **MCP server** lives in `src/app/mcp/route.ts` (`createMcpHandler` + `withMcpAuth` from `mcp-handler`). Single Streamable HTTP endpoint at `/mcp` (SSE is intentionally not exposed). Capabilities are registered in `src/lib/mcp-server.ts`; tool implementations call GitHub directly via the user's stored token. **Design rule (do not break)**: the MCP server is read+route only – it never calls an LLM, never builds embeddings, and never posts comments/replies/reviews/RFC bodies. The only structural writes are `request_reviewers` and `merge_rfc`. Anything that requires judgement (synthesis, comparison, pressure-testing) belongs in a skill, not a tool.
- **OAuth**: every MCP request carries a Bearer token minted by `/api/mcp-oauth/token`; metadata is served from `.well-known/oauth-authorization-server` + `oauth-protected-resource`. Token state lives in Convex (`convex/mcpOAuth.ts`); resolution helpers and the SHA-256 fingerprint live in `src/lib/mcp-oauth.ts`.
- **Skills** live in `skills/` (`discuss-rfc`, `pressure-test-rfc`, `compare-to-codebase`, `synthesize-discussion`, `extract-action-items`, `compare-alternatives`, `suggest-reviewers`). Each is a self-contained `SKILL.md` plus `references/`. The catalog is exposed over MCP at `rfc123://skills/catalog` and is also installable via `/plugin install rfc123-skills`. See `skills/README.md` for the canonical philosophy.

### Observability (PostHog)

`instrumentation.ts` boots `posthog-node` on the Node runtime and wires Next.js's `onRequestError` hook for server-side error tracking; `instrumentation-client.ts` initializes `posthog-js` in the browser. The server singleton lives in `src/lib/posthog-server.ts`. Both require `NEXT_PUBLIC_POSTHOG_KEY`; missing keys disable capture rather than crash.

Source maps for Error Tracking are uploaded during the Vercel build via `@posthog/nextjs-config` (`withPostHogConfig` in `next.config.ts`). The wrapper is only applied when `POSTHOG_PERSONAL_API_KEY` is set, so local `pnpm build` is a no-op. On Vercel set `POSTHOG_PERSONAL_API_KEY` (personal API key with `error tracking: write`) and `POSTHOG_PROJECT_ID`; `deleteAfterUpload: true` strips `.map` files from the final bundle.

### Styling

- Uses Tailwind CSS 4 with custom CSS variables defined in src/app/globals.css
- Design feel: paper-like – slightly tinted neutral `--background` with `bg-surface` (white) cards sitting on top, 1px hairline borders (`border-gray-20`), `rounded-md` cards
- Typography: serif headings via `--font-l-serif` (a locally hosted Lastik at `src/app/fonts/L-Variable.woff2`, used for `h1`/`h2` and `font-serif` utilities); body and `h3`+ in sans via `--font-geist` (Geist)
- Accent colors (`--cyan`, `--magenta`, `--yellow` and their `-light` variants) are muted and used sparingly for status, highlights, and focus rings – not as primary surfaces
- Line hover effect: yellow left border + gray background

## Development Notes

- **React Compiler**: Enabled in next.config.ts for automatic memoization
- **Markdown rendering**: Uses react-markdown with rehype-highlight for syntax highlighting and remark-gfm for GitHub Flavored Markdown
- **Type safety**: Some session type assertions are used due to NextAuth 5 beta type limitations
- **API rate limits**: Be aware of GitHub API rate limits when fetching RFC data
- **Line numbers**: Line numbers in the UI are 1-indexed to match standard editor conventions

## Key Files to Understand

- `src/lib/github.ts` - All GitHub API interactions (re-exports path helpers from `markdown-assets.ts`)
- `src/lib/markdown-assets.ts` - Pure repo-relative image path helpers (client-safe; do not import `github.ts` from client components)
- `src/lib/asset-mime.ts` - MIME type for proxied repo assets (sniffing, not filename-only)
- `src/lib/rehype-line-markers.ts` - Line position tracking mechanism
- `src/components/InlineCommentableMarkdown.tsx` - Core commenting UI and positioning logic
- `src/app/api/github-image/route.ts` - Proxy for GitHub attachment image URLs
- `src/app/api/rfc-asset/route.ts` - Proxy for in-repo files (images, etc.) referenced from RFC markdown
- `src/auth.ts` - Authentication configuration
- `src/app/globals.css` - Design system colors and global styles

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

### Convex usage in this project

Convex stores user notification preferences and Slack workspace installs
(`convex/schema.ts`). The Next.js app calls Convex from server routes via
`ConvexHttpClient` (see `src/lib/convex.ts`), passing
`SECRET_KEY` as the first argument to every public function. We
do not use Convex Auth or the client-side reactive provider yet – that's a
follow-up.

### Daily Slack briefing

Two parts:

- **Convex cron** (`convex/crons.ts`, `convex/notifications.ts`) – fires
  hourly on the hour and POSTs to `${NEXTAUTH_URL}/api/internal/run-briefing`
  with `SECRET_KEY`. `NEXTAUTH_URL` doubles as the single source of truth
  for the externally-visible app URL (set on Convex too via
  `npx convex env set NEXTAUTH_URL <https://...>`).
- **Next.js worker** (`src/app/api/internal/run-briefing/route.ts`) –
  fetches enabled users from Convex, decides who is due (per-user IANA
  timezone, skip weekends, idempotent via `lastSentYmdLocal`), pulls each
  one's open non-draft RFCs awaiting their review (direct or
  team-requested), sends a Slack DM via the bot token of their active
  workspace. `/api/internal/send-briefing-now` is the manual "send to me
  now" variant exposed in the settings UI.

Slack OAuth lives at `/api/slack/install` and
`/api/slack/oauth/callback`. The Slack app manifest is at
`slack-app-manifest.json` (paste into "Create app from manifest" on
api.slack.com/apps to bootstrap).

#### TODOs (not done in the initial briefing PR)

- Move GitHub token handling from OAuth-token-in-Convex to a GitHub App
  with installation tokens (smaller blast radius if Convex is breached).
- Migrate auth to Convex Auth so we can drop the shared-secret gating and
  use `ConvexProviderWithAuth` on the client for reactive queries.
