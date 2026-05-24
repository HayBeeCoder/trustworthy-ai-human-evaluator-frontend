"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Item = {
    task_id: string;
    source_entry_id: string;
    source_file: string;
    source_row_number: number;
    image_id: string;
    image_url: string;
    model: string;
    region: string;
    income_quintile: string;
    ground_truth: string;
    predicted: string;
    error_type: string;
    sem_similarity: number | null;
    ctx_similarity: number | null;
    confidence: number | null;
    raw_response: string;
};

function getSessionId(): string {
    const key = "human_eval_session";
    let session = localStorage.getItem(key);
    if (!session) {
        session = crypto.randomUUID();
        localStorage.setItem(key, session);
    }
    return session;
}

function getNumberPreference(key: string, fallback: number): number {
    const raw = Number(localStorage.getItem(key) || "");
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export default function HomePage() {
    const [items, setItems] = useState<Item[]>([]);
    const [noteByTask, setNoteByTask] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [busyTaskIds, setBusyTaskIds] = useState<Record<string, boolean>>({});
    const [imagesPerBatch, setImagesPerBatch] = useState(1);
    const [gridColumns, setGridColumns] = useState(1);
    const [isBootstrapped, setIsBootstrapped] = useState(false);
    const [evalCount, setEvalCount] = useState(0);
    const [showGridNudge, setShowGridNudge] = useState(false);
    const [gridNudgeDismissed, setGridNudgeDismissed] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    const sessionId = useMemo(() => (typeof window === "undefined" ? "" : getSessionId()), []);

    async function loadBatch(nextCount = imagesPerBatch) {
        if (!sessionId) {
            return;
        }
        setLoading(true);
        setMessage("");
        try {
            const res = await fetch(`/api/public/next?sessionId=${sessionId}&count=${nextCount}`);
            if (!res.ok) {
                setItems([]);
                setMessage("Failed to load tasks. Please refresh.");
                return;
            }
            const data = await res.json();
            const nextItems = Array.isArray(data.items)
                ? (data.items as Item[])
                : data.item
                    ? [data.item as Item]
                    : [];

            setItems(nextItems);
        } finally {
            setLoading(false);
            setHasLoadedOnce(true);
        }
    }

    useEffect(() => {
        if (!sessionId) {
            return;
        }

        const preferredBatch = Math.max(1, Math.min(getNumberPreference("human_eval_batch_size", 1), 12));
        const preferredColumns = Math.max(1, Math.min(getNumberPreference("human_eval_grid_columns", 1), 4));
        const storedEvalCount = Math.max(0, getNumberPreference("human_eval_eval_count", 0));
        const dismissed = localStorage.getItem("human_eval_grid_nudge_dismissed") === "1";

        setImagesPerBatch(preferredBatch);
        setGridColumns(preferredColumns);
        setEvalCount(storedEvalCount);
        setGridNudgeDismissed(dismissed);
        setIsBootstrapped(true);
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId || !isBootstrapped) {
            return;
        }
        localStorage.setItem("human_eval_batch_size", String(imagesPerBatch));
        loadBatch(imagesPerBatch);
    }, [imagesPerBatch, sessionId, isBootstrapped]);

    useEffect(() => {
        if (!sessionId) {
            return;
        }
        localStorage.setItem("human_eval_grid_columns", String(gridColumns));
    }, [gridColumns, sessionId]);

    function handleGridColumnsChange(nextColumns: number) {
        const normalizedColumns = Math.max(1, Math.min(nextColumns, 4));
        setGridColumns(normalizedColumns);

        const adjustedBatch = Math.max(
            normalizedColumns,
            Math.min(Math.ceil(imagesPerBatch / normalizedColumns) * normalizedColumns, 12)
        );
        if (adjustedBatch !== imagesPerBatch) {
            setImagesPerBatch(adjustedBatch);
        }
    }

    async function submit(task: Item, verdict: "true" | "false" | "unsure") {
        if (!sessionId) {
            return;
        }

        setBusyTaskIds((current) => ({ ...current, [task.task_id]: true }));
        const res = await fetch("/api/public/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                taskId: task.task_id,
                sessionId,
                verdict,
                note: noteByTask[task.task_id] || ""
            })
        });

        if (!res.ok) {
            setMessage("Submission failed. Please try again.");
            setBusyTaskIds((current) => ({ ...current, [task.task_id]: false }));
            return;
        }

        const nextEvalCount = evalCount + 1;
        setEvalCount(nextEvalCount);
        localStorage.setItem("human_eval_eval_count", String(nextEvalCount));
        if (nextEvalCount >= 3 && !gridNudgeDismissed && imagesPerBatch === 1) {
            setShowGridNudge(true);
        }

        setNoteByTask((current) => {
            const next = { ...current };
            delete next[task.task_id];
            return next;
        });
        setMessage("Saved.");
        setBusyTaskIds((current) => ({ ...current, [task.task_id]: false }));
        await loadBatch();
    }

    async function skipTask(task: Item) {
        if (!sessionId) {
            return;
        }
        setBusyTaskIds((current) => ({ ...current, [task.task_id]: true }));
        const res = await fetch("/api/public/skip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task.task_id, sessionId })
        });

        if (!res.ok) {
            setMessage("Skip failed. Please try again.");
            setBusyTaskIds((current) => ({ ...current, [task.task_id]: false }));
            return;
        }

        setMessage("Task skipped.");
        setBusyTaskIds((current) => ({ ...current, [task.task_id]: false }));
        await loadBatch();
    }

    return (
        <main className="main">
            <div className="topbar">
                <h1><Link href="/">Prediction Review Studio</Link></h1>
                <Link href="/admin">Admin Dashboard</Link>
            </div>

            <p className="small">Welcome. Help review each prediction and choose True, False, Unsure or Skip the image.  Thanks for doing this :)</p>

            <div className="row evaluator-controls-row" style={{ marginBottom: 8 }}>
                <div>
                    <label htmlFor="batch-size">Images at a time</label>
                    <select
                        id="batch-size"
                        value={imagesPerBatch}
                        onChange={(e) => setImagesPerBatch(Number(e.target.value))}
                    >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={4}>4</option>
                        <option value={6}>6</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="grid-columns">Columns</label>
                    <select
                        id="grid-columns"
                        value={gridColumns}
                        onChange={(e) => handleGridColumnsChange(Number(e.target.value))}
                    >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                    </select>
                </div>
                <button className="ghost" onClick={() => loadBatch()} disabled={loading}>Refresh</button>
            </div>

            {loading ? <p className="small">Loading...</p> : null}
            {message ? <p className="small">{message}</p> : null}

            {!hasLoadedOnce && loading ? (
                <div className="evaluator-grid evaluator-skeleton-grid" style={{ ["--eval-grid-cols" as string]: String(gridColumns) }}>
                    {Array.from({ length: Math.max(1, Math.min(imagesPerBatch, 4)) }).map((_, idx) => (
                        <div key={`skeleton-${idx}`} className="card evaluator-grid-card evaluator-skeleton-card">
                            <div className="skeleton-line skeleton-line-meta" />
                            <div className="skeleton-block skeleton-image" />
                            <div className="skeleton-line skeleton-line-title" />
                            <div className="skeleton-line" />
                            <div className="skeleton-line" />
                            <div className="row action-row">
                                <div className="skeleton-btn" />
                                <div className="skeleton-btn" />
                                <div className="skeleton-btn" />
                                <div className="skeleton-btn" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {items.length === 0 && !loading && hasLoadedOnce ? (
                <div className="card">
                    <h2>No more tasks in your current sample.</h2>
                    <p className="small">Ask admin to increase sample size or start a new round.</p>
                </div>
            ) : null}

            {items.length > 0 ? (
                <div
                    className={`evaluator-grid ${items.length === 1 ? "is-single" : ""}`}
                    style={{ ["--eval-grid-cols" as string]: String(gridColumns) }}
                >
                    {items.map((item) => (
                        <div key={item.task_id} className="card evaluator-grid-card">
                            <p className="small meta">
                                Task {item.task_id} | {item.model} | {item.region} | {item.income_quintile}
                            </p>
                            <p className="small meta">
                                Source {item.source_file} row {item.source_row_number} | Entry {item.source_entry_id}
                            </p>
                            <div className="image-container evaluator-grid-image-container">
                                <img
                                    src={item.image_url}
                                    alt={item.image_id}
                                    loading="lazy"
                                />
                            </div>

                            <div className="task-details">
                                <p className="small abstention-note">
                                    <strong>How to interpret Abstention:</strong> when prediction value is <em>Abstention</em>, treat it as a model fallback state, not a class decision. It means the model could not support a confident True/False judgment from the image evidence, and your review helps decide the final label.
                                </p>
                                <p className="prediction-line">
                                    <strong>Prediction:</strong> <span className="prediction-value">{item.predicted}</span>
                                </p>
                                <p className="small meta">
                                    Ground truth: {item.ground_truth} | Error type: {item.error_type || "-"}
                                </p>

                                {/* <label htmlFor={`note-${item.task_id}`}>Optional note</label>
                                <textarea
                                    id={`note-${item.task_id}`}
                                    rows={3}
                                    value={noteByTask[item.task_id] || ""}
                                    onChange={(e) => {
                                        setNoteByTask((current) => ({
                                            ...current,
                                            [item.task_id]: e.target.value
                                        }));
                                    }}
                                    placeholder="Any context or ambiguity you noticed"
                                /> */}

                                <div className="row action-row">
                                    <button
                                        className="true"
                                        disabled={Boolean(busyTaskIds[item.task_id])}
                                        onClick={() => submit(item, "true")}
                                    >
                                        True
                                    </button>
                                    <button
                                        className="false"
                                        disabled={Boolean(busyTaskIds[item.task_id])}
                                        onClick={() => submit(item, "false")}
                                    >
                                        False
                                    </button>
                                    <button
                                        className="unsure"
                                        disabled={Boolean(busyTaskIds[item.task_id])}
                                        onClick={() => submit(item, "unsure")}
                                    >
                                        Unsure / Ambiguous
                                    </button>
                                    <button
                                        className="ghost"
                                        disabled={Boolean(busyTaskIds[item.task_id])}
                                        onClick={() => skipTask(item)}
                                    >
                                        Skip
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {showGridNudge ? (
                <div className="engage-popup">
                    <h3>Nice pace so far</h3>
                    <p className="small">You can evaluate faster by showing multiple images at once.</p>
                    <div className="row">
                        <button
                            className="true"
                            onClick={() => {
                                setImagesPerBatch(4);
                                setGridColumns(2);
                                setShowGridNudge(false);
                                setGridNudgeDismissed(true);
                                localStorage.setItem("human_eval_grid_nudge_dismissed", "1");
                            }}
                        >
                            Try 4-image grid
                        </button>
                        <button
                            className="ghost"
                            onClick={() => {
                                setShowGridNudge(false);
                                setGridNudgeDismissed(true);
                                localStorage.setItem("human_eval_grid_nudge_dismissed", "1");
                            }}
                        >
                            Keep current view
                        </button>
                    </div>
                </div>
            ) : null}
        </main>
    );
}
