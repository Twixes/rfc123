import Link from "next/link";
import { auth, signIn } from "@/auth";
import Dingbat from "@/components/Dingbat";
import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "Pricing" };

const PRIMARY_BTN =
  "inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-85 cursor-pointer";

const FEATURES = [
  "Unlimited RFCs in any GitHub repo you can access",
  "Inline line-level comments and threaded reviews",
  "Daily Slack review briefings, on your timezone",
  "MCP server access – bring Claude, ChatGPT, or any agent",
  "Agent skills for deep, repo-aware collaboration",
];

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Included</title>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default async function PricingPage() {
  const session = await auth();

  return (
    <MarketingDocPage eyebrow="Product" title="Pricing">
      <p className="mb-10 text-lg font-light leading-tight text-gray-70">
        Free while we&rsquo;re in beta.
      </p>

      <div className="rounded-md border border-gray-20 p-6 sm:p-10 mb-12">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-6 pb-6 border-b border-gray-20">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-70 mb-2">
              Beta
            </div>
            <div className="font-serif text-6xl text-foreground leading-none">
              Free
            </div>
          </div>
          <p className="text-sm text-gray-70 sm:text-right max-w-xs">
            $0/month till General Availability.
          </p>
        </div>

        <ul className="space-y-3 mb-8">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex gap-3 text-sm text-foreground">
              <CheckIcon />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {session ? (
          <Link href="/rfcs/new" className={PRIMARY_BTN}>
            Start an RFC →
          </Link>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("github");
            }}
          >
            <button type="submit" className={PRIMARY_BTN}>
              Sign in with GitHub →
            </button>
          </form>
        )}
      </div>

      <section className="flex flex-col sm:flex-row gap-3 sm:gap-6">
        <Dingbat glyph="✦" className="text-magenta" size="xl" />
        <div className="flex-1 min-w-0">
          <h2 className="mb-3 text-2xl font-serif text-foreground leading-none">
            What happens after beta
          </h2>
          <div className="space-y-2.5">
            <p className="text-sm text-foreground">
              We haven&rsquo;t decided on pricing yet. When we do, beta users
              get a heads up before anything changes.
            </p>
            <p className="text-sm text-foreground">
              <strong>No lock-in.</strong> Every RFC is a PR in your own repo.
              If the pricing isn&rsquo;t for you, your work stays with you in
              git history, exactly where you left it.
            </p>
          </div>
        </div>
      </section>
    </MarketingDocPage>
  );
}
