import type { ReactNode } from "react";
import Footer from "@/components/Footer";

export default function MarketingPage({
  children,
  below,
}: {
  children: ReactNode;
  /** Optional slot rendered between the main card and the footer, outside the
   *  white surface. Used by the landing page for the PostHog showcase widget. */
  below?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 sm:px-8 py-8 sm:py-12">
      <div className="w-full max-w-4xl flex flex-col grow gap-4 sm:gap-5">
        <div className="border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
          {children}
        </div>
        {below}
        <div className="mt-auto pt-4 sm:pt-6">
          <Footer />
        </div>
      </div>
    </div>
  );
}
