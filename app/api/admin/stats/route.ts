import { NextResponse } from "next/server";
import { readRuntime } from "@/lib/store";
import { NextRequest } from "next/server";
import { isAdminAuthorized, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
    if (!isAdminAuthorized(request)) {
        return unauthorizedAdminResponse();
    }

    const runtime = await readRuntime();
    const uniqueSessions = new Set(runtime.responses.map((response) => response.sessionId)).size;

    return NextResponse.json(
        {
            targetSampleSize: runtime.targetSampleSize,
            sampledTaskCount: runtime.sampledTaskIds.length,
            completedResponses: runtime.responses.length,
            skippedCount: runtime.skipped.length,
            uniqueSessions,
            remainingResponses: Math.max(runtime.sampledTaskIds.length - runtime.responses.length, 0)
        },
        {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        }
    );
}
