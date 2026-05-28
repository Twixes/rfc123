import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RFCListSkeleton from "@/components/RFCListSkeleton";
import RFCsFilterBarSkeleton from "@/components/RFCsFilterBarSkeleton";
import RFCsSearchSkeleton from "@/components/RFCsSearchSkeleton";
import RFCsTopBar from "@/components/RFCsTopBar";
import RFCsTopBarActions from "@/components/RFCsTopBarActions";

export default async function Loading() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  return (
    <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
      <RFCsTopBar
        user={session?.user ?? null}
        homeHref="/"
        actions={<RFCsTopBarActions />}
      />

      <RFCsSearchSkeleton />
      <RFCsFilterBarSkeleton />
      <RFCListSkeleton entry />
    </div>
  );
}
