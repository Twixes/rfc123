import type { Preview } from "@storybook/nextjs-vite";
import MockDate from "mockdate";
import { initialize, mswLoader } from "msw-storybook-addon";
import { appBodyClassName } from "../src/app/fonts";
import { TooltipProvider } from "../src/components/Tooltip";
import { FROZEN_NOW } from "../src/stories/fixtures/clock";
import "../src/app/globals.css";

// Freeze the clock so relative timestamps ("3 days ago") render identically
// on every visual regression run. Fixture dates are pinned against this.
MockDate.set(FROZEN_NOW);

initialize();

const preview: Preview = {
  loaders: [mswLoader],
  decorators: [
    // Replicate the app shell from src/app/layout.tsx (shared body class +
    // TooltipProvider); Storybook doesn't render the root layout.
    (Story) => (
      <div className={appBodyClassName}>
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
