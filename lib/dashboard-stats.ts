import { readItems, readRuntime } from "@/lib/store";

export type DashboardFilters = {
    region?: string;
    quintile?: string;
    model?: string;
};

export type DashboardStats = {
    roundStatus: "running" | "stopped";
    targetSampleSize: number;
    sampledTaskCount: number;
    completedResponses: number;
    skippedCount: number;
    uniqueSessions: number;
    remainingResponses: number;
    regionFillRates: Array<{
        region: string;
        sampled: number;
        completed: number;
        remaining: number;
        completionPct: number;
    }>;
    quintileFillRates: Array<{
        quintile: string;
        sampled: number;
        completed: number;
        remaining: number;
        completionPct: number;
    }>;
    modelMetrics: Array<{
        model: string;
        sampled: number;
        completedTasks: number;
        remainingTasks: number;
        trueCount: number;
        falseCount: number;
        unsureCount: number;
        agreementPct: number;
    }>;
    queueHealth: Array<{
        region: string;
        quintile: string;
        sampled: number;
        completed: number;
        remaining: number;
        completionPct: number;
    }>;
    filterOptions: {
        regions: string[];
        quintiles: string[];
        models: string[];
    };
    activeFilters: {
        region: string;
        quintile: string;
        model: string;
    };
};

function uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeFilterValue(value?: string): string {
    const normalized = String(value || "all").trim();
    return normalized ? normalized : "all";
}

