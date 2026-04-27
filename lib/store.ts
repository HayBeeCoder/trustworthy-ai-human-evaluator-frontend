import fs from "fs";
import path from "path";

export type EvalItem = {
    task_id: string;
    image_id: string;
    image_filename: string;
    image_url: string;
    model: string;
    region: string;
    income_quintile: string;
    ground_truth: string;
    predicted: string;
    model_error_type: string;
};

export type EvalResponse = {
    taskId: string;
    sessionId: string;
    verdict: "true" | "false" | "unsure";
    note: string;
    createdAt: string;
};

export type EvalSkip = {
    taskId: string;
    sessionId: string;
    createdAt: string;
};

export type RuntimeState = {
    targetSampleSize: number;
    sampledTaskIds: string[];
    responses: EvalResponse[];
    skipped: EvalSkip[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_PATH = path.join(DATA_DIR, "items.json");
const RUNTIME_PATH = path.join(DATA_DIR, "runtime.json");

export function readItems(): EvalItem[] {
    return JSON.parse(fs.readFileSync(ITEMS_PATH, "utf-8")) as EvalItem[];
}

export function readRuntime(): RuntimeState {
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf-8")) as Partial<RuntimeState>;
    return {
        targetSampleSize: Number(parsed.targetSampleSize ?? 0),
        sampledTaskIds: Array.isArray(parsed.sampledTaskIds) ? parsed.sampledTaskIds : [],
        responses: Array.isArray(parsed.responses) ? parsed.responses : [],
        skipped: Array.isArray(parsed.skipped) ? parsed.skipped : []
    };
}

export function writeRuntime(state: RuntimeState): void {
    fs.writeFileSync(RUNTIME_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function reseedSample(targetSampleSize: number): RuntimeState {
    const items = readItems();
    const state = readRuntime();
    const chosen = items.slice(0, Math.min(targetSampleSize, items.length));
    const chosenSet = new Set(chosen.map((item) => item.task_id));

    state.targetSampleSize = targetSampleSize;
    state.sampledTaskIds = Array.from(chosenSet);
    state.responses = state.responses.filter((resp) => chosenSet.has(resp.taskId));
    state.skipped = state.skipped.filter((skip) => chosenSet.has(skip.taskId));

    writeRuntime(state);
    return state;
}

export function nextTaskForSession(sessionId: string): EvalItem | null {
    const items = readItems();
    const state = readRuntime();

    const completed = new Set(
        state.responses.filter((r) => r.sessionId === sessionId).map((r) => r.taskId)
    );
    const skipped = new Set(
        state.skipped.filter((r) => r.sessionId === sessionId).map((r) => r.taskId)
    );

    const remaining = state.sampledTaskIds.filter((id) => !completed.has(id) && !skipped.has(id));
    if (remaining.length === 0) {
        return null;
    }

    const taskId = remaining[0];
    return items.find((item) => item.task_id === taskId) ?? null;
}

export function submitTaskForSession(input: {
    taskId: string;
    sessionId: string;
    verdict: "true" | "false" | "unsure";
    note?: string;
}): { ok: true } {
    const state = readRuntime();

    state.responses = state.responses.filter(
        (resp) => !(resp.taskId === input.taskId && resp.sessionId === input.sessionId)
    );

    state.responses.push({
        taskId: input.taskId,
        sessionId: input.sessionId,
        verdict: input.verdict,
        note: input.note ?? "",
        createdAt: new Date().toISOString()
    });

    state.skipped = state.skipped.filter(
        (skip) => !(skip.taskId === input.taskId && skip.sessionId === input.sessionId)
    );

    writeRuntime(state);
    return { ok: true };
}

export function skipTaskForSession(sessionId: string, taskId: string): { ok: true } {
    const state = readRuntime();
    const alreadySkipped = state.skipped.some(
        (skip) => skip.sessionId === sessionId && skip.taskId === taskId
    );

    if (!alreadySkipped) {
        state.skipped.push({
            taskId,
            sessionId,
            createdAt: new Date().toISOString()
        });
    }

    writeRuntime(state);
    return { ok: true };
}
