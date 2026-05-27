import ComparisonTable from "@/components/ComparisonTable";
import Dingbat from "@/components/Dingbat";
import { GitHubLogo } from "@/components/icons/BrandLogos";
import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "vs. plain GitHub" };

export default function PlainGitHubComparison() {
  return (
    <MarketingDocPage eyebrow="Compare" title="RFC123 vs. plain GitHub">
      <p className="mb-10 text-lg font-light leading-tight text-gray-70">
        This comparison is unusual: RFC123 <em>is</em> Markdown PRs on GitHub.
        Every RFC opens a real PR in your repo, with the same auth and the same
        permissions. So if you already run RFCs as Markdown PRs and it&rsquo;s
        working, you have most of the value already. RFC123 adds a reading
        layer, a cross-repo queue, and an agent surface on top – that&rsquo;s
        the whole difference.
      </p>

      <div className="space-y-10 sm:space-y-12">
        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <GitHubLogo />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Where plain GitHub is better
            </h2>
            <ul className="space-y-2.5 text-sm text-foreground">
              <li>
                <strong>Zero new tools.</strong> Everyone on your team already
                has the account. No onboarding, no extra trust boundary, no
                third-party reading your repo on your behalf.
              </li>
              <li>
                <strong>Full review feature surface.</strong> CODEOWNERS,
                required reviewers, suggested changes, &ldquo;viewed&rdquo;
                tracking. RFC123 inherits these (the PR is real) but
                doesn&rsquo;t add UI for all of them – you may still need the
                GitHub UI for the advanced bits.
              </li>
              <li>
                <strong>Code and RFC in the same review.</strong> When the RFC
                ships with an implementation, a plain PR puts both in one diff
                view. RFC123 splits attention between the reading view and the
                diff.
              </li>
              <li>
                <strong>GitHub-native everywhere.</strong> Web UI, the{" "}
                <code>gh</code> CLI, IDE extensions, the GitHub mobile app.
                RFC123 only ships a web reading view today.
              </li>
              <li>
                <strong>The PR UI you already know.</strong> Even with RFC123 in
                the picture, your reviewers can keep using the GitHub UI
                directly – both surfaces work on the same underlying PR.
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
                <strong>Reading view, not diff view.</strong> GitHub renders
                Markdown in &ldquo;Files changed&rdquo;, but the default review
                experience is a code diff. RFC123 renders the Markdown and
                overlays comments on the lines – the way you actually want to
                read an RFC.
              </li>
              <li>
                <strong>Line-anchored comments in rendered prose.</strong> On
                GitHub you comment on diff lines. On RFC123 you comment on the
                line you&rsquo;re reading, even after the Markdown has been
                formatted, with code blocks and images, in the layout the author
                intended.
              </li>
              <li>
                <strong>Cross-repo review queue.</strong> GitHub&rsquo;s
                review-requests filter works inside one repo at a time. RFC123
                shows every RFC awaiting your (or your GitHub team&rsquo;s)
                review across every repo you can access, in one list.
              </li>
              <li>
                <strong>Team review requests, resolved properly.</strong>
                When an RFC is assigned to a GitHub team you belong to, RFC123
                surfaces it in your queue.
              </li>
              <li>
                <strong>Slack briefings.</strong> A daily DM with what&rsquo;s
                on your plate. Per-user timezone, weekends off, empty days
                skipped. GitHub email and web notifications are noisier and less
                specific to &ldquo;what do I owe a review on&rdquo;.
              </li>
              <li>
                <strong>Agent-native by design.</strong> MCP server with a
                deliberate read-only contract – no LLM-written comments – and
                pre-built skills for synthesis, pressure-testing, comparing to
                the codebase, and suggesting reviewers. GitHub&rsquo;s
                general-purpose agent surfaces are write-capable and not
                RFC-aware.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-serif text-foreground leading-none">
            Side-by-side
          </h2>
          <ComparisonTable
            themLabel="Plain GitHub"
            rows={[
              {
                feature: "Backed by GitHub PRs",
                them: "Yes",
                us: "Yes – same PRs, same git history",
              },
              {
                feature: "Default reading experience",
                them: "Code diff",
                us: "Rendered Markdown with line-aligned comments",
              },
              {
                feature: "Comments on rendered Markdown",
                them: "“Files changed” → eye icon, no commenting",
                us: "Yes – line-anchored on the rendered page",
              },
              {
                feature: "Cross-repo review queue",
                them: "One repo at a time",
                us: "All your repos in one list",
              },
              {
                feature: "GitHub team review requests in your queue",
                them: "Notifications only",
                us: "Yes, with filtering",
              },
              {
                feature: "Slack briefing",
                them: "No",
                us: "Yes – per-user timezone, weekends off",
              },
              {
                feature: "CODEOWNERS, required reviewers, suggested changes",
                them: "Yes",
                us: "Inherits from your repo",
              },
              {
                feature: "gh CLI / IDE extensions",
                them: "Yes",
                us: "No – web reading view only",
              },
              {
                feature: "Mobile",
                them: "GitHub mobile app",
                us: "Limited",
              },
              {
                feature: "Agent / MCP access",
                them: "General-purpose GitHub MCPs (write-capable)",
                us: "RFC-specific, read-only by design, with skills",
              },
              {
                feature: "Lock-in",
                them: "None",
                us: "None – same PRs you’d have anyway",
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
                  Pick plain GitHub if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>
                    Your team is small enough that one repo&rsquo;s PR list{" "}
                    <em>is</em> your queue.
                  </li>
                  <li>
                    You read RFCs in diff view comfortably and don&rsquo;t want
                    a new tool.
                  </li>
                  <li>
                    The RFC ships with code, and you want both in the same diff.
                  </li>
                </ul>
              </div>
              <div className="rounded-md border border-gray-20 p-5 bg-surface">
                <h3 className="mb-3 font-serif text-xl text-foreground leading-tight">
                  Pick RFC123 if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>You want a reading view that isn&rsquo;t a diff.</li>
                  <li>You want one queue across every repo you review in.</li>
                  <li>
                    You want a daily Slack digest of what&rsquo;s awaiting{" "}
                    <em>you</em>.
                  </li>
                  <li>You want agents to participate, read-only.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingDocPage>
  );
}
