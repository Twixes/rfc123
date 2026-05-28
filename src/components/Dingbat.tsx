/**
 * Editorial typographic mark – a single serif glyph in a fixed-size square,
 * tinted with one of the brand accents. Used in place of icons on the
 * landing page so the feature blocks read as printed marginalia rather
 * than yet-another-SaaS-with-Phosphor.
 *
 * Two sizes – both are fixed squares so every instance lines up vertically
 * with its peers regardless of which glyph is rendered inside.
 */
export default function Dingbat({
  glyph,
  size = "md",
  className,
}: {
  glyph: string;
  size?: "md" | "xl";
  className?: string;
}) {
  const dimensions = size === "xl" ? "h-16 w-16 text-7xl" : "h-7 w-7 text-2xl";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${dimensions} flex-shrink-0 items-center justify-center mb-4 sm:mb-0 font-serif leading-none select-none ${className}`}
    >
      {glyph}
    </span>
  );
}
