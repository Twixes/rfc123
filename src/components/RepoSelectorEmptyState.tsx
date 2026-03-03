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
      <div className="bg-surface border border-gray-20 rounded-md shadow-md p-8">
        <h2 className="text-3xl font-serif mb-4">Select an RFC Repository</h2>
        <p className="mb-6 text-gray-70">
          Choose a repository containing RFCs:
        </p>

        <input
          type="text"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border border-gray-30 rounded-sm px-4 py-3 mb-6 w-full focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent text-base"
          autoFocus
        />

        <div className="border border-gray-20 rounded-md max-h-96 overflow-y-auto">
          {filteredRepos.length === 0 ? (
            <div className="p-12 text-center text-gray-50">
              {repos.length === 0
                ? "No repositories found containing RFCs"
                : "No repositories match your search"}
            </div>
          ) : (
            <div>
              {filteredRepos.map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => onSelect(repo)}
                  type="button"
                  className="w-full text-left px-6 py-4 border-b border-gray-20 last:border-b-0 hover:bg-yellow-light transition-colors"
                >
                  <div className="font-medium text-lg">
                    {repo.fullName}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
