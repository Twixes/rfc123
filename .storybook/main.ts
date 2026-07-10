import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  // Holds the MSW service worker (kept out of the app's `public/`, which
  // Next serves in production).
  staticDirs: ["./public"],
};

export default config;
