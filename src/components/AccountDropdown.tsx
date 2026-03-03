"use client";

import { useState, useRef, useEffect } from "react";

interface AccountDropdownProps {
  user: {
    name?: string | null;
    image?: string | null;
  };
}

export default function AccountDropdown({ user }: AccountDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden border border-gray-20 cursor-pointer transition-opacity hover:opacity-80"
        aria-label="Account menu"
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || "User"}
            className="h-full w-full"
          />
        ) : (
          <div className="h-full w-full bg-gray-10 flex items-center justify-center text-xs text-gray-50">
            {user.name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 rounded-md border border-gray-20 bg-surface z-50">
          {user.name && (
            <div className="px-3 py-2 text-xs text-gray-50 border-b border-gray-20 truncate">
              {user.name}
            </div>
          )}
          <a
            href="/api/auth/signout"
            className="block px-3 py-2 text-sm text-foreground hover:bg-gray-5 transition-colors"
          >
            Log out
          </a>
        </div>
      )}
    </div>
  );
}
