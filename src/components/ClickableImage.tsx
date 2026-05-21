"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";

interface ClickableImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
}

export function ClickableImage({
  src,
  alt,
  className,
  style,
  ...props
}: ClickableImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const open = useCallback(() => setLightboxOpen(true), []);
  const close = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, close]);

  return (
    <>
      <button
        type="button"
        aria-label={alt ? `View image: ${alt}` : "View image"}
        className="cursor-zoom-in p-0 border-0 bg-transparent inline-block"
        style={style}
        onClick={open}
      >
        {/* biome-ignore lint: <img> used throughout the project */}
        <img src={src} alt={alt ?? ""} className={className} {...props} />
      </button>
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Image lightbox"
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="absolute inset-0 bg-black/80"
              aria-hidden="true"
              onClick={close}
              onKeyDown={(e) => e.key === "Enter" && close()}
            />
            <button
              type="button"
              aria-label="Close image"
              className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-md border border-white/30 bg-transparent px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-white/10"
              onClick={close}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Close</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Close
            </button>
            <motion.div
              className="relative z-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              {/* biome-ignore lint: <img> used throughout the project */}
              <img
                src={src}
                alt={alt ?? ""}
                className="max-h-[90vh] max-w-[90vw] object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
