import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type MarketingButtonVariant = "primary" | "secondary";

const VARIANT_CLASS: Record<MarketingButtonVariant, string> = {
  primary:
    "inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-surface transition-all hover:opacity-85 cursor-pointer",
  secondary:
    "inline-flex items-center gap-1.5 rounded-md border border-gray-30 bg-surface px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5 cursor-pointer",
};

function buttonClass(variant: MarketingButtonVariant, className?: string) {
  return className
    ? `${VARIANT_CLASS[variant]} ${className}`
    : VARIANT_CLASS[variant];
}

type MarketingButtonCommonProps = {
  variant?: MarketingButtonVariant;
  className?: string;
  children: ReactNode;
};

export function MarketingButton({
  variant = "primary",
  className,
  type = "button",
  children,
  ...props
}: MarketingButtonCommonProps & ComponentProps<"button">) {
  return (
    <button type={type} className={buttonClass(variant, className)} {...props}>
      {children}
    </button>
  );
}

export function MarketingButtonLink({
  variant = "primary",
  className,
  children,
  ...props
}: MarketingButtonCommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, className)} {...props}>
      {children}
    </Link>
  );
}
