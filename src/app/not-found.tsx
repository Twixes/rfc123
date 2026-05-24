import Link from "next/link";
import Dingbat from "@/components/Dingbat";

const PRIMARY_BTN =
  "inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-85 cursor-pointer";
const SECONDARY_BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-gray-30 bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5 cursor-pointer";

export const metadata = {
  title: "Not found",
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-start justify-center px-4 sm:px-8 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="border border-gray-20 rounded-md bg-surface p-6 sm:p-10">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
            <Dingbat glyph="¿" className="text-yellow" size="xl" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-50 mb-2">
                Error 404
              </p>
              <h1 className="font-serif font-normal text-5xl sm:text-6xl text-foreground leading-none mb-4">
                Page not found.
              </h1>
              <p className="text-base sm:text-lg text-gray-70 leading-relaxed text-pretty mb-4">
                This URL doesn't lead anywhere we recognise.
              </p>
              <Link href="/" className={PRIMARY_BTN}>
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
