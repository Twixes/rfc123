# RFC123

The RFC platform for teams: **1. draft, 2. discuss, 3. distribute.**

RFC123 is a collaborative platform for reviewing GitHub pull requests containing RFCs (Request for Comments). It provides a streamlined interface to view and discuss PR-based RFCs with powerful inline commenting capabilities on markdown files.

## Features

- **GitHub Integration** - Connect with your GitHub repositories to fetch RFCs directly from pull requests
- **Inline Commenting** - Comment on specific lines of RFC markdown files with a visual, side-by-side interface
- **Real-time Collaboration** - See all comments and discussions from your team in one place
- **GitHub OAuth** - Secure authentication using your GitHub account
- **Modern UI** - Clean, brutalist design with high contrast and excellent readability

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

## Project Structure

```
rfc-123/
├── src/
│   ├── app/                      # Next.js App Router pages
│   │   ├── rfcs/                 # RFC listing and detail pages
│   │   ├── api/auth/             # NextAuth endpoints
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Landing page
│   │   └── globals.css           # Global styles and design system
│   ├── components/               # React components
│   │   ├── InlineCommentableMarkdown.tsx  # Core commenting UI
│   │   ├── LineCommentBox.tsx    # New comment form
│   │   └── ExistingLineComments.tsx       # Comment display
│   ├── lib/
│   │   ├── github.ts             # GitHub API integration
│   │   └── rehype-line-markers.ts # Line tracking plugin
│   ├── providers/                # React context providers
│   └── auth.ts                   # NextAuth configuration
├── public/                       # Static assets
├── .env.example                  # Environment variables template
└── package.json
```

## How It Works

### Authentication Flow

1. User clicks "Sign in with GitHub"
2. GitHub OAuth redirects back with authorization code
3. NextAuth exchanges code for access token
4. Access token is stored in session and used for GitHub API calls
5. User can now view RFCs and post comments

### RFC Fetching

RFCs are fetched from GitHub pull requests that contain `.md` files in the `requests-for-comments/` directory:

- `listRFCs()` - Fetches all open PRs and filters for RFC markdown files
- `getRFCDetail()` - Fetches specific PR with full markdown content and comments
- Comment counts are calculated from PR review comments and general issue comments

### Inline Commenting System

The inline commenting feature is the core of RFC123:

1. **Markdown Rendering** - RFC markdown is rendered with line numbers
2. **Line Markers** - A custom rehype plugin injects invisible markers at each line
3. **Position Calculation** - JavaScript calculates the pixel position of each line
4. **Comment Boxes** - Comment forms and existing comments are positioned absolutely
5. **Overlap Prevention** - A cascading algorithm prevents comment boxes from overlapping
6. **GitHub Integration** - Comments are posted as GitHub review comments on specific lines

The system supports:
- Clicking line numbers to add comments
- Selecting text to comment on specific ranges
- Viewing existing comments aligned with their lines
- Replying to existing comment threads

## Deployment

### Production Deployment

1. Deploy to your hosting platform (Vercel, etc.)
2. Update your GitHub OAuth App callback URL to your production domain
3. Set `AUTH_URL` in production environment variables to your domain
4. Ensure all environment variables are configured in your hosting platform

### Environment Variables for Production

Make sure to set these in your hosting platform:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `AUTH_SECRET`
- `AUTH_URL` (your production domain)
- `NEXT_PUBLIC_POSTHOG_KEY` (optional)
- `NEXT_PUBLIC_POSTHOG_HOST` (optional)

## Contributing

This is a personal/team project. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

This project uses Biome for linting and formatting. Run `pnpm lint` before committing.

## License

[Add your license here]

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Markdown rendering by [react-markdown](https://github.com/remarkjs/react-markdown)
- Syntax highlighting by [highlight.js](https://highlightjs.org/)
- Icons and UI inspiration from brutalist design principles
