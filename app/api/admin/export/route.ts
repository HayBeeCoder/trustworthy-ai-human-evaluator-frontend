import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { computeDashboardStats } from "@/lib/dashboard-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function escapeCsv(value: string | number): string {
    const raw = String(value ?? "");
    if (raw.includes(",") || raw.includes("\n") || raw.includes("\"")) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
}

function rowsToCsv(headers: string[], rows: Array<Array<string | number>>): string {
    const headerLine = headers.map(escapeCsv).join(",");
    const lines = rows.map((row) => row.map(escapeCsv).join(","));
    return [headerLine, ...lines].join("\n");
}

export async function GET(request: NextRequest) {
    if (!isAdminAuthorized(request)) {
        return unauthorizedAdminResponse();
    }

    const search = request.nextUrl.searchParams;
    const table = String(search.get("table") || "overview");

    const stats = await computeDashboardStats({
        region: search.get("region") || "all",
        quintile: search.get("quintile") || "all",
        model: search.get("model") || "all"
    });

    let csv = "";
    if (table === "region") {
        csv = rowsToCsv(
            ["region", "sampled", "completed", "remaining", "completion_pct"],
            stats.regionFillRates.map((row) => [row.region, row.sampled, row.completed, row.remaining, row.completionPct])
        );
    } else if (table === "quintile") {
        csv = rowsToCsv(
            ["quintile", "sampled", "completed", "remaining", "completion_pct"],
            stats.quintileFillRates.map((row) => [row.quintile, row.sampled, row.completed, row.remaining, row.completionPct])
        );
    } else if (table === "quality") {
        csv = rowsToCsv(
            ["label", "sampled", "completed", "remaining", "completion_pct"],
            stats.qualityFillRates.map((row) => [row.label, row.sampled, row.completed, row.remaining, row.completionPct])
        );
    } else if (table === "model") {
        csv = rowsToCsv(
            ["model", "sampled", "completed_tasks", "remaining_tasks", "true_count", "false_count", "unsure_count", "agreement_pct"],
            stats.modelMetrics.map((row) => [
                row.model,
                row.sampled,
                row.completedTasks,
                row.remainingTasks,
                row.trueCount,
                row.falseCount,
                row.unsureCount,
                row.agreementPct
            ])
        );
    } else if (table === "queue") {
        csv = rowsToCsv(
            ["region", "quintile", "sampled", "completed", "remaining", "completion_pct"],
            stats.queueHealth.map((row) => [row.region, row.quintile, row.sampled, row.completed, row.remaining, row.completionPct])
        );
    } else {
        csv = rowsToCsv(
            ["round_status", "target_sample_size", "sampled_task_count", "completed_responses", "skipped_count", "unique_sessions", "remaining_responses"],
            [[
                stats.roundStatus,
                stats.targetSampleSize,
                stats.sampledTaskCount,
                stats.completedResponses,
                stats.skippedCount,
                stats.uniqueSessions,
                stats.remainingResponses
            ]]
        );
    }

    const fileName = `dashboard-${table}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename=${fileName}`,
            "Cache-Control": "no-store"
        }
    });
}
