"use client";

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export default function HourSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (hour: number) => void;
}) {
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className="w-full border border-gray-20 rounded-md px-2 py-1.5 text-sm bg-surface text-left font-mono">
        {formatHour(value)}
      </ListboxButton>
      <ListboxOptions
        anchor={{ to: "bottom start", gap: 4, padding: 16 }}
        className="w-[var(--button-width)] flex flex-col border border-gray-20 rounded-md bg-white shadow-sm z-10 focus:outline-none overflow-clip"
      >
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain py-1">
          {HOURS.map((h) => (
            <ListboxOption
              key={h}
              value={h}
              className="px-2 py-1 text-xs font-mono cursor-pointer text-gray-70 data-[focus]:bg-gray-5 data-[selected]:text-foreground data-[selected]:font-medium data-[selected]:bg-gray-5"
            >
              {formatHour(h)}
            </ListboxOption>
          ))}
        </div>
      </ListboxOptions>
    </Listbox>
  );
}
