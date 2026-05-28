import type { ReactNode } from "react";
import Footer from "@/components/Footer";

export default function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 sm:px-8 py-8 sm:py-12">
      <div className="w-full max-w-4xl flex flex-col grow gap-8 sm:gap-12">
        <div className="border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
          {children}
        </div>
        <div className="mt-auto">
          <Footer />
        </div>
      </div>
    </div>
  );
}
