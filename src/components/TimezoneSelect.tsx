"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { getTimeZones } from "@vvo/tzdb";
import { useEffect, useMemo, useRef, useState } from "react";

interface Option {
  name: string;
  label: string;
  offsetMinutes: number;
  offsetLabel: string;
  searchKey: string;
}

const OPTIONS: Option[] = getTimeZones()
  .map((tz) => {
    const offsetLabel = formatOffset(tz.currentTimeOffsetInMinutes);
    const city = tz.mainCities[0] ?? tz.name.split("/").pop() ?? tz.name;
    const label = `${tz.alternativeName} – ${city}`;
    return {
      name: tz.name,
      label,
      offsetMinutes: tz.currentTimeOffsetInMinutes,
      offsetLabel,
      searchKey: [tz.name, tz.alternativeName, tz.countryName, ...tz.mainCities]
        .join(" ")
        .toLowerCase(),
    };
  })
  .sort((a, b) =>
    a.offsetMinutes === b.offsetMinutes
      ? a.label.localeCompare(b.label)
      : a.offsetMinutes - b.offsetMinutes,
  );

const OPTIONS_BY_NAME = new Map(OPTIONS.map((o) => [o.name, o]));

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `GMT${sign}${h}:${m}`;
}

function formatSelectedLabel(opt: Option | null): string {
  return opt ? `${opt.offsetLabel} · ${opt.label}` : "";
}

export default function TimezoneSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = value ? (OPTIONS_BY_NAME.get(value) ?? null) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return OPTIONS;
    return OPTIONS.filter((o) => o.searchKey.includes(q));
  }, [query]);

  // While focused, the input is empty so the user can immediately type a
  // fresh query. The currently-selected option survives as the placeholder
  // so it's still visible "in the background". Imperative because Headless
  // UI's ComboboxInput owns the input's `value` via displayValue and won't
  // re-apply on focus state changes alone.
  useEffect(() => {
    if (!inputRef.current) return;
    if (isFocused) {
      inputRef.current.value = "";
    } else {
      inputRef.current.value = formatSelectedLabel(selected);
    }
  }, [isFocused, selected]);

  return (
    <Combobox
      value={selected}
      onChange={(opt: Option | null) => {
        if (opt) onChange(opt.name);
        setQuery("");
      }}
      immediate
    >
      <ComboboxInput
        ref={inputRef}
        displayValue={formatSelectedLabel}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          setQuery("");
        }}
        placeholder={
          selected ? formatSelectedLabel(selected) : "Select timezone…"
        }
        className="w-full border border-gray-20 rounded-md px-2 py-1.5 text-sm bg-surface font-mono outline-none focus:border-gray-40 placeholder:text-gray-50"
      />
      <ComboboxOptions
        anchor={{ to: "bottom start", gap: 4, padding: 16 }}
        className="w-[var(--input-width)] flex flex-col border border-gray-20 rounded-md bg-surface shadow-sm z-10 focus:outline-none overflow-clip"
      >
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain py-1">
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-gray-50">No matches.</div>
          )}
          {filtered.map((opt) => (
            <ComboboxOption
              key={opt.name}
              value={opt}
              className="flex items-baseline gap-2 px-2 py-1 text-xs cursor-pointer text-gray-70 data-[focus]:bg-gray-5 data-[selected]:text-foreground data-[selected]:font-medium"
            >
              <span className="font-mono text-gray-50 w-16 flex-shrink-0">
                {opt.offsetLabel}
              </span>
              <span className="truncate">{opt.label}</span>
            </ComboboxOption>
          ))}
        </div>
      </ComboboxOptions>
    </Combobox>
  );
}
