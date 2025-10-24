# RFC123

The RFC platform for teams.

1. Draft
2. Discuss
3. Distribute

RFC123 is a collaborative platform for reviewing GitHub pull requests containing RFCs (Request for Comments). It provides a streamlined interface to view and discuss PR-based RFCs with powerful inline commenting capabilities on Markdown files.

## Tech Stack

- **[Next.js 16](https://nextjs.org/)** - React framework with App Router and Server Components
- **[React 19.2](https://react.dev/)** - With experimental React Compiler for automatic optimizations
- **[NextAuth 5](https://next-auth.js.org/)** - GitHub OAuth authentication
- **[Octokit](https://github.com/octokit/octokit.js)** - GitHub API client
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Biome](https://biomejs.dev/)** - Fast linter and formatter
- **[PostHog](https://posthog.com/)** - Product analytics and error tracking

## Getting Started

### Prerequisites

- Node.js 20+ and pnpm installed
- A GitHub account
- A GitHub OAuth App (instructions below)

### 1. Create a GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: RFC123 (or your preferred name)
   - **Homepage URL**: `http://localhost:3000` (for local development)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Click "Register application"
5. Note your **Client ID** and generate a **Client Secret**

### 2. Clone and Install

```bash
git clone <your-repo-url>
cd rfc-123
pnpm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in the required values:

```bash
# GitHub OAuth App credentials
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret

# NextAuth configuration
# Generate with: openssl rand -base64 32
AUTH_SECRET=your_random_secret_here

# NextAuth URL (optional for local development)
# AUTH_URL=https://your-domain.com

# PostHog configuration (optional)
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_project_api_key
NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com
```

Generate your `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

### 4. Run the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Configure Your RFC Repository

Update the target repository in `src/lib/github.ts`:

```typescript
const owner = "your-org"; // Change to your GitHub org/user
const repo = "your-repo"; // Change to your repository name
```

RFCs should be markdown files (`.md`) located in a `requests-for-comments/` directory in your repository's pull requests.

## Available Commands

- **`pnpm dev`** - Start development server on http://localhost:3000
- **`pnpm build`** - Create production build
- **`pnpm start`** - Run production server
- **`pnpm lint`** - Run Biome linter
- **`pnpm format`** - Format code with Biome
