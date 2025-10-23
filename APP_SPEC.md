# RFC123 - app spec

## What we're building

A dead-simple web app that makes reading and commenting on RFCs (stored as GitHub PRs) actually pleasant. Think Linear's clean UI meets Oxide's RFD viewer, but for pull request-based RFCs.

## Core flows

**View RFC list**
- [x] Shows all open PRs from a configured repo (filtered to `/requests-for-comments/*.md`)
- [x] Each RFC shows: title, author, status (open/merged), created date, comment count
- [x] Click to open full RFC view

**Read an RFC**
- [x] Renders the Markdown from the PR as rich text
- [x] Shows inline comments from GitHub PR reviews in context
- [x] Clean, readable layout (not GitHub's cramped UI)
- [x] Sidebar shows metadata: author, reviewers, status, timestamps

**Comment on an RFC**
- [x] Click any line to add a comment
- [x] Comment box appears inline, similar to Linear's comment UX
- [x] Submit posts directly to GitHub as a PR review comment
- [x] Comments appear immediately after posting

**Authentication**
- [x] GitHub OAuth only
- [x] No user accounts to manage
- [x] Permissions inherited from GitHub (if you can see the repo, you can use the app)

## Technical approach

**Stack**
- [x] Next.js 16 (App Router)
- [ ] Deploy on Vercel
- [x] GitHub API v3 (REST via Octokit)
- [x] No database - everything lives in GitHub

**GitHub API integration**
- [x] Pull requests list: `/repos/{owner}/{repo}/pulls`
- [x] PR details: `/repos/{owner}/{repo}/pulls/{number}`
- [x] PR files: `/repos/{owner}/{repo}/pulls/{number}/files`
- [x] Review comments: `/repos/{owner}/{repo}/pulls/{number}/comments`
- [x] Post comment: `POST /repos/{owner}/{repo}/pulls/{number}/comments`

**Key pages**
- [x] `/` - RFC list
- [x] `/rfc/[number]` - Individual RFC view
- [x] Auth handled via NextAuth.js with GitHub provider

## Design principles

**Steal from the best**
- [x] Oxide RFD: Clean markdown rendering, good typography, obvious status indicators
- [x] Linear: Smooth comment creation, keyboard shortcuts (⌘+Enter, Esc), fast interactions

**What we're NOT building**
- [] PR approval flows (use GitHub)
- [] Diff view (link out to GitHub)
- [] File upload (not needed)
- [] Rich text editing (markdown only)
- [] Real-time collaboration (eventual consistency is fine)
- [] Any admin interface (configure via env vars)

## Config

Environment variables:
- [x] `GITHUB_ORG` - org name
- [x] `GITHUB_REPO` - repo name
- [x] `GITHUB_CLIENT_ID` - OAuth app ID
- [x] `GITHUB_CLIENT_SECRET` - OAuth secret
- [x] `AUTH_SECRET` - NextAuth secret

## Open questions

- [x] ~~Do we need to filter PRs by label (e.g., only show PRs with "rfc" label)?~~ **Filter by `.md` files in `/requests-for-comments/`**
- [x] ~~Should we show closed/merged RFCs or only open ones?~~ **Show all (open first, then merged/closed)**
- [x] ~~Do we render the full PR diff or just the markdown file?~~ **Just the markdown file from `/requests-for-comments/`**

## Success metrics

For MVP, success = people actually use it instead of reading RFCs directly on GitHub.

- [] Time spent in app > 5 min per session
- [] Comments posted through app > 10% of total PR comments
- [] Weekly active users = number of people on the team

## Out of scope for V1

- [] Notifications
- [] Search
- [] Filtering/sorting beyond basic status
- [] Mobile optimization (desktop-first)
- [] Drafts/previews
- [] Markdown editor toolbar
- [] @mentions autocomplete
- [] Emoji reactions
