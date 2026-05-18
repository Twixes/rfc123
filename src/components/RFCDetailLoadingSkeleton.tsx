"use client";

import { motion } from "motion/react";
import RFCsTopBar from "@/components/RFCsTopBar";

interface RFCDetailLoadingSkeletonProps {
  user?: { name?: string | null; image?: string | null } | null;
}

const FADE_UP = {
  visible: { opacity: 1, y: 0 },
  hidden: { opacity: 0, y: 8 },
};

export default function RFCDetailLoadingSkeleton({
  user,
}: RFCDetailLoadingSkeletonProps = {}) {
  return (
    <motion.div
      className="mx-auto min-h-screen max-w-360 px-4 sm:px-8 py-6 sm:py-12"
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.06 } },
        hidden: {},
      }}
    >
      <motion.div variants={FADE_UP} transition={{ duration: 0.35 }}>
        <RFCsTopBar user={user ?? null} />
      </motion.div>

      {/* Masthead skeleton — eyebrow + title + byline */}
      <motion.section
        className="mb-6"
        variants={FADE_UP}
        transition={{ duration: 0.35 }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="h-3 w-20 animate-pulse rounded bg-gray-20" />
          <div className="h-px flex-1 bg-gray-20" />
          <div className="h-3 w-14 animate-pulse rounded bg-gray-20" />
          <div className="h-3 w-32 animate-pulse rounded bg-gray-20" />
          <div className="h-3 w-12 animate-pulse rounded bg-gray-20" />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3 sm:flex-1">
            <div className="h-9 sm:h-12 w-full sm:w-5/6 animate-pulse rounded bg-gray-20" />
            <div className="h-9 sm:h-12 w-3/4 sm:w-2/3 animate-pulse rounded bg-gray-20" />
          </div>
          <div className="flex items-center gap-2 sm:pb-1.5">
            <div className="h-[34px] w-44 animate-pulse rounded-md bg-gray-10" />
            <div className="h-[34px] w-32 animate-pulse rounded-md bg-gray-10" />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 animate-pulse rounded-full bg-gray-20" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-20" />
          </div>
          <span className="h-3 w-px bg-gray-20" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-20" />
          <span className="h-3 w-px bg-gray-20" />
          <div className="h-4 w-24 animate-pulse rounded bg-gray-20" />
          <span className="h-3 w-px bg-gray-20" />
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-16 animate-pulse rounded bg-gray-20" />
            <div className="flex -space-x-1.5">
              <div className="h-5 w-5 animate-pulse rounded-full border border-surface bg-gray-20" />
              <div className="h-5 w-5 animate-pulse rounded-full border border-surface bg-gray-20" />
              <div className="h-5 w-5 animate-pulse rounded-full border border-surface bg-gray-20" />
            </div>
          </div>
        </div>
      </motion.section>

      {/* Content skeleton — single hairline rule, no card chrome */}
      <motion.div
        className="border-t border-gray-20 pt-8"
        variants={FADE_UP}
        transition={{ duration: 0.35 }}
      >
        <div className="mb-6 h-8 w-2/3 animate-pulse rounded bg-gray-20" />
        <div className="space-y-3">
          <div className="h-5 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-5 w-5/6 animate-pulse rounded bg-gray-20" />
          <div className="h-5 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-5 w-4/5 animate-pulse rounded bg-gray-20" />
        </div>
        <div className="py-4" />
        <div className="space-y-3">
          <div className="h-5 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-5 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-gray-20" />
        </div>
        <div className="py-4" />
        <div className="h-32 w-full animate-pulse rounded-md border border-gray-20 bg-gray-5" />
        <div className="py-4" />
        <div className="space-y-3">
          <div className="h-5 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-5 w-5/6 animate-pulse rounded bg-gray-20" />
          <div className="h-5 w-full animate-pulse rounded bg-gray-20" />
        </div>
      </motion.div>

      {/* Conversation skeleton — divider list */}
      <motion.section
        className="mt-16"
        variants={FADE_UP}
        transition={{ duration: 0.35 }}
      >
        <div className="mb-6 flex items-baseline gap-4">
          <div className="h-8 w-44 animate-pulse rounded bg-gray-20" />
          <span className="h-px flex-1 bg-gray-20" />
          <div className="h-3 w-20 animate-pulse rounded bg-gray-20" />
        </div>

        <ul className="mb-10 divide-y divide-gray-20">
          {[0, 1, 2].map((i) => (
            <li key={i} className="py-6">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
                <div className="h-4 w-32 animate-pulse rounded bg-gray-20" />
                <span className="text-gray-30">·</span>
                <div className="h-3 w-20 animate-pulse rounded bg-gray-20" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-gray-20" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-gray-20" />
              </div>
            </li>
          ))}
        </ul>

        <div className="h-24 w-full animate-pulse rounded-md border border-gray-20 bg-gray-5" />
      </motion.section>
    </motion.div>
  );
}
