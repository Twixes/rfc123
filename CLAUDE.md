# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

IMPORTANT: The current to-do list is always at APP_SPEC.md. Refer to it for progress on the task of implementing the RFC123 app. Update APP_SPEC.md proactively.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript with strict mode
- **React**: Version 19.2.0 with React Compiler enabled
- **Styling**: Tailwind CSS v4
- **Linting/Formatting**: Biome (replaces ESLint and Prettier)
- **Package Manager**: pnpm

## Development Commands

- `pnpm dev` - Start development server at http://localhost:3000
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run Biome linter and formatter checks
- `pnpm format` - Auto-format code with Biome

## Project Structure

- **App Router**: Using Next.js App Router with `src/app/` directory
- **Path Aliases**: `@/*` maps to `./src/*` (configured in tsconfig.json)
- **Layout**: Root layout in `src/app/layout.tsx` uses Geist fonts (sans and mono)
- **Styling**: Global styles in `src/app/globals.css`

## Key Configuration Details

- **React Compiler**: Enabled in `next.config.ts` for automatic optimizations
- **TypeScript**: Target ES2017, using `react-jsx` transform
- **Biome**: Configured with Next.js and React recommended rules, auto-organizes imports on save
- **Formatter**: 2-space indentation, enforced by Biome
