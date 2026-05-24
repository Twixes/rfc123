"use client";

import type { AvailableOwner } from "@/lib/github";

export default function OwnerPicker({
  owners,
  selected,
  onSelect,
}: {
  owners: AvailableOwner[] | null;
  selected: AvailableOwner | null;
  onSelect: (o: AvailableOwner) => void;
}) {
  if (owners === null) {
    return (
      <div className="border border-gray-20 rounded-sm p-4 text-sm text-gray-50">
        Loading accounts…
      </div>
    );
  }
  if (owners.length === 0) {
    return (
      <div className="border border-gray-20 rounded-sm p-4 text-sm text-gray-50">
        No accounts found. Check your GitHub OAuth permissions.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {owners.map((owner) => {
        const isSelected = selected?.login === owner.login;
        return (
          <button
            key={owner.login}
            type="button"
            onClick={() => onSelect(owner)}
            className={`w-full text-left border rounded-sm px-3 py-2.5 text-sm transition-all cursor-pointer flex items-center gap-3 ${
              isSelected
                ? "border-foreground bg-gray-5"
                : "border-gray-20 hover:bg-gray-5"
            }`}
          >
            {owner.avatarUrl && (
              <img
                src={owner.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-sm border border-gray-20"
              />
            )}
            <span className="flex-1">
              <span className="font-medium text-foreground">{owner.login}</span>
              <span className="ml-2 text-xs text-gray-50">
                {owner.type === "User" ? "personal account" : "organization"}
              </span>
            </span>
            {isSelected && (
              <span className="text-cyan text-base" aria-hidden>
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
