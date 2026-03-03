import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentUserLogin, getRFCDetail } from "@/lib/github";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const t0 = performance.now();
  const session = await auth();
  console.log(`[API /rfcs/[number]] auth() took ${(performance.now() - t0).toFixed(0)}ms`);
  const { number } = await params;

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as unknown as { accessToken: string })
  .accessToken;

  const t1 = performance.now();
  const currentUserLogin = await getCurrentUserLogin(accessToken);
  console.log(`[API /rfcs/[number]] getCurrentUserLogin() took ${(performance.now() - t1).toFixed(0)}ms`);

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo || !currentUserLogin) {
    return NextResponse.json(
      { error: "Missing owner or repo or currentUserLogin parameter" },
      { status: 400 },
    );
  }

  try {
    const t2 = performance.now();
    const rfc = await getRFCDetail(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
      Number(number),
      currentUserLogin,
    );
    console.log(`[API /rfcs/[number]] getRFCDetail() took ${(performance.now() - t2).toFixed(0)}ms`);
    console.log(`[API /rfcs/[number]] total took ${(performance.now() - t0).toFixed(0)}ms`);
    return NextResponse.json(rfc);
  } catch (error) {
    console.error("Error fetching RFC detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch RFC detail" },
      { status: 500 },
    );
  }
}
