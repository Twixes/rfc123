import { auth } from "@/auth";
import RFCDetailLoadingSkeleton from "@/components/RFCDetailLoadingSkeleton";

export default async function Loading() {
  const session = await auth();
  return <RFCDetailLoadingSkeleton user={session?.user ?? null} />;
}
