/**
 * The RFC123 mark: the Lastik pilcrow as vector paths, so the logo renders
 * even where the webfont hasn't loaded (or can't load, e.g. an inlined email
 * or an OG image).
 *
 * Paths are the tight glyph bounding box, so the mark can be sized by
 * height alone and will optically match adjacent `font-serif` text.
 * Downloadable exports of the same outline live in `public/brand/`.
 */

/** Tight glyph bbox – 534.25 × 980 units, no padding. */
export const BRAND_MARK_VIEW_BOX = "0 0 534.25 980";

const BRAND_MARK_PATH =
  "M269.16 980Q247.08 980 247.08 957.47L247.08 459.95Q247.08 441.95 229.08 441.95Q122.08 436.95 61.04 379.37Q0 321.79 0 219.98Q0 149.62 29.95 100.62Q59.91 51.63 112.81 25.81Q165.72 0 234.08 0L511.71 0Q534.25 0 534.25 20.99L534.25 26.16Q534.25 47.15 511.71 47.15L485.25 47.15Q467.25 47.15 467.25 65.15L467.25 957.47Q467.25 980 444.71 980L424.75 980Q402.66 980 402.66 957.47L402.66 65.15Q402.66 47.15 384.66 47.15L330.66 47.15Q312.66 47.15 312.66 65.15L312.66 957.47Q312.66 980 290.13 980Z";

interface BrandMarkProps {
  className?: string;
  /** Accessible name. Omit to render the mark as decorative. */
  title?: string;
}

export default function BrandMark({ className, title }: BrandMarkProps) {
  return (
    <svg
      viewBox={BRAND_MARK_VIEW_BOX}
      fill="currentColor"
      className={className}
      role="img"
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <title>{title ?? "RFC123"}</title>
      <path d={BRAND_MARK_PATH} />
    </svg>
  );
}
