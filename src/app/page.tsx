import { auth } from "@/auth";
import AccountDropdown from "@/components/AccountDropdown";
import ConnectAgentButton from "@/components/ConnectAgentButton";
import Dingbat from "@/components/Dingbat";
import { GitHubSignInForm } from "@/components/GitHubSignInForm";
import LandingShowcaseWidget from "@/components/LandingShowcaseWidget";
import { MarketingButtonLink } from "@/components/MarketingButton";
import MarketingPage from "@/components/MarketingPage";
import { NewRfcPlusIcon } from "@/components/RFCsTopBarActions";
import Tooltip from "@/components/Tooltip";

const ICON_CLASS = "w-4 h-4";

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

type LandingSession = {
  user?: {
    name?: string | null;
    image?: string | null;
  };
} | null;

function LandingNewRfcLink() {
  return (
    <MarketingButtonLink href="/rfcs/new" variant="primary">
      <NewRfcPlusIcon />
      New RFC
    </MarketingButtonLink>
  );
}

function LandingAvatar({ session }: { session: LandingSession }) {
  if (!session?.user) return null;
  return <AccountDropdown user={session.user} />;
}

function LandingDesktopActions({ session }: { session: LandingSession }) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-2">
      <ConnectAgentButton variant="secondary" label="Connect agent" />
      {session ? (
        <>
          <MarketingButtonLink href="/rfcs" variant="secondary">
            <ListIcon />
            View RFCs
          </MarketingButtonLink>
          <LandingNewRfcLink />
          <LandingAvatar session={session} />
        </>
      ) : (
        <GitHubSignInForm />
      )}
    </div>
  );
}

function LandingMobileActions({ session }: { session: LandingSession }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center justify-start gap-2">
        {session ? (
          <>
            <LandingNewRfcLink />
            <LandingAvatar session={session} />
          </>
        ) : (
          <GitHubSignInForm />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-start gap-2">
        {session && (
          <MarketingButtonLink href="/rfcs" variant="secondary">
            <ListIcon />
            View RFCs
          </MarketingButtonLink>
        )}
        <ConnectAgentButton variant="secondary" label="Connect agent" />
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const session = await auth();

  return (
    <MarketingPage below={<LandingShowcaseWidget />}>
      <div className="mb-6 sm:mb-0 grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] gap-x-2 gap-y-2 sm:grid-rows-[auto_auto]">
        <h1 className="col-start-1 row-start-1 self-center font-serif text-5xl font-normal text-foreground sm:text-6xl">
          RFC123
        </h1>
        <div className="col-start-2 row-start-1 hidden sm:block">
          <LandingDesktopActions session={session} />
        </div>
        <p className="col-span-2 row-start-2 mb-2 text-lg font-light leading-tight text-gray-70 sm:mb-4 sm:text-xl text-balance">
          The agent-native & open-source{" "}
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
        <div className="col-span-2 row-start-3 sm:hidden">
          <LandingMobileActions session={session} />
        </div>
      </div>

      <div className="mb-8 flex flex-row gap-x-6 gap-y-2 sm:gap-x-8 border-b border-gray-20 pb-6">
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

      <div className="space-y-10">
        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="¶" className="text-cyan" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none text-balance">
              Write RFCs like a cracked engineer
            </h2>
            <div className="space-y-2.5">
              <p className="text-sm text-foreground">
                <strong>Just Markdown.</strong> The format you already write in,
                with no proprietary editor or special syntax.
              </p>
              <p className="text-sm text-foreground">
                <strong>Git for documents.</strong> Every draft, every open
                review, every merged decision lives in Git, via GitHub.
                Versioning is foundational here.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="§" className="text-magenta" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none text-balance">
              Collaborate with maximum synergy
            </h2>
            <div className="space-y-2.5">
              <p className="text-sm text-foreground">
                <strong>The best interface to comment on a document.</strong>{" "}
                Threads attach to any line or selection, in both the rendered
                view and the raw Markdown editor.
              </p>
              <p className="text-sm text-foreground">
                <strong>A queue of your own.</strong> Review requests pinned at
                the top, including ones assigned to your GitHub teams. Filter by
                author or repo.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="※" className="text-yellow -mt-4" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none text-balance">
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

        <figure className="flex items-start gap-10 sm:gap-14 ml-5">
          <Dingbat glyph="❞" className="text-gray-70" />
          <div className="flex-1 min-w-0">
            <blockquote className="font-serif text-xl leading-snug text-gray-70">
              I think RFC123 might&nbsp;be{" "}
              <strong className="text-foreground">
                the&nbsp;
                <Tooltip content="We're wondering too.">
                  <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-gray-40">
                    second-best
                  </span>
                </Tooltip>{" "}
                addition to my professional&nbsp;life
              </strong>
              ! I&nbsp;love&nbsp;it.
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
              </a>{" "}
              <span className="text-gray-400">@</span>{" "}
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
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none text-balance">
              Bring your agent to the table
            </h2>
            <div className="space-y-2.5">
              <p className="text-sm text-foreground">
                <strong>
                  Connect Claude, ChatGPT, or any agent with our MCP server.
                </strong>{" "}
                One click to authorize. Your agent lists, reads, and discusses
                every RFC alongside you. It can draft for you too, but the MCP
                server won&rsquo;t let it post comments or replies on your
                behalf, so no AI slop ever lands on your team.
              </p>
              <p className="text-sm text-foreground">
                <strong>Skills for digging deep.</strong> With RFC123 skills,
                your assistant becomes an expert in comparing proposals against
                codebases, synthesizing discussions, extracting action items, or
                suggesting reviewers.
              </p>
            </div>
          </div>
        </section>
      </div>
    </MarketingPage>
  );
}
