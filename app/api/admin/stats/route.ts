import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { isAdminAuthorized, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { computeDashboardStats } from "@/lib/dashboard-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
    if (!isAdminAuthorized(request)) {
        return unauthorizedAdminResponse();
    }

    const search = request.nextUrl.searchParams;
    const stats = await computeDashboardStats({
        region: search.get("region") || "all",
        quintile: search.get("quintile") || "all",
        model: search.get("model") || "all"
    });

    return NextResponse.json(
        stats,
        {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        }
    );
}
