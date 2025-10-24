"use client";

import { useState, useRef, useEffect } from "react";
import type { RepoOption } from "@/lib/github";

interface RepoSelectorProps {
  currentRepo: { owner: string; name: string };
  availableRepos: RepoOption[];
  onSelect: (repo: RepoOption) => void;
}

export default function RepoSelector({
  currentRepo,
  availableRepos,
  onSelect,
}: RepoSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredRepos = availableRepos.filter((repo) =>
    repo.fullName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      inputRef.current?.focus();
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm font-medium tracking-wide text-gray-50 hover:text-black transition-colors flex items-center gap-2"
      >
        {currentRepo.owner}/{currentRepo.name}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border-4 border-black shadow-lg z-50">
          <div className="p-3 border-b-2 border-black">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:border-cyan"
            />
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filteredRepos.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No repositories found
              </div>
            ) : (
              filteredRepos.map((repo) => (
                <button
                  key={repo.fullName}
                  type="button"
                  onClick={() => {
                    onSelect(repo);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                  className={`w-full text-left px-4 py-3 text-sm font-mono border-b-2 border-black hover:bg-yellow transition-colors ${
                    repo.owner === currentRepo.owner &&
                    repo.name === currentRepo.name
                      ? "bg-gray-10 font-bold"
                      : ""
                  }`}
                >
                  {repo.fullName}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
