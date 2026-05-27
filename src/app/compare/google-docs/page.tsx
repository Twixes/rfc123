import ComparisonTable from "@/components/ComparisonTable";
import Dingbat from "@/components/Dingbat";
import { GoogleDocsLogo } from "@/components/icons/BrandLogos";
import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "vs. Google Docs" };

export default function GoogleDocsComparison() {
  return (
    <MarketingDocPage eyebrow="Compare" title="RFC123 vs. Google Docs">
      <p className="mb-10 text-lg font-light leading-tight text-gray-70">
        Google Docs is the documentation system most teams already know. It
        starts fast, welcomes non-engineers, and has the best prose-editing
        experience of any tool on the web. RFC123 isn&rsquo;t trying to be that.
        It&rsquo;s trying to be the place engineering decisions are proposed,
        argued, and recorded next to the code.
      </p>

      <div className="space-y-10 sm:space-y-12">
        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <GoogleDocsLogo />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Where Google Docs is better
            </h2>
            <ul className="space-y-2.5 text-sm text-foreground">
              <li>
                <strong>Real-time co-editing.</strong> Multiple cursors in the
                same paragraph. RFC123 doesn&rsquo;t do this – you write locally
                and commit when you&rsquo;re ready.
              </li>
              <li>
                <strong>Suggestion mode.</strong> Track-changes for prose is a
                genuinely better editing model than diffs for prose. RFC123 only
                has comments – it doesn&rsquo;t propose edits on text.
              </li>
              <li>
                <strong>Anyone with an email can read.</strong> No GitHub
                account required. PMs, designers, leadership, and legal can
                participate without onboarding to a new tool.
              </li>
              <li>
                <strong>Live embeds and freeform layout.</strong> Live Google
                Sheets, hand-drawn Drawings, images placed anywhere with text
                wrap. RFC123 Markdown does more than people expect (Mermaid
                diagrams, tables, code, images) but no live third-party embeds
                and no freeform placement.
              </li>
              <li>
                <strong>Mobile and offline parity.</strong> Docs is mature on
                phones and tablets, and works offline. RFC123 is desktop-first
                and shows it on small screens.
              </li>
            </ul>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="¶" className="text-cyan" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Where RFC123 is better
            </h2>
            <ul className="space-y-2.5 text-sm text-foreground">
              <li>
                <strong>Git-backed history.</strong> Every RFC carries a real
                commit chain – authors, timestamps, diffs, a merge moment. Docs
                has a revision slider; git is what your engineering team already
                trusts as the durable record.
              </li>
              <li>
                <strong>Lives next to the code.</strong> Same auth, same
                permissions, same repo as the implementation. No drift between
                &ldquo;who&rsquo;s in the workspace&rdquo; and &ldquo;who has
                access to the codebase&rdquo;.
              </li>
              <li>
                <strong>Line-anchored comments that stick.</strong> Threads
                attach to lines in the rendered Markdown – they don&rsquo;t
                drift if the text above them reflows.
              </li>
              <li>
                <strong>A review queue across all your repos.</strong> One list
                of RFCs awaiting your (or your GitHub team&rsquo;s) review,
                optionally delivered as a Slack DM in your timezone.
              </li>
              <li>
                <strong>Agent-native.</strong> Connect Claude, ChatGPT, or any
                agent over MCP for read-only access – plus pre-built skills for
                pressure-testing, comparing to the codebase, and synthesizing
                discussion.
              </li>
              <li>
                <strong>No lock-in.</strong> Walk away tomorrow; every RFC is
                still a Markdown PR in your repo.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-serif text-foreground leading-none">
            Side-by-side
          </h2>
          <ComparisonTable
            themLabel="Google Docs"
            rows={[
              {
                feature: "Real-time co-editing",
                them: "Yes",
                us: "No – write locally, commit when ready",
              },
              {
                feature: "Suggestion / track-changes",
                them: "Yes",
                us: "No – comments only",
              },
              {
                feature: "Versioning model",
                them: "Revision timeline",
                us: "Real git history: commits, authors, diffs, merge",
              },
              {
                feature: "Line-anchored comments",
                them: "Approximate (can drift with edits)",
                us: "Yes, on rendered Markdown lines",
              },
              {
                feature: "Lives with your code",
                them: "No",
                us: "Yes – same repo, same auth",
              },
              {
                feature: "Access control",
                them: "Google share / domain",
                us: "GitHub repo permissions",
              },
              {
                feature: "Cross-doc review queue",
                them: "No",
                us: "Yes – Slack briefing, opt-in, per-user timezone",
              },
              {
                feature: "Full-text search",
                them: "Yes",
                us: "Search RFC titles and PR descriptions; Markdown body search not yet",
              },
              {
                feature: "Agent / MCP access",
                them: "No (manual copy-paste)",
                us: "Yes – read-only by design, with skills",
              },
              {
                feature: "Non-engineer access",
                them: "Excellent",
                us: "Limited – requires a GitHub account",
              },
              {
                feature: "Mobile editing",
                them: "Strong",
                us: "Limited",
              },
              {
                feature: "Lock-in",
                them: "Google Workspace",
                us: "None – RFCs are PRs in your repo",
              },
            ]}
          />
        </section>

        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <Dingbat glyph="※" className="text-yellow -mt-4" size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              So which one should you pick?
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="rounded-md border border-gray-20 p-5 bg-surface">
                <h3 className="mb-3 font-serif text-xl text-foreground leading-tight">
                  Pick Google Docs if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>
                    Your reviewers include people without GitHub accounts.
                  </li>
                  <li>
                    You need multiple cursors in the same paragraph as you
                    draft.
                  </li>
                  <li>
                    The doc is cross-functional or one-off – not an engineering
                    decision you&rsquo;ll need to find in three years.
                  </li>
                </ul>
              </div>
              <div className="rounded-md border border-gray-20 p-5 bg-surface">
                <h3 className="mb-3 font-serif text-xl text-foreground leading-tight">
                  Pick RFC123 if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>
                    Your RFCs are engineering decisions, and you want them next
                    to the code.
                  </li>
                  <li>
                    You want a single review queue across every repo you can
                    access.
                  </li>
                  <li>You want agents in the loop without write access.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingDocPage>
  );
}
