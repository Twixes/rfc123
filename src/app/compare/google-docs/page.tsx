import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "vs Google Docs" };

export default function GoogleDocsComparison() {
  return (
    <MarketingDocPage eyebrow="Compare" title="RFC123 vs Google Docs">
      <p className="text-lg text-gray-70">
        We&rsquo;re writing this. Check back soon.
      </p>
    </MarketingDocPage>
  );
}
