import Link from "next/link";
import MarketingPage from "@/components/MarketingPage";

export const metadata = { title: "vs Slack Canvases" };

export default function SlackCanvasesComparison() {
  return (
    <MarketingPage>
      <Link
        href="/"
        className="text-sm text-gray-50 hover:text-foreground transition-colors inline-block mb-4"
      >
        ← Back to RFC123
      </Link>
      <h1 className="font-serif font-normal text-4xl sm:text-5xl text-foreground mb-4">
        RFC123 vs Slack Canvases
      </h1>
      <p className="text-lg text-gray-70">
        We&rsquo;re writing this. Check back soon.
      </p>
    </MarketingPage>
  );
}
