import ComparisonTable from "@/components/ComparisonTable";
import Dingbat from "@/components/Dingbat";
import { NotionLogo } from "@/components/icons/BrandLogos";
import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "vs. Notion" };

export default function NotionComparison() {
  return (
    <MarketingDocPage eyebrow="Compare" title="RFC123 vs. Notion">
      <p className="mb-10 text-lg font-light leading-tight text-gray-70">
        Notion is a flexible documentation system that rewards teams who go
        all-in. Pages, databases, internal links, embeds – it can hold an entire
        company&rsquo;s knowledge. RFC123 isn&rsquo;t trying to be that.
        It&rsquo;s trying to be the place engineering decisions are proposed,
        argued, and recorded next to the code.
      </p>

      <div className="space-y-10">
        <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
          <NotionLogo />
          <div className="flex-1 min-w-0">
            <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
              Where Notion is better
            </h2>
            <ul className="space-y-2.5 text-sm text-foreground">
              <li>
                <strong>Structured databases.</strong> Status, owner, deadline,
                tags – with sort, filter, kanban, and calendar views. RFC123 has
                none of this beyond the GitHub labels on the underlying PR.
              </li>
              <li>
                <strong>Internal linking across docs.</strong> RFCs that
                reference project pages, OKRs, customer notes – all in the same
                graph. RFC123 RFCs link by URL, which is enough, but not
                connected.
              </li>
              <li>
                <strong>Live embeds and interactive blocks.</strong> Figma
                frames update in place, Loom videos play inline, toggle and
                callout blocks shape the reading. RFC123 Markdown does more than
                people expect (Mermaid diagrams, tables, code, images), but no
                live third-party embeds and no interactive blocks.
              </li>
              <li>
                <strong>Cross-functional reach.</strong> PMs, designers,
                leadership, and support are already in Notion. RFC123 needs them
                to have a GitHub account.
              </li>
              <li>
                <strong>Mobile and full-text search.</strong> Notion&rsquo;s
                mobile editing and search across the workspace are mature.
                RFC123 searches RFC titles and PR descriptions, but not yet
                inside the Markdown body itself.
              </li>
              <li>
                <strong>Templates with structured properties.</strong> Notion
                templates carry typed fields. RFC123 templates are Markdown
                files in your repo – they can&rsquo;t enforce, say, &ldquo;every
                RFC has an owner and a status&rdquo;.
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
                <strong>Git-backed history.</strong> RFCs change shape between
                drafts; RFC123 records that as a commit chain with authors,
                timestamps, and diffs. Notion has a page history slider, but
                it&rsquo;s a single timeline – not a structured record an
                engineer can audit.
              </li>
              <li>
                <strong>Lives with the code.</strong> Same repo as the
                implementation. Permissions follow the repo, not a separately
                managed workspace that has to be kept in sync.
              </li>
              <li>
                <strong>Line-anchored comments in reading view.</strong>
                Comments attach to specific lines of the rendered prose, aligned
                in a margin sidebar. Notion comments are block-level and inline
                – good, but not the way most engineers read RFCs.
              </li>
              <li>
                <strong>A review queue, optionally in Slack.</strong> A single
                feed of RFCs awaiting your review across all your repos. Notion
                has mentions and an inbox – not &ldquo;what do I owe a review
                on&rdquo;.
              </li>
              <li>
                <strong>Skills, not just MCP access.</strong> Notion has an MCP
                server too – most serious tools do now. What RFC123 adds on top
                are opinionated, RFC-aware skills: pressure-test a proposal,
                compare it to the codebase, synthesize discussion, extract
                action items, suggest reviewers. Plus a read-only MCP contract
                so the agent can&rsquo;t post on your behalf.
              </li>
              <li>
                <strong>No lock-in.</strong> Markdown PRs in your repo – git is
                the source of truth, not a SaaS workspace.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-serif text-foreground leading-none">
            Side-by-side
          </h2>
          <ComparisonTable
            themLabel="Notion"
            rows={[
              {
                feature: "Versioning prose",
                them: "Page history slider",
                us: "Real git history: commits, authors, diffs, merge",
              },
              {
                feature: "Structured properties (status, owner, deadline)",
                them: "Yes (databases)",
                us: "GitHub labels only",
              },
              {
                feature: "Internal links across docs",
                them: "Native graph",
                us: "URL-based",
              },
              {
                feature: "Rich embeds (Figma, Loom, etc.)",
                them: "Yes",
                us: "Markdown only",
              },
              {
                feature: "Comment anchoring",
                them: "Block-level, inline",
                us: "Line-level, margin sidebar on rendered Markdown",
              },
              {
                feature: "Lives with code",
                them: "No",
                us: "Yes – same repo, same auth",
              },
              {
                feature: "Access control",
                them: "Workspace + per-page",
                us: "GitHub repo permissions",
              },
              {
                feature: "Cross-doc review queue",
                them: "Mentions + inbox",
                us: "Per-user queue with optional Slack briefing",
              },
              {
                feature: "Full-text search",
                them: "Yes",
                us: "Titles and PR descriptions; Markdown body search not yet",
              },
              {
                feature: "Agent / MCP access",
                them: "Yes – write-capable",
                us: "Yes – read-only by design, with RFC-specific skills",
              },
              {
                feature: "Non-engineer access",
                them: "Excellent",
                us: "Limited – requires a GitHub account",
              },
              {
                feature: "Mobile",
                them: "Strong",
                us: "Limited",
              },
              {
                feature: "Lock-in",
                them: "Notion workspace; export available",
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
                  Pick Notion if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>
                    Your RFCs sit inside a larger product wiki that crosses
                    functions.
                  </li>
                  <li>
                    You want structured properties (status, owner, dates) and
                    database views.
                  </li>
                  <li>
                    Embedded designs, recordings, or calendar context matter to
                    the doc.
                  </li>
                </ul>
              </div>
              <div className="rounded-md border border-gray-20 p-5 bg-surface">
                <h3 className="mb-3 font-serif text-xl text-foreground leading-tight">
                  Pick RFC123 if
                </h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li>
                    RFCs are an engineering artifact and you want them next to
                    the code.
                  </li>
                  <li>
                    You want a real git history of how the proposal evolved –
                    commits, authors, diffs, a merge moment.
                  </li>
                  <li>
                    You want agents to participate in discussion without write
                    access.
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
