"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { RFC } from "@/lib/github";
import RFCListSkeleton from "@/components/RFCListSkeleton";

interface RFCsPageClientProps {
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null;
}

export default function RFCsPageClient({ session }: RFCsPageClientProps) {
  const [rfcs, setRfcs] = useState<RFC[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRFCs();
  }, []);

  async function loadRFCs() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/rfcs");
      const data = await response.json();
      setRfcs(data);
    } catch (error) {
      console.error("Error loading RFCs:", error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
        <header className="mb-8 sm:mb-12 flex flex-col sm:flex-row items-start sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold uppercase tracking-tight text-black">
              <Link href="/" className="hover:underline">
                RFC123
              </Link>
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {session?.user?.image && (
              <div className="h-8 w-8 sm:h-10 sm:w-10 border-2 border-black">
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="h-full w-full"
                />
              </div>
            )}
            <a
              href="/api/auth/signout"
              className="border-2 border-black bg-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white inline-block"
            >
              Log out
            </a>
          </div>
        </header>
        <RFCListSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
      <header className="mb-8 sm:mb-12 flex flex-col sm:flex-row items-start sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-5xl font-bold uppercase tracking-tight text-black">
            <Link href="/" className="hover:underline">
              RFC123
            </Link>
          </h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          {session?.user?.image && (
            <div className="h-8 w-8 sm:h-10 sm:w-10 border-2 border-black">
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="h-full w-full"
              />
            </div>
          )}
          <a
            href="/api/auth/signout"
            className="border-2 border-black bg-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white inline-block"
          >
            Log out
          </a>
        </div>
      </header>

      <div className="space-y-0">
        {rfcs?.map((rfc, index) => (
          <Link
            key={`${rfc.owner}/${rfc.repo}/${rfc.number}`}
            href={`/rfcs/${rfc.owner}/${rfc.repo}/${rfc.number}`}
            className="group block border-b-2 border-black px-4 sm:px-6 py-4 sm:py-5 transition-all hover:bg-gray-10"
            style={{
              borderTop: index === 0 ? "2px solid black" : "none",
              backgroundColor: rfc.reviewRequested
                ? "var(--yellow)"
                : "white",
            }}
          >
            <div className="flex items-start justify-between gap-4 sm:gap-6">
              <div className="flex-1 min-w-0">
                <div className="mb-2 flex flex-wrap items-baseline gap-2 sm:gap-3">
                  <h2 className="text-base sm:text-xl font-bold tracking-tight text-black break-words">
                    {rfc.title}
                  </h2>
                  {rfc.reviewRequested && (
                    <span
                      className="border-2 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider flex-shrink-0"
                      style={{
                        borderColor: "var(--magenta)",
                        backgroundColor: "var(--magenta)",
                        color: "black",
                      }}
                    >
                      Review Requested
                    </span>
                  )}
                  <span
                    className="border-2 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider flex-shrink-0"
                    style={{
                      borderColor:
                        rfc.status === "open"
                          ? "var(--cyan)"
                          : rfc.status === "merged"
                            ? "var(--yellow)"
                            : "var(--gray-30)",
                      backgroundColor:
                        rfc.status === "open"
                          ? "var(--cyan)"
                          : rfc.status === "merged"
                            ? "var(--yellow)"
                            : "var(--gray-10)",
                      color: "black",
                    }}
                  >
                    {rfc.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-medium tracking-wide text-gray-70">
                  <span className="font-mono font-bold">
                    {rfc.owner}/{rfc.repo}
                  </span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="h-4 w-4 sm:h-5 sm:w-5 border-2 border-black">
                      <img
                        src={rfc.authorAvatar}
                        alt={rfc.author}
                        className="h-full w-full"
                      />
                    </div>
                    <span className="truncate max-w-24 sm:max-w-none">{rfc.author}</span>
                  </div>
                  <span className="font-mono">#{rfc.number}</span>
                  <span className="hidden sm:inline">
                    {new Date(rfc.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {rfc.inlineCommentCount > 0 && (
                    <span className="border-l-2 border-gray-30 pl-2 sm:pl-4">
                      {rfc.inlineCommentCount} inline
                    </span>
                  )}
                  {rfc.regularCommentCount > 0 && (
                    <span className="border-l-2 border-gray-30 pl-2 sm:pl-4">
                      {rfc.regularCommentCount} general
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
