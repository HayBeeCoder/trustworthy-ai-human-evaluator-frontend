import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { submitTaskForSession } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
    if (!isAdminAuthorized(request)) {
        return unauthorizedAdminResponse();
    }

    const body = await request.json();
    const { taskId, sessionId, verdict, note } = body as {
        taskId?: string;
        sessionId?: string;
        verdict?: "true" | "false" | "unsure";
        note?: string;
    };

    if (!taskId || !sessionId || !verdict) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalizedSessionId = `admin:${sessionId}`;
    const result = await submitTaskForSession({
        taskId,
        sessionId: normalizedSessionId,
        verdict,
        note
    });

    return NextResponse.json(result);
}
