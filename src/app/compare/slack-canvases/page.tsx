import ComparisonTable from "@/components/ComparisonTable";
import Dingbat from "@/components/Dingbat";
import { SlackLogo } from "@/components/icons/BrandLogos";
import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "vs. Slack canvases" };

export default function SlackCanvasesComparison() {
  return (
    <MarketingDocPage eyebrow="Compare" title="RFC123 vs. Slack canvases">
      <p className="mb-10 text-lg font-light leading-tight text-gray-70">
        Slack canvases are documents that live inside Slack – in a channel, a
        DM, or the workspace at large. They&rsquo;re great when discussion is
        already happening there and you need a shared scratchpad fast. RFC123 is
        for the next step: when the decision matters enough that you&rsquo;ll
        want to find it again in a year.
      </p>

      <div className="space-y-10">
        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <SlackLogo />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Where Slack canvases are better
            </h2>
            <ul className="space-y-2.5 text-sm text-foreground">
              <li>
                <strong>Zero context switch.</strong> The doc lives in the
                channel where the conversation is already happening. RFC123
                takes you to a new tab.
              </li>
              <li>
                <strong>Lowest possible friction.</strong> Promote a thread to a
                canvas in one click. RFC123 makes you pick a repo and write
                Markdown.
              </li>
              <li>
                <strong>Workspace-wide access.</strong> Anyone in your Slack can
                read and comment – no extra account, no permissions to grant.
              </li>
              <li>
                <strong>Slack-native interactions.</strong> @-mentions,
                reactions, emoji, file uploads, threads – all the affordances
                people already use, with no relearning.
              </li>
              <li>
                <strong>Mobile parity.</strong> You&rsquo;re already on Slack
                mobile. RFC123 is desktop-first.
              </li>
              <li>
                <strong>Lightweight by design.</strong> Right for ephemeral
                thinking before anything is &ldquo;official&rdquo;.
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
                <strong>Durable record.</strong> A canvas&rsquo;s home is a
                Slack channel. An RFC&rsquo;s home is your code repo – still
                there when the channel is archived and the workspace is
                migrated.
              </li>
              <li>
                <strong>Versioning.</strong> Track how the proposal evolved
                across drafts. Canvases have a single timeline.
              </li>
              <li>
                <strong>Line-anchored comments that stay anchored.</strong>
                Comments in a long canvas tend to scroll out of context. RFC123
                lines threads up next to the lines they&rsquo;re about.
              </li>
              <li>
                <strong>Cross-repo review queue.</strong> A digest of RFCs
                awaiting your review across every repo you can access – opt-in
                to Slack, scoped to <em>your</em> reviews, not &ldquo;anywhere
                you were mentioned&rdquo;.
              </li>
              <li>
                <strong>Permission model that follows the code.</strong>
                Access mirrors the repo, not &ldquo;who happens to be in the
                workspace today&rdquo;.
              </li>
              <li>
                <strong>Agents can read it without being in Slack.</strong>
                MCP server exposes RFCs to Claude, ChatGPT, or any agent – with
                skills for pressure-testing, synthesis, and comparing to the
                codebase.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-serif text-foreground leading-none">
            Side-by-side
          </h2>
          <ComparisonTable
            themLabel="Slack canvases"
            rows={[
              {
                feature: "Time to first draft",
                them: "Seconds, in-thread",
                us: "A minute – pick repo, write Markdown",
              },
              {
                feature: "Versioning / diff",
                them: "Single timeline",
                us: "Git history: commits, authors, diffs",
              },
              {
                feature: "Comment anchoring",
                them: "Block reactions / threads",
                us: "Line-level threads on rendered Markdown",
              },
              {
                feature: "Lives where conversation is",
                them: "Yes (channel / DM)",
                us: "Separate, with optional Slack briefing",
              },
              {
                feature: "Discoverable in 12 months",
                them: "Channel-dependent",
                us: "Yes – PR in your repo",
              },
              {
                feature: "Permissions",
                them: "Slack workspace / channel",
                us: "GitHub repo",
              },
              {
                feature: "Mobile",
                them: "Strong",
                us: "Limited",
              },
              {
                feature: "Agent / MCP access",
                them: "Limited",
                us: "Yes – read-only, with skills",
              },
              {
                feature: "Markdown export",
                them: "Possible",
                us: "Native – RFCs are Markdown files in your repo",
              },
              {
                feature: "Lock-in",
                them: "Slack workspace",
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
                  Pick Slack canvases if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>
                    You&rsquo;re in the very early stages and the doc is a
                    thinking space, not a decision.
                  </li>
                  <li>
                    Your team is small enough that everyone reads everything.
                  </li>
                  <li>
                    The right home for the doc is the channel where it&rsquo;s
                    being discussed.
                  </li>
                </ul>
              </div>
              <div className="rounded-md border border-gray-20 p-5 bg-surface">
                <h3 className="mb-3 font-serif text-xl text-foreground leading-tight">
                  Pick RFC123 if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>The decision is worth finding again next quarter.</li>
                  <li>
                    Multiple repos or teams need to weigh in on the same
                    proposal.
                  </li>
                  <li>
                    You want diffable history of how the proposal changed.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingDocPage>
  );
}
