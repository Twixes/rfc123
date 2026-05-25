import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "Terms of service" };

const SECTION_HEADING =
  "mb-3 mt-3 py-2 border-b border-gray-20 text-2xl font-sans! font-semibold! tracking-tight leading-tight text-foreground";

export default function TermsPage() {
  return (
    <MarketingDocPage eyebrow="Legal" title="Terms of service">
      <div className="max-w-2xl text-foreground leading-relaxed">
        <p className="text-lg text-gray-70">
          By using RFC123 you agree to these terms. We&rsquo;ve kept them short
          and in plain English.
        </p>

        <section>
          <h2 className={SECTION_HEADING}>What RFC123 is</h2>
          <p className="mt-2">
            RFC123 is a tool for reading and reviewing RFCs, which are written
            proposals that seek feedback on decisions, their tradeoffs, and
            implications. RFC123 works with RFCs written as markdown files in
            GitHub pull requests. It renders those pull requests as readable
            documents, attaches inline comments to specific lines, and surfaces
            daily review queues. RFC123 operates on top of your existing GitHub
            repositories.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Your account</h2>
          <p className="mt-2">
            You sign in to RFC123 with your GitHub account. We use the access
            GitHub grants us only to operate the service on your behalf: listing
            repositories and pull requests you can already see, posting comments
            and reviews you write, and, if you opt in, delivering review
            summaries to Slack.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Your content</h2>
          <p className="mt-2">
            Your RFCs, comments, and reviews live in your GitHub repository. You
            own them. RFC123 does not claim any rights over them. If you stop
            using RFC123, everything you wrote remains in your git history
            exactly where you left it.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Acceptable use</h2>
          <p className="mt-2">You agree not to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Use RFC123 to host or distribute illegal content, malware, or
              material you do not have the right to share.
            </li>
            <li>
              Harass, abuse, or spam other RFC123 users or third parties via the
              service.
            </li>
            <li>
              Use RFC123 in a way that violates GitHub&rsquo;s or Slack&rsquo;s
              terms of service.
            </li>
            <li>
              Attempt to bypass authentication, rate limits, or access controls.
            </li>
          </ul>
          <p className="mt-3">
            We may suspend or terminate access if we reasonably believe these
            terms have been broken.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Beta status</h2>
          <p className="mt-2">
            RFC123 is in beta. We may add, change, or remove features as we
            learn what works.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Pricing</h2>
          <p className="mt-2">
            RFC123 is free while we&rsquo;re in beta. If we introduce paid
            plans, we will give advance notice and let you decide whether to
            continue.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Changes to these terms</h2>
          <p className="mt-2">
            We may update these terms from time to time. The version on this
            page is always the current one. Material changes will be
            communicated where it makes sense, typically via the email
            associated with your GitHub account or a notice in the app.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Contact</h2>
          <p className="mt-2">
            Questions, requests, or concerns:{" "}
            <a
              href="mailto:michael@matloka.com"
              className="underline decoration-gray-30 underline-offset-2 hover:text-foreground hover:decoration-foreground transition-colors"
            >
              michael@matloka.com
            </a>
            .
          </p>
        </section>

        <p className="mt-10 text-sm text-gray-50">Last updated: 2026-05-25.</p>
      </div>
    </MarketingDocPage>
  );
}
