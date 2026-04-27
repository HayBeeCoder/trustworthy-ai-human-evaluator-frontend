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

export type RuntimeState = {
    targetSampleSize: number;
    sampledTaskIds: string[];
    responses: EvalResponse[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_PATH = path.join(DATA_DIR, "items.json");
const RUNTIME_PATH = path.join(DATA_DIR, "runtime.json");

export function readItems(): EvalItem[] {
    return JSON.parse(fs.readFileSync(ITEMS_PATH, "utf-8")) as EvalItem[];
}

export function readRuntime(): RuntimeState {
    return JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf-8")) as RuntimeState;
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

    writeRuntime(state);
    return state;
}

export function nextTaskForSession(sessionId: string): EvalItem | null {
    const items = readItems();
    const state = readRuntime();

    const completed = new Set(
        state.responses.filter((r) => r.sessionId === sessionId).map((r) => r.taskId)
    );

    const remaining = state.sampledTaskIds.filter((id) => !completed.has(id));
    if (remaining.length === 0) {
        return null;
    }

    const taskId = remaining[0];
    return items.find((item) => item.task_id === taskId) ?? null;
}
