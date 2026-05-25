import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "Manifesto" };

export default function ManifestoPage() {
  return (
    <MarketingDocPage eyebrow="Product" title="Manifesto">
      <p className="text-lg text-gray-70">
        Michael is writing this. Check back soon.
      </p>
    </MarketingDocPage>
  );
}
