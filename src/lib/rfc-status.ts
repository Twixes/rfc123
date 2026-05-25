import type { RFC } from "./github";

export const ALL_STATUSES: ReadonlyArray<RFC["status"]> = [
  "open",
  "merged",
  "closed",
];

export const STATUS_PILL_CLASSES: Record<RFC["status"], string> = {
  open: "border-cyan bg-cyan-light",
  merged: "border-magenta bg-magenta-light",
  closed: "border-gray-30 bg-gray-5",
};

export const STATUS_BORDER_CLASSES: Record<RFC["status"], string> = {
  open: "border-cyan",
  merged: "border-magenta",
  closed: "border-gray-30",
};
