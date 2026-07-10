import type { Preview } from "@storybook/nextjs-vite";
import MockDate from "mockdate";
import { initialize, mswLoader } from "msw-storybook-addon";
import { geist, lSerif } from "../src/app/fonts";
import { TooltipProvider } from "../src/components/Tooltip";
import { FROZEN_NOW } from "../src/stories/fixtures/rfc-detail";
import "../src/app/globals.css";

// Freeze the clock so relative timestamps ("3 days ago") render identically
// on every visual regression run. Fixture dates are pinned against this.
MockDate.set(FROZEN_NOW);

initialize({ onUnhandledRequest: "warn" });

const preview: Preview = {
  loaders: [mswLoader],
  decorators: [
    // Replicate the app shell from src/app/layout.tsx (font variables +
    // TooltipProvider); Storybook doesn't render the root layout.
    (Story) => (
      <div className={`${geist.variable} ${lSerif.variable} antialiased`}>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </div>
    ),
  ],
  parameters: {
    nextjs: {
      appDirectory: true,
    },
  },
};

export default preview;
