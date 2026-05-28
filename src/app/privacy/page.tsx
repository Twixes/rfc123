import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "Privacy policy" };

const SECTION_HEADING =
  "mb-3 mt-3 py-2 border-b border-gray-20 text-2xl font-sans! font-semibold! tracking-tight leading-tight text-foreground";

export default function PrivacyPage() {
  return (
    <MarketingDocPage eyebrow="Legal" title="Privacy policy">
      <div className="max-w-2xl text-foreground leading-relaxed">
        <p className="text-lg text-gray-70">
          This explains what RFC123 collects, what it doesn&rsquo;t, and what we
          do with it. We try to keep things to the minimum needed to make the
          product work.
        </p>

        <section>
          <h2 className={SECTION_HEADING}>What we collect</h2>
          <p className="mt-2">
            When you sign in with GitHub, we keep information about your GitHub
            account so we can recognize you on return visits and operate the
            service on your behalf.
          </p>
          <p className="mt-3">
            We also keep the settings you choose inside RFC123.
          </p>
          <p className="mt-3">
            We use analytics to understand how RFC123 is used and to catch bugs.
            This captures page views, basic device and browser information, and
            uncaught errors. See <em>Cookies and analytics</em> below.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>What we don&rsquo;t do</h2>
          <p className="mt-2">
            We don&rsquo;t take payment information. RFC123 is free during beta.
          </p>
          <p className="mt-3">
            We don&rsquo;t sell your data, run advertising networks, or use your
            content to train AI models.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Who we share with</h2>
          <p className="mt-2">
            RFC123 relies on a small set of third-party services to operate.
            Data flows to these providers only as needed to deliver the features
            described above:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>GitHub</strong>: authentication and the source of all RFC
              content.
            </li>
            <li>
              <strong>Slack</strong>: only if you connect a workspace, for
              delivering the daily briefing DM.
            </li>
            <li>
              <strong>Convex</strong>: our database provider.
            </li>
            <li>
              <strong>PostHog</strong>: analytics and error tracking.
            </li>
          </ul>
          <p className="mt-3">
            Some of these providers operate from the United States, and your
            data may be processed there.
          </p>
          <p className="mt-3">We do not share your data with anyone else.</p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>How long we keep it</h2>
          <p className="mt-2">
            We keep what we collect until you ask us to delete it. We
            don&rsquo;t auto-delete on inactivity, because people often return
            to RFC123 after a break and expect their settings to still be there.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Deleting your data</h2>
          <p className="mt-2">
            To delete your RFC123 data, email{" "}
            <a
              href="mailto:michael@matloka.com"
              className="underline decoration-gray-30 underline-offset-2 hover:text-foreground hover:decoration-foreground transition-colors"
            >
              michael@matloka.com
            </a>{" "}
            with the subject &ldquo;Delete my data&rdquo; or similar. We will
            remove your records and disconnect any integrations within 30 days.
          </p>
          <p className="mt-3">
            Your GitHub content is not affected by this. That stays in your
            repository.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Cookies and analytics</h2>
          <p className="mt-2">
            We use cookies for product analytics on every RFC123 page, including
            before you sign in. They help us understand how RFC123 is used and
            catch bugs. We never use them for advertising or cross-site
            tracking.
          </p>
          <p className="mt-3">
            You can block these cookies via your browser settings, an
            ad-blocker, or a privacy extension. RFC123 will continue to work
            normally without them.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Updates</h2>
          <p className="mt-2">
            We may update this policy. The version on this page is always the
            current one.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Contact</h2>
          <p className="mt-2">
            Questions, concerns, or requests:{" "}
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
