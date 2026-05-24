import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { listAvailableOwners } from "@/lib/github";

export async function GET() {
  const accessToken = getAccessToken(await auth());
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const owners = await listAvailableOwners(accessToken);
    return NextResponse.json(owners);
  } catch (error) {
    console.error("Error fetching owners:", error);
    return NextResponse.json(
      { error: "Failed to fetch owners" },
      { status: 500 },
    );
  }
}
