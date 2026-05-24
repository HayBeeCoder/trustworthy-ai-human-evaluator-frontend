"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Stats = {
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
    qualityFillRates: Array<{
        label: string;
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

type CatalogEntry = {
    imageId: string;
    imageUrl: string;
    region: string;
    incomeQuintile: string;
    predictions: Array<{
        taskId: string;
        sourceEntryId: string;
        sourceFile: string;
        sourceRowNumber: number;
        model: string;
        predicted: string;
        groundTruth: string;
        errorType: string;
    }>;
};

type Verdict = "true" | "false" | "unsure";

type DashboardTab = "all" | "round" | "overview" | "region" | "quintile" | "quality" | "model" | "queue" | "catalog" | "readme";
const TAB_KEYS: DashboardTab[] = ["all", "round", "overview", "region", "quintile", "quality", "model", "queue", "catalog", "readme"];

const TAB_META: Array<{ key: DashboardTab; label: string; description: string }> = [
    {
        key: "all",
        label: "All",
        description: "Compact command view with all dashboard sections visible together."
    },
    {
        key: "round",
        label: "Round",
        description: "Start or stop round and update target sample size quickly."
    },
    {
        key: "overview",
        label: "Overview",
        description: "Quick pulse of total progress, response volume, and remaining work."
    },
    {
        key: "region",
        label: "Region",
        description: "Completion coverage split by geographic region."
    },
    {
        key: "quintile",
        label: "Quintile",
        description: "Completion coverage split by income quintile buckets."
    },
    {
        key: "quality",
        label: "Error/Correct",
        description: "Coverage by error type and correct predictions."
    },
    {
        key: "model",
        label: "Model",
        description: "Model-by-model quality snapshot with verdict distribution."
    },
    {
        key: "queue",
        label: "Queue",
        description: "Most underfilled region and quintile cells to prioritize next."
    },
    {
        key: "catalog",
        label: "Catalog",
        description: "Browse image-by-image and compare predictions from all models on one screen."
    },
    {
        key: "readme",
        label: "README",
        description: "Concise guide to what each admin section does and when to use it."
    }
];

function getAdminSessionId(): string {
    const key = "admin_eval_session";
    let session = localStorage.getItem(key);
    if (!session) {
        session = crypto.randomUUID();
        localStorage.setItem(key, session);
    }
    return session;
}

export default function AdminPage() {
    const POLL_INTERVAL_MS = 10000;
    const DEFAULT_CATALOG_PAGE_SIZE = 4;
    const [stats, setStats] = useState<Stats | null>(null);
    const [authState, setAuthState] = useState<"checking" | "locked" | "unlocked">("checking");
    const [passcode, setPasscode] = useState("");
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [target, setTarget] = useState(120);
    const [targetInitialized, setTargetInitialized] = useState(false);
    const [isEditingTarget, setIsEditingTarget] = useState(false);
    const [isSavingTarget, setIsSavingTarget] = useState(false);
    const [isUpdatingRound, setIsUpdatingRound] = useState(false);
    const [message, setMessage] = useState("");
    const [activeTab, setActiveTab] = useState<DashboardTab>("all");
    const [filterRegion, setFilterRegion] = useState("all");
    const [filterQuintile, setFilterQuintile] = useState("all");
    const [filterModel, setFilterModel] = useState("all");
    const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
    const [catalogPage, setCatalogPage] = useState(1);
    const [catalogPageSize, setCatalogPageSize] = useState(DEFAULT_CATALOG_PAGE_SIZE);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogEvaluations, setCatalogEvaluations] = useState<Record<string, Verdict>>({});
    const [evaluatingTaskIds, setEvaluatingTaskIds] = useState<Record<string, boolean>>({});
    const [catalogModalImageId, setCatalogModalImageId] = useState<string>("");
    const [catalogModalPosition, setCatalogModalPosition] = useState<{ left: number; top: number }>({ left: 32, top: 32 });
    const catalogModalCloseTimerRef = useRef<number | null>(null);
    const catalogModalRef = useRef<HTMLDivElement | null>(null);
    const adminSessionId = useMemo(() => (typeof window === "undefined" ? "" : getAdminSessionId()), []);

    async function checkAuth() {
        const res = await fetch("/api/admin/auth", { cache: "no-store" });
        if (res.ok) {
            setAuthState("unlocked");
            return true;
        }
        setAuthState("locked");
        return false;
    }

    function buildFilterQuery(): string {
        const query = new URLSearchParams();
        query.set("region", filterRegion);
        query.set("quintile", filterQuintile);
        query.set("model", filterModel);
        return query.toString();
    }

    async function fetchStats() {
        const res = await fetch(`/api/admin/stats?${buildFilterQuery()}`, { cache: "no-store" });
        if (!res.ok) {
            if (res.status === 401) {
                setAuthState("locked");
                setMessage("Enter admin passcode to view dashboard.");
                return;
            }
            setMessage("Failed to fetch live stats.");
            return;
        }
        const data = await res.json();
        setStats(data);
        if (!targetInitialized || !isEditingTarget) {
            setTarget(data.targetSampleSize);
            setTargetInitialized(true);
        }
    }

    async function fetchCatalog() {
        setCatalogLoading(true);
        const res = await fetch("/api/admin/catalog", { cache: "no-store" });
        if (!res.ok) {
            setMessage("Failed to load prediction catalog.");
            setCatalogLoading(false);
            return;
        }

        const data = await res.json();
        const entries = Array.isArray(data.entries) ? (data.entries as CatalogEntry[]) : [];
        setCatalogEntries(entries);
        setCatalogPage((current) => {
            const totalPages = Math.max(Math.ceil(entries.length / catalogPageSize), 1);
            return Math.min(current, totalPages);
        });
        setCatalogLoading(false);
    }

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const currentTab = new URLSearchParams(window.location.search).get("tab");
        if (currentTab && TAB_KEYS.includes(currentTab as DashboardTab)) {
            setActiveTab(currentTab as DashboardTab);
        }
    }, []);

    useEffect(() => {
        if (authState !== "unlocked") {
            return;
        }

        fetchStats();
        fetchCatalog();

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                fetchStats();
            }
        }, POLL_INTERVAL_MS);

        function handleVisibilityChange() {
            if (document.visibilityState === "visible") {
                fetchStats();
            }
        }

        function handleFocus() {
            fetchStats();
        }

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleFocus);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleFocus);
        };
    }, [authState, filterRegion, filterQuintile, filterModel]);

    function setActiveTabWithUrl(nextTab: DashboardTab) {
        setActiveTab(nextTab);
        if (typeof window === "undefined") {
            return;
        }

        const query = new URLSearchParams(window.location.search);
        query.set("tab", nextTab);
        const nextUrl = `${window.location.pathname}?${query.toString()}`;
        window.history.replaceState({}, "", nextUrl);
    }

    function resetFilters() {
        setFilterRegion("all");
        setFilterQuintile("all");
        setFilterModel("all");
    }

    async function unlockAdmin() {
        if (!passcode) {
            setMessage("Enter passcode.");
            return;
        }

        setIsUnlocking(true);
        setMessage("Checking passcode...");
        const res = await fetch("/api/admin/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passcode })
        });

        if (!res.ok) {
            setMessage("Invalid passcode.");
            setIsUnlocking(false);
            return;
        }

        setAuthState("unlocked");
        setPasscode("");
        setMessage("Access granted.");
        setIsUnlocking(false);
    }

    async function lockAdmin() {
        await fetch("/api/admin/auth", { method: "DELETE" });
        setAuthState("locked");
        setStats(null);
        setMessage("Dashboard locked.");
    }

    async function updateRoundStatus(action: "start" | "stop") {
        setIsUpdatingRound(true);
        setMessage(action === "start" ? "Starting round..." : "Stopping round...");

        const res = await fetch("/api/admin/round", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action })
        });

        if (!res.ok) {
            setMessage("Failed to update round status.");
            setIsUpdatingRound(false);
            return;
        }

        setMessage(action === "start" ? "Round started." : "Round stopped.");
        setIsUpdatingRound(false);
        await fetchStats();
    }

    function exportActiveTab() {
        const query = new URLSearchParams();
        query.set(
            "table",
            activeTab === "all" || activeTab === "catalog" || activeTab === "round" || activeTab === "readme"
                ? "overview"
                : activeTab
        );
        query.set("region", filterRegion);
        query.set("quintile", filterQuintile);
        query.set("model", filterModel);
        const url = `/api/admin/export?${query.toString()}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    function renderFiltersCard(className = "card admin-filters-top") {
        return (
            <div className={className}>
                <h2>Filters</h2>
                <p className="small">Limit metrics to selected slices.</p>
                <div className="filters-grid">
                    <div>
                        <label htmlFor="filter-region">Region</label>
                        <select
                            id="filter-region"
                            value={filterRegion}
                            onChange={(e) => setFilterRegion(e.target.value)}
                        >
                            <option value="all">All regions</option>
                            {(stats?.filterOptions.regions || []).map((region) => (
                                <option key={region} value={region}>{region.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="filter-quintile">Income Quintile</label>
                        <select
                            id="filter-quintile"
                            value={filterQuintile}
                            onChange={(e) => setFilterQuintile(e.target.value)}
                        >
                            <option value="all">All quintiles</option>
                            {(stats?.filterOptions.quintiles || []).map((quintile) => (
                                <option key={quintile} value={quintile}>{quintile}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="filter-model">Model</label>
                        <select
                            id="filter-model"
                            value={filterModel}
                            onChange={(e) => setFilterModel(e.target.value)}
                        >
                            <option value="all">All models</option>
                            {(stats?.filterOptions.models || []).map((model) => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                    <button className="ghost" onClick={resetFilters}>Reset Filters</button>
                </div>
            </div>
        );
    }

    function renderReadmeQuickLinks(className = "readme-quick-links") {
        return (
            <div className={className}>
                <p className="small readme-guide-heading">Concise guide to what each admin section does and when to use it:</p>
                <div className="readme-nav-list">
                    {TAB_META.map((tab) => (
                        <button
                            key={`readme-nav-${tab.key}`}
                            type="button"
                            className="readme-nav-item"
                            onClick={() => setActiveTabWithUrl(tab.key)}
                            aria-label={`Open ${tab.label} section`}
                        >
                            <span className="readme-nav-title">{tab.label}</span>
                            <span className="small readme-nav-copy">{tab.description}</span>
                            <span className="readme-nav-arrow" aria-hidden="true">-&gt;</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    const totalCatalogPages = Math.max(Math.ceil(catalogEntries.length / catalogPageSize), 1);
    const pageStartIndex = (catalogPage - 1) * catalogPageSize;
    const pageEndIndex = pageStartIndex + catalogPageSize;
    const pagedCatalogEntries = catalogEntries.slice(pageStartIndex, pageEndIndex);
    const catalogModalEntry = pagedCatalogEntries.find((entry) => entry.imageId === catalogModalImageId) || null;

    useEffect(() => {
        setCatalogPage((current) => Math.min(current, totalCatalogPages));
    }, [totalCatalogPages]);

    useEffect(() => {
        const hasModalEntryOnPage = pagedCatalogEntries.some((entry) => entry.imageId === catalogModalImageId);
        if (!hasModalEntryOnPage) {
            setCatalogModalImageId("");
        }
    }, [catalogModalImageId, pagedCatalogEntries]);

    useEffect(() => {
        return () => {
            if (catalogModalCloseTimerRef.current) {
                window.clearTimeout(catalogModalCloseTimerRef.current);
            }
        };
    }, []);

    function keepCatalogModalOpen(
        imageId: string,
        pointer?: { pageX: number; pageY: number }
    ) {
        if (catalogModalCloseTimerRef.current) {
            window.clearTimeout(catalogModalCloseTimerRef.current);
            catalogModalCloseTimerRef.current = null;
        }

        if (pointer && typeof window !== "undefined") {
            const spacing = 6;
            const pointerX = pointer.pageX - window.scrollX;
            const pointerY = pointer.pageY - window.scrollY;
            const modalWidth = Math.min(680, window.innerWidth - 24);
            const modalHeight = Math.min(560, window.innerHeight - 24);
            const minLeft = spacing;
            const minTop = spacing;
            const maxLeft = Math.max(window.innerWidth - modalWidth - spacing, minLeft);
            const maxTop = Math.max(window.innerHeight - modalHeight - spacing, minTop);
            const hasSpaceRight = pointerX + spacing + modalWidth <= window.innerWidth - spacing;
            const hasSpaceBottom = pointerY + spacing + modalHeight <= window.innerHeight - spacing;
            const preferredLeft = hasSpaceRight ? pointerX + spacing : pointerX - modalWidth - spacing;
            const preferredTop = hasSpaceBottom ? pointerY + spacing : pointerY - modalHeight - spacing;

            setCatalogModalPosition({
                left: Math.max(minLeft, Math.min(preferredLeft, maxLeft)),
                top: Math.max(minTop, Math.min(preferredTop, maxTop))
            });
        }

        setCatalogModalImageId(imageId);
    }

    useEffect(() => {
        if (!catalogModalImageId || !catalogModalRef.current) {
            return;
        }

        function clampModalToViewport() {
            if (!catalogModalRef.current) {
                return;
            }

            const viewportGap = 8;
            const rect = catalogModalRef.current.getBoundingClientRect();
            const overflowRight = rect.right - (window.innerWidth - viewportGap);
            const overflowLeft = viewportGap - rect.left;
            const overflowBottom = rect.bottom - (window.innerHeight - viewportGap);
            const overflowTop = viewportGap - rect.top;

            let nextLeft = catalogModalPosition.left;
            let nextTop = catalogModalPosition.top;

            if (overflowRight > 0) {
                nextLeft -= overflowRight;
            } else if (overflowLeft > 0) {
                nextLeft += overflowLeft;
            }

            if (overflowBottom > 0) {
                nextTop -= overflowBottom;
            } else if (overflowTop > 0) {
                nextTop += overflowTop;
            }

            if (Math.abs(nextLeft - catalogModalPosition.left) > 0.5 || Math.abs(nextTop - catalogModalPosition.top) > 0.5) {
                setCatalogModalPosition({
                    left: Math.max(viewportGap, nextLeft),
                    top: Math.max(viewportGap, nextTop)
                });
            }
        }

        clampModalToViewport();
        window.addEventListener("resize", clampModalToViewport);
        window.addEventListener("scroll", clampModalToViewport, { passive: true });
        return () => {
            window.removeEventListener("resize", clampModalToViewport);
            window.removeEventListener("scroll", clampModalToViewport);
        };
    }, [catalogModalImageId, catalogModalPosition]);

    function scheduleCatalogModalClose() {
        if (catalogModalCloseTimerRef.current) {
            window.clearTimeout(catalogModalCloseTimerRef.current);
        }
        catalogModalCloseTimerRef.current = window.setTimeout(() => {
            setCatalogModalImageId("");
            catalogModalCloseTimerRef.current = null;
        }, 140);
    }

    async function evaluateCatalogTask(taskId: string, verdict: Verdict) {
        if (!adminSessionId) {
            setMessage("Admin evaluator session unavailable.");
            return;
        }

        setEvaluatingTaskIds((current) => ({ ...current, [taskId]: true }));
        const res = await fetch("/api/admin/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId, sessionId: adminSessionId, verdict })
        });

        if (!res.ok) {
            setMessage("Failed to save catalog evaluation.");
            setEvaluatingTaskIds((current) => ({ ...current, [taskId]: false }));
            return;
        }

        setCatalogEvaluations((current) => ({ ...current, [taskId]: verdict }));
        setEvaluatingTaskIds((current) => ({ ...current, [taskId]: false }));
        setMessage("Catalog evaluation saved.");
        await fetchStats();
    }

    async function updateTarget() {
        const previousStats = stats;
        setIsSavingTarget(true);
        setMessage("Saving sample size...");

        if (previousStats) {
            setStats({
                ...previousStats,
                targetSampleSize: target
            });
        }

        const res = await fetch("/api/admin/sample-size", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetSampleSize: target })
        });

        if (!res.ok) {
            if (previousStats) {
                setStats(previousStats);
            }
            setMessage("Failed to update sample size.");
            setIsSavingTarget(false);
            return;
        }

        const data = await res.json();

        setStats((current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                targetSampleSize: Number(data.targetSampleSize ?? current.targetSampleSize),
                sampledTaskCount: Number(data.sampledTaskCount ?? current.sampledTaskCount),
                remainingResponses: Math.max(
                    Number(data.sampledTaskCount ?? current.sampledTaskCount) - current.completedResponses,
                    0
                )
            };
        });

        setMessage("Sample size updated.");
        setIsEditingTarget(false);
        setIsSavingTarget(false);
        await fetchStats();
    }

    if (authState === "checking") {
        return (
            <main className="main">
                <div className="card">
                    <h2>Admin Access</h2>
                    <p className="small">Checking access...</p>
                </div>
            </main>
        );
    }

    if (authState === "locked") {
        return (
            <main className="main">
                <div className="topbar">
                    <h1>Admin Dashboard</h1>
                    <Link href="/">Go to Evaluator Page</Link>
                </div>

                <div className="card">
                    <h2>Enter Admin Passcode</h2>
                    <label htmlFor="passcode">Passcode</label>
                    <input
                        id="passcode"
                        type="password"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                unlockAdmin();
                            }
                        }}
                        placeholder="Enter admin passcode"
                    />
                    <div className="row" style={{ marginTop: 12 }}>
                        <button className="true" onClick={unlockAdmin} disabled={isUnlocking}>
                            {isUnlocking ? "Unlocking..." : "Unlock Dashboard"}
                        </button>
                    </div>
                    {message ? <p className="small">{message}</p> : null}
                </div>
            </main>
        );
    }

    return (
        <main className="main admin-page">
            <div className="topbar">
                <h1>Admin Dashboard</h1>
                <div className="row" style={{ gap: 8 }}>
                    <Link href="/">Go to Evaluator Page</Link>
                    <button className="ghost" onClick={lockAdmin}>Lock</button>
                </div>
            </div>

            <div className={`admin-layout ${activeTab === "readme" ? "with-right-rail" : ""}`}>
                <aside className="admin-sidebar-stack">
                    <div className="card admin-sidebar">
                        <h2>Sections</h2>
                        <p className="small">Choose what to inspect or control.</p>
                        <div className="tab-row">
                            {TAB_META.map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className={`ghost tab-chip ${activeTab === tab.key ? "is-active" : ""}`}
                                    onClick={() => setActiveTabWithUrl(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <p className="small tab-description">
                            {TAB_META.find((tab) => tab.key === activeTab)?.description}
                        </p>
                        <button className="ghost" onClick={exportActiveTab}>Export Current Tab CSV</button>
                    </div>
                </aside>

                <section className="admin-content">
                    {(activeTab !== "all" && activeTab !== "round" && activeTab !== "readme") ? renderFiltersCard() : null}

                    <section className="admin-control-grid">
                        {(activeTab === "round" || activeTab === "all") ? (
                            <div className="card card-round">
                                <h2>Round Settings</h2>
                                <p className="small">Control round state and sample size.</p>
                                <div className="round-settings-line round-settings-line-row">
                                    <p className="small round-status-chip">
                                        Status: <strong>{stats?.roundStatus === "stopped" ? "Stopped" : "Running"}</strong>
                                    </p>
                                    <div className="row round-actions-row">
                                        <button
                                            className="true"
                                            onClick={() => updateRoundStatus("start")}
                                            disabled={isUpdatingRound || stats?.roundStatus === "running"}
                                        >
                                            Start Round
                                        </button>
                                        <button
                                            className="false"
                                            onClick={() => updateRoundStatus("stop")}
                                            disabled={isUpdatingRound || stats?.roundStatus === "stopped"}
                                        >
                                            Stop Round
                                        </button>
                                    </div>
                                </div>

                                <div className="round-settings-line round-settings-line-row">
                                    <label htmlFor="target">Target sample size</label>
                                    <input
                                        id="target"
                                        type="number"
                                        min={1}
                                        value={target}
                                        onFocus={() => setIsEditingTarget(true)}
                                        onBlur={() => setIsEditingTarget(false)}
                                        onChange={(e) => {
                                            setIsEditingTarget(true);
                                            setTarget(Number(e.target.value));
                                        }}
                                    />
                                    <button className="true" onClick={updateTarget} disabled={isSavingTarget}>
                                        {isSavingTarget ? "Applying..." : "Apply"}
                                    </button>
                                </div>
                                <p className="small" style={{ marginTop: 6 }}>
                                    Saved target: <strong>{stats?.targetSampleSize ?? "-"}</strong>
                                </p>
                            </div>
                        ) : null}

                        {activeTab === "all" ? renderFiltersCard("card card-filters-inline") : null}

                        {(activeTab === "overview" || activeTab === "all") ? (
                            <div className="card card-progress">
                                <h2>Progress</h2>
                                <p className="small">Topline round throughput and completion.</p>
                                {stats ? (
                                    <>
                                        <p>Sampled tasks: <strong>{stats.sampledTaskCount}</strong></p>
                                        <p>Responses submitted: <strong>{stats.completedResponses}</strong></p>
                                        <p>Tasks skipped: <strong>{stats.skippedCount}</strong></p>
                                        <p>Unique sessions: <strong>{stats.uniqueSessions}</strong></p>
                                        <p>Remaining responses to complete sample once: <strong>{stats.remainingResponses}</strong></p>
                                    </>
                                ) : (
                                    <p className="small">Loading metrics...</p>
                                )}
                                {message ? <p className="small">{message}</p> : null}
                            </div>
                        ) : null}
                    </section>

                    {stats ? (
                        <div className={activeTab === "all" ? "dashboard-panels-grid" : ""}>
                    {(activeTab === "region" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Coverage by Region</h2>
                            <p className="small">Where completion is strongest or lagging by region.</p>
                            {stats.regionFillRates.length === 0 ? (
                                <p className="small">No region metrics yet.</p>
                            ) : (
                                <div className="metric-list">
                                    {stats.regionFillRates.map((entry) => (
                                        <div key={entry.region} className="metric-row">
                                            <div className="metric-row-head">
                                                <strong>{entry.region.toUpperCase()}</strong>
                                                <span className="small">{entry.completed}/{entry.sampled} complete</span>
                                            </div>
                                            <div className="progress-bar">
                                                <div style={{ width: `${entry.completionPct}%` }} />
                                            </div>
                                            <p className="small">Remaining: {entry.remaining} ({entry.completionPct}% complete)</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {(activeTab === "quintile" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Coverage by Income Quintile</h2>
                            <p className="small">Progress distribution by income segments.</p>
                            {stats.quintileFillRates.length === 0 ? (
                                <p className="small">No quintile metrics yet.</p>
                            ) : (
                                <div className="metric-list">
                                    {stats.quintileFillRates.map((entry) => (
                                        <div key={entry.quintile} className="metric-row">
                                            <div className="metric-row-head">
                                                <strong>{entry.quintile}</strong>
                                                <span className="small">{entry.completed}/{entry.sampled} complete</span>
                                            </div>
                                            <div className="progress-bar">
                                                <div style={{ width: `${entry.completionPct}%` }} />
                                            </div>
                                            <p className="small">Remaining: {entry.remaining} ({entry.completionPct}% complete)</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {(activeTab === "quality" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Coverage by Error Type / Correct</h2>
                            <p className="small">Completion split for correct predictions and error categories.</p>
                            {stats.qualityFillRates.length === 0 ? (
                                <p className="small">No quality coverage metrics yet.</p>
                            ) : (
                                <div className="metric-list">
                                    {stats.qualityFillRates.map((entry) => (
                                        <div key={entry.label} className="metric-row">
                                            <div className="metric-row-head">
                                                <strong>{entry.label}</strong>
                                                <span className="small">{entry.completed}/{entry.sampled} complete</span>
                                            </div>
                                            <div className="progress-bar">
                                                <div style={{ width: `${entry.completionPct}%` }} />
                                            </div>
                                            <p className="small">Remaining: {entry.remaining} ({entry.completionPct}% complete)</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {(activeTab === "model" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Model Quality Snapshot</h2>
                            <p className="small">Verdict mix and agreement signal per model.</p>
                            {stats.modelMetrics.length === 0 ? (
                                <p className="small">No model metrics yet.</p>
                            ) : (
                                <div className="table-wrap">
                                    <table className="dashboard-table">
                                        <thead>
                                            <tr>
                                                <th>Model</th>
                                                <th>Sampled</th>
                                                <th>Done</th>
                                                <th>Remaining</th>
                                                <th>True</th>
                                                <th>False</th>
                                                <th>Unsure</th>
                                                <th>Agreement</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.modelMetrics.map((entry) => (
                                                <tr key={entry.model}>
                                                    <td>{entry.model}</td>
                                                    <td>{entry.sampled}</td>
                                                    <td>{entry.completedTasks}</td>
                                                    <td>{entry.remainingTasks}</td>
                                                    <td>{entry.trueCount}</td>
                                                    <td>{entry.falseCount}</td>
                                                    <td>{entry.unsureCount}</td>
                                                    <td>{entry.agreementPct}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}

                    {(activeTab === "queue" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Queue Health (Region x Quintile)</h2>
                            <p className="small">Cells with most remaining work to prioritize.</p>
                            {stats.queueHealth.length === 0 ? (
                                <p className="small">No queue health metrics yet.</p>
                            ) : (
                                <div className="table-wrap">
                                    <table className="dashboard-table">
                                        <thead>
                                            <tr>
                                                <th>Region</th>
                                                <th>Quintile</th>
                                                <th>Sampled</th>
                                                <th>Done</th>
                                                <th>Remaining</th>
                                                <th>Completion</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.queueHealth.map((entry) => (
                                                <tr key={`${entry.region}-${entry.quintile}`}>
                                                    <td>{entry.region.toUpperCase()}</td>
                                                    <td>{entry.quintile}</td>
                                                    <td>{entry.sampled}</td>
                                                    <td>{entry.completed}</td>
                                                    <td>{entry.remaining}</td>
                                                    <td>{entry.completionPct}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}
                        </div>
                    ) : null}

                    {activeTab === "catalog" ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Prediction Catalog</h2>
                            <p className="small">Hover any image for a larger modal preview and evaluate directly in that view.</p>
                            <p className="small">
                                {catalogEntries.length > 0
                                    ? `Showing images ${pageStartIndex + 1}-${Math.min(pageEndIndex, catalogEntries.length)} of ${catalogEntries.length}`
                                    : "No catalog entries available."}
                            </p>

                            <div className="row catalog-toolbar-row" style={{ marginTop: 8 }}>
                                <label htmlFor="catalog-page-size">Images per page</label>
                                <select
                                    id="catalog-page-size"
                                    value={catalogPageSize}
                                    onChange={(e) => {
                                        setCatalogPage(1);
                                        setCatalogPageSize(Number(e.target.value));
                                    }}
                                >
                                    <option value={4}>4</option>
                                    <option value={8}>8</option>
                                    <option value={12}>12</option>
                                </select>
                            </div>

                            <div className="row" style={{ marginTop: 8 }}>
                                <button
                                    className="ghost"
                                    onClick={() => setCatalogPage((page) => Math.max(page - 1, 1))}
                                    disabled={catalogLoading || catalogEntries.length === 0 || catalogPage <= 1}
                                >
                                    Previous Page
                                </button>
                                <button
                                    className="ghost"
                                    onClick={() => setCatalogPage((page) => Math.min(page + 1, totalCatalogPages))}
                                    disabled={catalogLoading || catalogEntries.length === 0 || catalogPage >= totalCatalogPages}
                                >
                                    Next Page
                                </button>
                                <p className="small catalog-page-indicator">Page {catalogPage} of {totalCatalogPages}</p>
                                <button className="ghost" onClick={fetchCatalog} disabled={catalogLoading}>
                                    {catalogLoading ? "Refreshing..." : "Refresh Catalog"}
                                </button>
                            </div>

                            {pagedCatalogEntries.length > 0 ? (
                                <div className="catalog-grid" style={{ marginTop: 12 }}>
                                    {pagedCatalogEntries.map((entry) => (
                                        <button
                                            key={entry.imageId}
                                            type="button"
                                            className={`catalog-card catalog-thumb-card ${catalogModalImageId === entry.imageId ? "is-focused" : ""}`}
                                            onMouseEnter={(e) =>
                                                keepCatalogModalOpen(entry.imageId, {
                                                    pageX: e.pageX,
                                                    pageY: e.pageY
                                                })
                                            }
                                            onMouseLeave={scheduleCatalogModalClose}
                                            onClick={(e) =>
                                                keepCatalogModalOpen(entry.imageId, {
                                                    pageX: e.pageX,
                                                    pageY: e.pageY
                                                })
                                            }
                                        >
                                            <div className="catalog-image-wrap">
                                                <img className="catalog-thumb-image" src={entry.imageUrl} alt={entry.imageId} />
                                            </div>
                                            <div className="catalog-thumb-meta">
                                                <p className="small">Image ID: {entry.imageId}</p>
                                                <p className="small">{entry.region.toUpperCase()} | {entry.incomeQuintile}</p>
                                                <p className="small">{entry.predictions.length} model predictions</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="small" style={{ marginTop: 12 }}>
                                    {catalogLoading ? "Loading catalog..." : "No entries found."}
                                </p>
                            )}

                            {catalogModalEntry ? (
                                <div
                                    ref={catalogModalRef}
                                    className="catalog-hover-modal"
                                    onMouseEnter={() => keepCatalogModalOpen(catalogModalEntry.imageId)}
                                    onMouseLeave={scheduleCatalogModalClose}
                                    style={{ top: `${catalogModalPosition.top}px`, left: `${catalogModalPosition.left}px` }}
                                >
                                    <button
                                        type="button"
                                        className="ghost catalog-modal-close"
                                        onClick={() => setCatalogModalImageId("")}
                                    >
                                        Close
                                    </button>
                                    <div className="catalog-modal-image-wrap">
                                        <img src={catalogModalEntry.imageUrl} alt={catalogModalEntry.imageId} />
                                        <p className="small">Image ID: {catalogModalEntry.imageId}</p>
                                        <p className="small">{catalogModalEntry.region.toUpperCase()} | {catalogModalEntry.incomeQuintile}</p>
                                    </div>
                                    <div className="catalog-modal-eval">
                                        <p className="small">Evaluate in modal (optional):</p>
                                        <div className="catalog-accordion-row">
                                            {catalogModalEntry.predictions.map((prediction) => {
                                                const savedVerdict = catalogEvaluations[prediction.taskId];
                                                const isSaving = Boolean(evaluatingTaskIds[prediction.taskId]);

                                                return (
                                                    <div className="catalog-eval-accordion" key={`${catalogModalEntry.imageId}-${prediction.model}`}>
                                                        <div className="catalog-direct-row">
                                                            <span className="catalog-direct-model">{prediction.model}</span>
                                                            <span className="small">{savedVerdict ? `Saved: ${savedVerdict}` : "Not evaluated"}</span>
                                                        </div>
                                                        <p className="small">Source: {prediction.sourceFile} row {prediction.sourceRowNumber}</p>
                                                        <p className="small"><strong>Prediction:</strong> {prediction.predicted || "-"}</p>
                                                        <p className="small">Ground truth: {prediction.groundTruth || "-"} | Error type: {prediction.errorType || "-"}</p>
                                                        <div className="catalog-eval-actions">
                                                            <button
                                                                className={`true catalog-eval-btn ${savedVerdict === "true" ? "is-selected" : ""}`}
                                                                disabled={isSaving}
                                                                onClick={() => evaluateCatalogTask(prediction.taskId, "true")}
                                                            >
                                                                True
                                                            </button>
                                                            <button
                                                                className={`false catalog-eval-btn ${savedVerdict === "false" ? "is-selected" : ""}`}
                                                                disabled={isSaving}
                                                                onClick={() => evaluateCatalogTask(prediction.taskId, "false")}
                                                            >
                                                                False
                                                            </button>
                                                            <button
                                                                className={`unsure catalog-eval-btn ${savedVerdict === "unsure" ? "is-selected" : ""}`}
                                                                disabled={isSaving}
                                                                onClick={() => evaluateCatalogTask(prediction.taskId, "unsure")}
                                                            >
                                                                Unsure
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {activeTab === "readme" ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Admin Dashboard README</h2>
                            <div className="readme-layout" style={{ marginTop: 8 }}>
                                <div className="readme-left-pane">
                                    <p className="small">Use this as lightweight documentation while operating the dashboard.</p>
                                    <p className="small">Each card opens to show deeper guidance, while the closed state stays concise for quick scanning.</p>
                                    <div className="readme-accordion-list">
                                        <details className="readme-accordion-item">
                                            <summary><strong>Round</strong><span className="small">Control live collection settings.</span></summary>
                                            <p className="small">Start or stop collection before/after review windows, then set target sample size to define expected workload for the round.</p>
                                        </details>
                                        <details className="readme-accordion-item">
                                            <summary><strong>Overview</strong><span className="small">Quick pulse of progress.</span></summary>
                                            <p className="small">Check sampled volume, submitted responses, skips, unique sessions, and remaining responses to understand throughput health in seconds.</p>
                                        </details>
                                        <details className="readme-accordion-item">
                                            <summary><strong>Region and Quintile</strong><span className="small">Coverage fairness view.</span></summary>
                                            <p className="small">Use these together to spot under-covered slices and rebalance reviewer attention where completion lags.</p>
                                        </details>
                                        <details className="readme-accordion-item">
                                            <summary><strong>Error/Correct</strong><span className="small">Quality-distribution lens.</span></summary>
                                            <p className="small">Track where error categories still have low completion and where “Correct” still needs stronger confirmation coverage.</p>
                                        </details>
                                        <details className="readme-accordion-item">
                                            <summary><strong>Model</strong><span className="small">Per-model reliability snapshot.</span></summary>
                                            <p className="small">Compare verdict distribution and remaining tasks across models to identify weak models or bottlenecks.</p>
                                        </details>
                                        <details className="readme-accordion-item">
                                            <summary><strong>Queue</strong><span className="small">Backlog prioritization table.</span></summary>
                                            <p className="small">Region x Quintile matrix helps prioritize the highest-remaining cells first when planning catch-up work.</p>
                                        </details>
                                        <details className="readme-accordion-item">
                                            <summary><strong>Catalog</strong><span className="small">Image-first triage and spot-eval.</span></summary>
                                            <p className="small">Inspect predictions visually, open modal for detail, and save targeted evaluations without leaving the section.</p>
                                        </details>
                                        <details className="readme-accordion-item">
                                            <summary><strong>Filters and Export</strong><span className="small">Slice and share exact views.</span></summary>
                                            <p className="small">Apply region/quintile/model filters before exporting so shared CSVs reflect the exact operational slice under review.</p>
                                        </details>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </section>

                {activeTab === "readme" ? (
                    <aside className="admin-right-rail">
                        {renderReadmeQuickLinks("card readme-quick-links admin-readme-rail")}
                    </aside>
                ) : null}
            </div>
        </main>
    );
}
