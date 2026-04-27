import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const DEFAULT_SAMPLE_SIZE = 120;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_RUNTIME_TABLE = process.env.SUPABASE_RUNTIME_TABLE || "eval_runtime";
const SUPABASE_RESPONSES_TABLE = process.env.SUPABASE_RESPONSES_TABLE || "eval_responses";
const SUPABASE_SKIPPED_TABLE = process.env.SUPABASE_SKIPPED_TABLE || "eval_skipped";

const supabase: SupabaseClient | null =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
              auth: { persistSession: false, autoRefreshToken: false }
          })
        : null;

export function readItems(): EvalItem[] {
    return JSON.parse(fs.readFileSync(ITEMS_PATH, "utf-8")) as EvalItem[];
}

function normalizeRuntime(parsed: Partial<RuntimeState>): RuntimeState {
    return {
        targetSampleSize: Number(parsed.targetSampleSize ?? 0),
        sampledTaskIds: Array.isArray(parsed.sampledTaskIds) ? parsed.sampledTaskIds : [],
        responses: Array.isArray(parsed.responses) ? parsed.responses : [],
        skipped: Array.isArray(parsed.skipped) ? parsed.skipped : []
    };
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => String(item));
}

function readRuntimeLocal(): RuntimeState {
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf-8")) as Partial<RuntimeState>;
    return normalizeRuntime(parsed);
}

function writeRuntimeLocal(state: RuntimeState): void {
    fs.writeFileSync(RUNTIME_PATH, JSON.stringify(state, null, 2), "utf-8");
}

async function ensureRuntimeRow(client: SupabaseClient): Promise<{
    target_sample_size: number;
    sampled_task_ids: unknown;
}> {
    const { data, error } = await client
        .from(SUPABASE_RUNTIME_TABLE)
        .select("target_sample_size,sampled_task_ids")
        .eq("id", 1)
        .maybeSingle();

    if (error) {
        throw new Error(`Supabase runtime read failed: ${error.message}`);
    }

    if (data) {
        return data;
    }

    const defaultIds = readItems()
        .slice(0, DEFAULT_SAMPLE_SIZE)
        .map((item) => item.task_id);

    const insertPayload = {
        id: 1,
        target_sample_size: DEFAULT_SAMPLE_SIZE,
        sampled_task_ids: defaultIds
    };

    const { data: inserted, error: insertError } = await client
        .from(SUPABASE_RUNTIME_TABLE)
        .upsert(insertPayload, { onConflict: "id" })
        .select("target_sample_size,sampled_task_ids")
        .single();

    if (insertError) {
        throw new Error(`Supabase runtime initialize failed: ${insertError.message}`);
    }

    return inserted;
}

export async function readRuntime(): Promise<RuntimeState> {
    if (!supabase) {
        return readRuntimeLocal();
    }

    const runtimeRow = await ensureRuntimeRow(supabase);

    const { data: responses, error: responsesError } = await supabase
        .from(SUPABASE_RESPONSES_TABLE)
        .select("task_id,session_id,verdict,note,created_at");
    if (responsesError) {
        throw new Error(`Supabase responses read failed: ${responsesError.message}`);
    }

    const { data: skipped, error: skippedError } = await supabase
        .from(SUPABASE_SKIPPED_TABLE)
        .select("task_id,session_id,created_at");
    if (skippedError) {
        throw new Error(`Supabase skipped read failed: ${skippedError.message}`);
    }

    return {
        targetSampleSize: Number(runtimeRow.target_sample_size ?? 0),
        sampledTaskIds: toStringArray(runtimeRow.sampled_task_ids),
        responses: (responses || []).map((row) => ({
            taskId: String(row.task_id),
            sessionId: String(row.session_id),
            verdict: row.verdict as "true" | "false" | "unsure",
            note: String(row.note ?? ""),
            createdAt: String(row.created_at)
        })),
        skipped: (skipped || []).map((row) => ({
            taskId: String(row.task_id),
            sessionId: String(row.session_id),
            createdAt: String(row.created_at)
        }))
    };
}

export async function reseedSample(targetSampleSize: number): Promise<RuntimeState> {
    if (!supabase) {
        const items = readItems();
        const state = readRuntimeLocal();
        const chosen = items.slice(0, Math.min(targetSampleSize, items.length));
        const chosenSet = new Set(chosen.map((item) => item.task_id));

        state.targetSampleSize = targetSampleSize;
        state.sampledTaskIds = Array.from(chosenSet);
        state.responses = state.responses.filter((resp) => chosenSet.has(resp.taskId));
        state.skipped = state.skipped.filter((skip) => chosenSet.has(skip.taskId));

        writeRuntimeLocal(state);
        return state;
    }

    const items = readItems();
    const chosen = items.slice(0, Math.min(targetSampleSize, items.length));
    const chosenIds = chosen.map((item) => item.task_id);

    const { error: runtimeError } = await supabase
        .from(SUPABASE_RUNTIME_TABLE)
        .upsert(
            {
                id: 1,
                target_sample_size: targetSampleSize,
                sampled_task_ids: chosenIds
            },
            { onConflict: "id" }
        );
    if (runtimeError) {
        throw new Error(`Supabase runtime update failed: ${runtimeError.message}`);
    }

    return readRuntime();
}

export async function nextTaskForSession(sessionId: string): Promise<EvalItem | null> {
    const items = readItems();
    const state = await readRuntime();

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

export async function submitTaskForSession(input: {
    taskId: string;
    sessionId: string;
    verdict: "true" | "false" | "unsure";
    note?: string;
}): Promise<{ ok: true }> {
    if (!supabase) {
        const state = readRuntimeLocal();

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

        writeRuntimeLocal(state);
        return { ok: true };
    }

    const { error: responseError } = await supabase.from(SUPABASE_RESPONSES_TABLE).upsert(
        {
            task_id: input.taskId,
            session_id: input.sessionId,
            verdict: input.verdict,
            note: input.note ?? ""
        },
        { onConflict: "task_id,session_id" }
    );
    if (responseError) {
        throw new Error(`Supabase submit failed: ${responseError.message}`);
    }

    const { error: skippedError } = await supabase
        .from(SUPABASE_SKIPPED_TABLE)
        .delete()
        .eq("task_id", input.taskId)
        .eq("session_id", input.sessionId);
    if (skippedError) {
        throw new Error(`Supabase submit cleanup failed: ${skippedError.message}`);
    }

    return { ok: true };
}

export async function skipTaskForSession(sessionId: string, taskId: string): Promise<{ ok: true }> {
    if (!supabase) {
        const state = readRuntimeLocal();
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

        writeRuntimeLocal(state);
        return { ok: true };
    }

    const { error } = await supabase.from(SUPABASE_SKIPPED_TABLE).upsert(
        {
            task_id: taskId,
            session_id: sessionId
        },
        { onConflict: "task_id,session_id" }
    );
    if (error) {
        throw new Error(`Supabase skip failed: ${error.message}`);
    }

    return { ok: true };
}
