import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { readItems } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatalogEntry = {
    imageId: string;
    imageUrl: string;
    region: string;
    incomeQuintile: string;
    predictions: Array<{
        taskId: string;
        model: string;
        predicted: string;
    }>;
};

export async function GET(request: NextRequest) {
    if (!isAdminAuthorized(request)) {
        return unauthorizedAdminResponse();
    }

    const items = readItems();
    const byImage = new Map<string, CatalogEntry>();

    for (const item of items) {
        const imageId = item.image_id;
        const existing = byImage.get(imageId);

        if (!existing) {
            byImage.set(imageId, {
                imageId,
                imageUrl: item.image_url,
                region: item.region || "unknown",
                incomeQuintile: item.income_quintile || "unknown",
                predictions: [
                    {
                        taskId: item.task_id,
                        model: item.model,
                        predicted: item.predicted || ""
                    }
                ]
            });
            continue;
        }

        const alreadyPresent = existing.predictions.some((prediction) => prediction.model === item.model);
        if (!alreadyPresent) {
            existing.predictions.push({
                taskId: item.task_id,
                model: item.model,
                predicted: item.predicted || ""
            });
        }
    }

    const entries = Array.from(byImage.values()).sort((a, b) => a.imageId.localeCompare(b.imageId));
    for (const entry of entries) {
        entry.predictions.sort((a, b) => a.model.localeCompare(b.model));
    }

    return NextResponse.json(
        {
            totalEntries: entries.length,
            entries
        },
        {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        }
    );
}
