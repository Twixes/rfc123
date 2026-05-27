import type { ReactNode } from "react";

export interface ComparisonRow {
  feature: string;
  them: ReactNode;
  us: ReactNode;
}

interface ComparisonTableProps {
  themLabel: string;
  rows: ComparisonRow[];
}

export default function ComparisonTable({
  themLabel,
  rows,
}: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-gray-20">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-20 bg-gray-5 text-left text-xs uppercase tracking-wider text-gray-70">
            <th className="px-4 py-3 font-medium">Feature</th>
            <th className="px-4 py-3 font-medium">{themLabel}</th>
            <th className="px-4 py-3 font-medium">RFC123</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.feature}
              className={i === rows.length - 1 ? "" : "border-b border-gray-10"}
            >
              <th
                scope="row"
                className="w-1/3 px-4 py-3 text-left align-top font-medium text-foreground"
              >
                {row.feature}
              </th>
              <td className="px-4 py-3 align-top text-gray-70">{row.them}</td>
              <td className="px-4 py-3 align-top text-foreground">{row.us}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
