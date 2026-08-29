import type { ReactNode } from "react";
import BrandMark from "@/components/icons/BrandMark";
import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = {
  title: "Brand",
  description: "The RFC123 mark, the colors, and the files to use them.",
};

const EYEBROW_CLASS =
  "font-mono text-[11px] uppercase tracking-[0.18em] text-gray-50";

const ASSETS = [
  {
    label: "Mark, cyan",
    ground: "bg-surface",
    mark: "text-cyan",
    files: [
      { format: "SVG", href: "/brand/rfc123-mark.svg" },
      { format: "PNG", href: "/brand/rfc123-mark.png" },
    ],
  },
  {
    label: "Mark, black",
    ground: "bg-surface",
    mark: "text-foreground",
    files: [{ format: "SVG", href: "/brand/rfc123-mark-black.svg" }],
  },
  {
    label: "Mark, white",
    ground: "bg-cyan",
    mark: "text-white",
    files: [{ format: "SVG", href: "/brand/rfc123-mark-white.svg" }],
  },
] as const;

const COLORS = [
  { name: "Cyan", hex: "#5B9EB5", token: "--cyan", swatch: "bg-cyan" },
  {
    name: "Ink",
    hex: "#1A1A1F",
    token: "--foreground",
    swatch: "bg-foreground",
  },
  {
    name: "Paper",
    hex: "#F9F9FB",
    token: "--background",
    swatch: "bg-background",
  },
  {
    name: "Magenta",
    hex: "#C4567A",
    token: "--magenta",
    swatch: "bg-magenta",
  },
  { name: "Yellow", hex: "#E8C547", token: "--yellow", swatch: "bg-yellow" },
] as const;

const RULES = [
  "Leave clear space of at least half the mark's height on every side.",
  "Prefer the SVG. The PNG is there for raster-only cases.",
  "No recoloring, rotating, stretching, or outlining. A system pilcrow won't do either, since the shapes differ.",
  "The name is RFC123: one word, no space, set in Lastik Regular.",
] as const;

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className={EYEBROW_CLASS}>{label}</h2>
        <span className="h-px flex-1 bg-gray-20" />
      </div>
      {children}
    </section>
  );
}

function DownloadLink({ format, href }: { format: string; href: string }) {
  return (
    <a
      href={href}
      download
      className="rounded border border-gray-20 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-gray-50 transition-colors hover:border-gray-30 hover:bg-gray-5 hover:text-foreground"
    >
      {format}
    </a>
  );
}

function Tile({
  label,
  files,
  children,
  ground,
}: {
  label: string;
  files: readonly { format: string; href: string }[];
  children: ReactNode;
  ground: string;
}) {
  return (
    <figure className="overflow-hidden rounded-md border border-gray-20 bg-surface">
      <div className={`flex h-52 items-center justify-center ${ground}`}>
        {children}
      </div>
      <figcaption className="flex items-center justify-between gap-3 border-t border-gray-20 px-4 py-2.5">
        <span className={EYEBROW_CLASS}>{label}</span>
        <span className="flex gap-1.5">
          {files.map((file) => (
            <DownloadLink key={file.href} {...file} />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

export default function BrandPage() {
  return (
    <MarketingDocPage eyebrow="Resources" title="Brand">
      <p className="mb-12 max-w-xl text-lg font-light leading-tight text-gray-70">
        The RFC123 mark is a pilcrow, set in Lastik like the wordmark.
      </p>

      <div className="space-y-12">
        <Section label="Logo">
          <div className="grid gap-4 sm:grid-cols-2">
            {ASSETS.map((asset) => (
              <Tile
                key={asset.label}
                label={asset.label}
                files={asset.files}
                ground={asset.ground}
              >
                <BrandMark className={`h-28 ${asset.mark}`} />
              </Tile>
            ))}
            <Tile
              label="App icon"
              ground="bg-surface"
              files={[
                { format: "SVG", href: "/brand/rfc123-icon.svg" },
                { format: "PNG", href: "/brand/rfc123-icon.png" },
              ]}
            >
              {/* The square is the artwork, so it renders at its own edges
                  rather than as a mark floating on the tile ground. */}
              <span className="flex h-36 w-36 items-center justify-center bg-cyan">
                <BrandMark className="h-[86px] text-white" />
              </span>
            </Tile>
          </div>
        </Section>

        <Section label="Color">
          <div className="overflow-hidden rounded-md border border-gray-20 bg-surface">
            {COLORS.map((color, i) => (
              <div
                key={color.hex}
                className={`flex items-center gap-4 px-4 py-3 sm:gap-6 sm:px-5 ${
                  i > 0 ? "border-t border-gray-20" : ""
                }`}
              >
                <span
                  className={`h-8 w-8 shrink-0 rounded border border-gray-20 ${color.swatch}`}
                />
                <span className="flex-1 text-sm text-foreground">
                  {color.name}
                </span>
                <code className="font-mono text-xs text-gray-70">
                  {color.hex}
                </code>
                <code className="hidden w-28 shrink-0 text-right font-mono text-xs text-gray-50 sm:block">
                  {color.token}
                </code>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Use">
          <ul className="overflow-hidden rounded-md border border-gray-20 bg-surface text-sm text-foreground">
            {RULES.map((rule, i) => (
              <li
                key={rule}
                className={`px-4 py-3 sm:px-5 ${
                  i > 0 ? "border-t border-gray-20" : ""
                }`}
              >
                {rule}
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-xl text-sm text-gray-70">
            Writing about RFC123 or linking to it is fair use of the mark.
            Implying that we built or endorsed your product is not.
          </p>
        </Section>
      </div>
    </MarketingDocPage>
  );
}
