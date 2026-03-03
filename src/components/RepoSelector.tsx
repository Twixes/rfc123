"use client";

import { useState, useRef, useEffect } from "react";
import type { RepoOption } from "@/lib/github";

interface RepoSelectorProps {
  currentRepo: { owner: string; name: string };
  label?: string;
  availableRepos: RepoOption[];
  onSelect: (repo: RepoOption) => void;
}

export default function RepoSelector({
  currentRepo,
  label,
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
        className="text-sm font-medium text-gray-50 hover:text-foreground transition-colors flex items-center gap-2"
      >
        {label ?? `${currentRepo.owner}/${currentRepo.name}`}
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
        <div className="absolute top-full left-0 mt-2 w-80 bg-surface border border-gray-20 rounded-md z-50">
          <div className="p-3 border-b border-gray-20">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-30 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
            />
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filteredRepos.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-50">
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
                  className={`w-full text-left px-4 py-3 text-sm border-b border-gray-20 last:border-b-0 hover:bg-yellow-light transition-colors ${
                    repo.owner === currentRepo.owner &&
                    repo.name === currentRepo.name
                      ? "bg-gray-5 font-medium"
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
