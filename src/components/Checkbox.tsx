import type { ReactNode } from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: ReactNode;
  /**
   * Optional smaller-text helper line under the label. When provided the
   * checkbox top-aligns with the label so multi-line descriptions read well.
   */
  description?: ReactNode;
  className?: string;
}

/**
 * Single-line checkbox with optional sub-line description. Pairs the input
 * inside the label so the whole row is clickable, picks alignment based on
 * whether a description is shown, and uses the project's cyan accent.
 */
export default function Checkbox({
  checked,
  onChange,
  disabled,
  label,
  description,
  className,
}: CheckboxProps) {
  const cursor = disabled ? "cursor-not-allowed" : "cursor-pointer";
  const align = description ? "items-start gap-2" : "items-center gap-3";
  return (
    <label className={`flex select-none ${align} ${cursor} ${className ?? ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={`h-4 w-4 accent-cyan ${cursor} ${description ? "mt-1" : ""}`}
      />
      <span className="text-sm text-foreground">
        {label}
        {description && (
          <span className="block text-xs text-gray-50 mt-0.5">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
