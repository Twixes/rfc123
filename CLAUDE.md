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
- **Lint**: `pnpm lint` - Runs Biome linter
- **Format**: `pnpm format` - Formats code with Biome

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
- Requests `read:user user:email repo` GitHub scopes
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

### Styling

- Uses Tailwind CSS 4 with custom CSS variables defined in src/app/globals.css
- Design feel: paper-like — slightly tinted neutral `--background` with `bg-surface` (white) cards sitting on top, 1px hairline borders (`border-gray-20`), `rounded-md` cards
- Typography: serif headings via `--font-instrument-serif` (Instrument Serif, used for `h1`/`h2` and `font-serif` utilities); body and `h3`+ in sans via `--font-geist` (Geist)
- Accent colors (`--cyan`, `--magenta`, `--yellow` and their `-light` variants) are muted and used sparingly for status, highlights, and focus rings — not as primary surfaces
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
