import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "vs plain markdown PRs" };

export default function MarkdownPRsComparison() {
  return (
    <MarketingDocPage eyebrow="Compare" title="RFC123 vs plain markdown PRs">
      <p className="text-lg text-gray-70">
        We&rsquo;re writing this. Check back soon.
      </p>
    </MarketingDocPage>
  );
}
