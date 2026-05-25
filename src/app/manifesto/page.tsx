import Link from "next/link";
import MarketingPage from "@/components/MarketingPage";

export const metadata = { title: "Manifesto" };

export default function ManifestoPage() {
  return (
    <MarketingPage>
      <Link
        href="/"
        className="text-sm text-gray-50 hover:text-foreground transition-colors inline-block mb-4"
      >
        ← Back to RFC123
      </Link>
      <h1 className="font-serif font-normal text-4xl sm:text-5xl text-foreground mb-4">
        Manifesto
      </h1>
      <p className="text-lg text-gray-70">
        Michael is writing this. Check back soon.
      </p>
    </MarketingPage>
  );
}
