import { NextResponse, type NextRequest } from "next/server";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { listRecentActivity } from "@/lib/auth/activity";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const logs = await listRecentActivity();

    return NextResponse.json({ logs, requestedBy: admin.email });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("List activity error", error);
    return NextResponse.json({ error: "Unable to load activity" }, { status: 500 });
  }
}
