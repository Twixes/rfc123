import { RFCsSearchInput } from "@/components/RFCsSearchInput";

/** Visual stand-in for the `/rfcs` search input, used by `loading.tsx`.
 *  Non-interactive on purpose – the real search state lives in the client. */
export default function RFCsSearchSkeleton() {
  return <RFCsSearchInput skeleton />;
}
