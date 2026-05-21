"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

type TooltipProps = {
  children: ReactNode;
  content: ReactNode;
  side?: RadixTooltip.TooltipContentProps["side"];
  align?: RadixTooltip.TooltipContentProps["align"];
  delayDuration?: number;
};

export default function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  delayDuration = 200,
}: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={6}
            className="z-50 max-w-xs rounded-md bg-foreground px-3 py-2 text-xs leading-relaxed text-surface shadow-md"
          >
            {content}
            <RadixTooltip.Arrow className="fill-foreground" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
