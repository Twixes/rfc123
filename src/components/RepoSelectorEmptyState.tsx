"use client";

import { useState, useEffect } from "react";
import type { RepoOption } from "@/lib/github";

interface RepoSelectorEmptyStateProps {
  repos: RepoOption[];
  onSelect: (repo: RepoOption) => void;
}

export default function RepoSelectorEmptyState({
  repos,
  onSelect,
}: RepoSelectorEmptyStateProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredRepos, setFilteredRepos] = useState(repos);

  useEffect(() => {
    const query = searchQuery.toLowerCase();
    setFilteredRepos(
      repos.filter((repo) => repo.fullName.toLowerCase().includes(query)),
    );
  }, [searchQuery, repos]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white border-4 border-black p-8">
        <h2 className="text-3xl font-bold mb-4">Select an RFC Repository</h2>
        <p className="mb-6 text-gray-700">
          Choose a repository with a <code className="bg-gray-100 px-2 py-1 font-mono text-sm">/requests-for-comments/</code> directory:
        </p>

        <input
          type="text"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-2 border-black px-4 py-3 mb-6 w-full focus:outline-none focus:border-cyan text-base"
          autoFocus
        />

        <div className="border-2 border-black max-h-96 overflow-y-auto">
          {filteredRepos.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              {repos.length === 0
                ? "No repositories found with /requests-for-comments/ directory"
                : "No repositories match your search"}
            </div>
          ) : (
            <div>
              {filteredRepos.map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => onSelect(repo)}
                  type="button"
                  className="w-full text-left px-6 py-4 border-b-2 border-black last:border-b-0 hover:bg-yellow transition-colors"
                >
                  <div className="font-mono font-bold text-lg">{repo.fullName}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
