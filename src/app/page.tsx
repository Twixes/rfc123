import Link from "next/link";
import { auth, signIn } from "@/auth";
import AccountDropdown from "@/components/AccountDropdown";
import ConnectAgentButton from "@/components/ConnectAgentButton";
import Dingbat from "@/components/Dingbat";
import MarketingPage from "@/components/MarketingPage";
import Tooltip from "@/components/Tooltip";

const ICON_CLASS = "w-4 h-4";

function PlusIcon() {
  return (
    <svg
      className={ICON_CLASS}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Plus</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      className={ICON_CLASS}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>List</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h10"
      />
    </svg>
  );
}

const PRIMARY_BTN =
  "inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-85 cursor-pointer";
const SECONDARY_BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-gray-30 bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5 cursor-pointer";

export default async function LandingPage() {
  const session = await auth();

  return (
    <MarketingPage>
      <div className="flex justify-between items-start flex-wrap gap-2 mb-2">
        <h1 className="font-serif font-normal text-5xl sm:text-6xl text-foreground mb-0">
          RFC123
        </h1>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ConnectAgentButton variant="secondary" label="Connect agent" />
          {session ? (
            <>
              <Link href="/rfcs" className={SECONDARY_BTN}>
                <ListIcon />
                View RFCs
              </Link>
              <Link href="/rfcs/new" className={PRIMARY_BTN}>
                <PlusIcon />
                New RFC
              </Link>
              {session.user && <AccountDropdown user={session.user} />}
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("github");
              }}
            >
              <button type="submit" className={PRIMARY_BTN}>
                Sign in/up with GitHub
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="mb-4 text-lg sm:text-xl font-light leading-tight text-gray-70">
        The agent-native{" "}
        <Tooltip
          content={
            <>
              <div className="font-medium">Request for Comments</div>
              <div className="text-gray-30">
                Written proposals that seek feedback on decisions, their
                tradeoffs, and implications.
              </div>
            </>
          }
          align="start"
        >
          <abbr className="cursor-help underline decoration-dotted underline-offset-4 decoration-gray-40">
            RFC
          </abbr>
        </Tooltip>{" "}
        platform for teams.
      </p>

      <div className="mb-8 flex flex-col sm:flex-row gap-x-6 gap-y-2 sm:gap-x-8 border-b border-gray-20 pb-6">
        <div>
          <div className="mb-2 h-0.75 w-12 bg-cyan" />
          <div className="text-2xl font-serif text-foreground">1. Draft</div>
        </div>
        <div>
          <div className="mb-2 h-0.75 w-12 bg-magenta" />
          <div className="text-2xl font-serif text-foreground">2. Discuss</div>
        </div>
        <div>
          <div className="mb-2 h-0.75 w-12 bg-yellow" />
          <div className="text-2xl font-serif text-foreground">3. Decide</div>
        </div>
      </div>

      <div className="space-y-10 sm:space-y-12">
        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="¶" className="text-cyan" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Write RFCs like a cracked engineer
            </h2>
            <div className="space-y-2.5">
              <p className="text-sm text-foreground">
                <strong>Markdown in, RFC out.</strong> Pick a repo, write the
                draft. RFC123 opens the branch, the commit, and the PR.
              </p>
              <p className="text-sm text-foreground">
                <strong>GitHub all the way down.</strong> Every RFC is a PR in
                your existing repo – same auth, same permissions, same git
                history. Markdown PRs from before RFC123 are already here. Walk
                away tomorrow; the record stays in git.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="§" className="text-magenta" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Collaborate with maximum synergy
            </h2>
            <div className="space-y-2.5">
              <p className="text-sm text-foreground">
                <strong>Comment where the argument is.</strong> Threads attach
                to lines or selections, right alongside the words they&rsquo;re
                about.
              </p>
              <p className="text-sm text-foreground">
                <strong>A queue of your own.</strong> Review requests pinned at
                the top – including ones assigned to your GitHub teams. Filter
                by author or repo.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="※" className="text-yellow -mt-4" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Never miss a thing
            </h2>
            <div className="space-y-2.5">
              <p className="text-sm text-foreground">
                <strong>Your review queue, delivered to Slack.</strong> A single
                DM at the hour and timezone you choose.
              </p>
              <p className="text-sm text-foreground">
                <strong>No noise.</strong> Empty days skipped. Weekends off by
                default.
              </p>
            </div>
          </div>
        </section>

        <figure className="flex items-start gap-14 ml-5">
          <Dingbat glyph="❞" className="text-gray-70" />
          <div className="flex-1 min-w-0">
            <blockquote className="font-serif text-xl leading-snug text-gray-70">
              I think RFC123 might be{" "}
              <strong className="text-foreground">
                the second-best addition to my professional life
              </strong>
              ! I love it.
            </blockquote>
            <figcaption className="mt-1 text-sm text-gray-50">
              –{" "}
              <a
                href="https://www.linkedin.com/in/fraser-hopper-26158056/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-70 underline decoration-gray-20 decoration-1 underline-offset-2 hover:decoration-gray-50"
              >
                Fraser Hopper
              </a>
              <span className="mx-1.5 text-gray-400">•</span>
              <a
                href="https://www.posthog.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-70 underline decoration-gray-20 decoration-1 underline-offset-2 hover:decoration-gray-50"
              >
                PostHog
              </a>
            </figcaption>
          </div>
        </figure>

        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="◆" className="text-cyan -mt-4" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Bring your agent to the table
            </h2>
            <div className="space-y-2.5">
              <p className="text-sm text-foreground">
                <strong>
                  Connect Claude, ChatGPT, or any agent with our MCP server.
                </strong>{" "}
                One click to authorize – then it can list, read, and discuss
                RFCs alongside you. No slop here, as the agent can read, but{" "}
                <em>not</em> write for you.
              </p>
              <p className="text-sm text-foreground">
                <strong>Instructions for digging deep.</strong> With RFC123
                skills, your assistant becomes an expert in comparing proposals
                against codebases, synthesizing discussions, extracting action
                items, or suggesting reviewers.
              </p>
            </div>
          </div>
        </section>
      </div>
    </MarketingPage>
  );
}
