import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { setRoundStatus } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
    if (!isAdminAuthorized(request)) {
        return unauthorizedAdminResponse();
    }

    const body = await request.json();
    const action = String(body?.action || "").toLowerCase();
    if (action !== "start" && action !== "stop") {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const status = action === "start" ? "running" : "stopped";
    const state = await setRoundStatus(status);

    return NextResponse.json({ ok: true, roundStatus: state.roundStatus });
}