export async function computeDashboardStats(filters: DashboardFilters = {}): Promise<DashboardStats> {
    const runtime = await readRuntime();
    const items = readItems();
    const sampledSet = new Set(runtime.sampledTaskIds);
    const sampledItems = items.filter((item) => sampledSet.has(item.task_id));

    const filterOptions = {
        regions: uniqueSorted(sampledItems.map((item) => item.region || "unknown")),
        quintiles: uniqueSorted(sampledItems.map((item) => item.income_quintile || "unknown")),
        models: uniqueSorted(sampledItems.map((item) => item.model || "unknown"))
    };

    const activeFilters = {
        region: normalizeFilterValue(filters.region),
        quintile: normalizeFilterValue(filters.quintile),
        model: normalizeFilterValue(filters.model)
    };

    const filteredSampledItems = sampledItems.filter((item) => {
        const region = item.region || "unknown";
        const quintile = item.income_quintile || "unknown";
        const model = item.model || "unknown";

        if (activeFilters.region !== "all" && region !== activeFilters.region) {
            return false;
        }
        if (activeFilters.quintile !== "all" && quintile !== activeFilters.quintile) {
            return false;
        }
        if (activeFilters.model !== "all" && model !== activeFilters.model) {
            return false;
        }
        return true;
    });

    const filteredTaskIds = new Set(filteredSampledItems.map((item) => item.task_id));
    const filteredResponses = runtime.responses.filter((response) => filteredTaskIds.has(response.taskId));
    const filteredSkips = runtime.skipped.filter((skip) => filteredTaskIds.has(skip.taskId));
    const completedTaskIds = new Set(filteredResponses.map((response) => response.taskId));

    const regionMap = new Map<string, { sampled: number; completed: number }>();
    const quintileMap = new Map<string, { sampled: number; completed: number }>();
    const queueMap = new Map<string, { region: string; quintile: string; sampled: number; completed: number }>();

    for (const item of filteredSampledItems) {
        const completed = completedTaskIds.has(item.task_id) ? 1 : 0;
        const region = item.region || "unknown";
        const quintile = item.income_quintile || "unknown";

        const regionStats = regionMap.get(region) || { sampled: 0, completed: 0 };
        regionStats.sampled += 1;
        regionStats.completed += completed;
        regionMap.set(region, regionStats);

        const quintileStats = quintileMap.get(quintile) || { sampled: 0, completed: 0 };
        quintileStats.sampled += 1;
        quintileStats.completed += completed;
        quintileMap.set(quintile, quintileStats);

        const key = `${region}__${quintile}`;
        const queueStats = queueMap.get(key) || { region, quintile, sampled: 0, completed: 0 };
        queueStats.sampled += 1;
        queueStats.completed += completed;
        queueMap.set(key, queueStats);
    }

    const regionFillRates = Array.from(regionMap.entries())
        .map(([region, stats]) => ({
            region,
            sampled: stats.sampled,
            completed: stats.completed,
            remaining: Math.max(stats.sampled - stats.completed, 0),
            completionPct: stats.sampled > 0 ? Math.round((stats.completed / stats.sampled) * 100) : 0
        }))
        .sort((a, b) => b.remaining - a.remaining || a.region.localeCompare(b.region));

    const quintileFillRates = Array.from(quintileMap.entries())
        .map(([quintile, stats]) => ({
            quintile,
            sampled: stats.sampled,
            completed: stats.completed,
            remaining: Math.max(stats.sampled - stats.completed, 0),
            completionPct: stats.sampled > 0 ? Math.round((stats.completed / stats.sampled) * 100) : 0
        }))
        .sort((a, b) => a.quintile.localeCompare(b.quintile));

    const itemsByTaskId = new Map(filteredSampledItems.map((item) => [item.task_id, item]));
    const modelSampledMap = new Map<string, { sampled: number; completedTaskIds: Set<string> }>();
    for (const item of filteredSampledItems) {
        const current = modelSampledMap.get(item.model) || { sampled: 0, completedTaskIds: new Set<string>() };
        current.sampled += 1;
        if (completedTaskIds.has(item.task_id)) {
            current.completedTaskIds.add(item.task_id);
        }
        modelSampledMap.set(item.model, current);
    }

    const modelVerdicts = new Map<string, { trueCount: number; falseCount: number; unsureCount: number }>();
    for (const response of filteredResponses) {
        const item = itemsByTaskId.get(response.taskId);
        if (!item) {
            continue;
        }

        const current = modelVerdicts.get(item.model) || { trueCount: 0, falseCount: 0, unsureCount: 0 };
        if (response.verdict === "true") {
            current.trueCount += 1;
        } else if (response.verdict === "false") {
            current.falseCount += 1;
        } else {
            current.unsureCount += 1;
        }
        modelVerdicts.set(item.model, current);
    }

    const modelMetrics = Array.from(modelSampledMap.entries())
        .map(([model, sampledStats]) => {
            const verdicts = modelVerdicts.get(model) || { trueCount: 0, falseCount: 0, unsureCount: 0 };
            const totalVerdicts = verdicts.trueCount + verdicts.falseCount + verdicts.unsureCount;
            return {
                model,
                sampled: sampledStats.sampled,
                completedTasks: sampledStats.completedTaskIds.size,
                remainingTasks: Math.max(sampledStats.sampled - sampledStats.completedTaskIds.size, 0),
                trueCount: verdicts.trueCount,
                falseCount: verdicts.falseCount,
                unsureCount: verdicts.unsureCount,
                agreementPct: totalVerdicts > 0 ? Math.round((verdicts.trueCount / totalVerdicts) * 100) : 0
            };
        })
        .sort((a, b) => b.remainingTasks - a.remainingTasks || a.model.localeCompare(b.model));

    const queueHealth = Array.from(queueMap.values())
        .map((cell) => ({
            region: cell.region,
            quintile: cell.quintile,
            sampled: cell.sampled,
            completed: cell.completed,
            remaining: Math.max(cell.sampled - cell.completed, 0),
            completionPct: cell.sampled > 0 ? Math.round((cell.completed / cell.sampled) * 100) : 0
        }))
        .sort((a, b) => b.remaining - a.remaining || a.region.localeCompare(b.region) || a.quintile.localeCompare(b.quintile));

    return {
        roundStatus: runtime.roundStatus,
        targetSampleSize: runtime.targetSampleSize,
        sampledTaskCount: filteredSampledItems.length,
        completedResponses: filteredResponses.length,
        skippedCount: filteredSkips.length,
        uniqueSessions: new Set(filteredResponses.map((response) => response.sessionId)).size,
        remainingResponses: Math.max(filteredSampledItems.length - filteredResponses.length, 0),
        regionFillRates,
        quintileFillRates,
        modelMetrics,
        queueHealth,
        filterOptions,
        activeFilters
    };
}
