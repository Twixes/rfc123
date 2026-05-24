import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { checkRepoNameAvailable } from "@/lib/github";
import { VALID_GITHUB_REPO_NAME } from "@/lib/rfc-config";

export async function GET(request: Request) {
  const accessToken = getAccessToken(await auth());
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner")?.trim();
  const name = searchParams.get("name")?.trim();
  if (!owner || !name) {
    return NextResponse.json(
      { error: "owner and name are required" },
      { status: 400 },
    );
  }
  if (!VALID_GITHUB_REPO_NAME.test(name)) {
    return NextResponse.json({ available: false, reason: "invalid_name" });
  }
  try {
    const available = await checkRepoNameAvailable(accessToken, owner, name);
    return NextResponse.json({ available });
  } catch (error) {
    console.error("Error checking repo name:", error);
    return NextResponse.json(
      { error: "Failed to check repo name" },
      { status: 500 },
    );
  }
}
