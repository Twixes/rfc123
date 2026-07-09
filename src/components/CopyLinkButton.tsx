"use client";

import { useCallback, useState } from "react";

interface CopyLinkButtonProps {
  /** Shapes the copied deep link, starting from the current location. */
  mutateUrl: (url: URL) => void;
  ariaLabel: string;
  className: string;
  iconClassName: string;
}

/** Icon button that copies a URL derived from the current location and swaps
 *  to a checkmark while the copy is fresh. */
export function CopyLinkButton({
  mutateUrl,
  ariaLabel,
  className,
  iconClassName,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = new URL(window.location.href);
      mutateUrl(url);
      navigator.clipboard.writeText(url.toString()).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [mutateUrl],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      aria-label={ariaLabel}
    >
      {copied ? (
        <svg
          className={`${iconClassName} text-cyan`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Copied</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className={iconClassName}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Copy link</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      )}
    </button>
  );
}
