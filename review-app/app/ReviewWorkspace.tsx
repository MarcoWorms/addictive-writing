"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { csvCell } from "./csv-utils.mjs";

type Condition = "withoutSkill" | "withSkill";
type Choice = "A" | "B" | "tie" | "skip";
type LayoutMode = "columns" | "stacked";

type OutputRecord = {
  output: string;
  outputWordCount?: number;
};

type ComparisonCase = {
  id: string;
  title: string;
  category?: string;
  sizeTier?: string;
  taskMode?: string;
  targetWordRange?: string | [number, number] | { min?: number; max?: number };
  sourceWordCount?: number;
  promptWordCount?: number;
  prompt: string;
  outputConstraint?: string;
  withoutSkill: OutputRecord;
  withSkill: OutputRecord;
};

type ComparisonResults = {
  schemaVersion?: number;
  status?: string;
  runId?: string;
  completedAt?: string;
  configuration?: {
    verifiedDisplayName?: string;
    requestedModel?: string;
    requestedEffort?: string;
  };
  cases: ComparisonCase[];
};

type ReviewRecord = {
  choice?: Choice;
  notes: string;
  reasons: string[];
  revealed: boolean;
  updatedAt?: string;
};

type StoredReview = {
  version: 2;
  runId: string;
  reviews: Record<string, ReviewRecord>;
  fontSize: number;
  layout: LayoutMode;
};

type Filters = {
  search: string;
  mode: string;
  size: string;
  category: string;
  status: string;
};

const STORAGE_KEY_PREFIX = "addictive-writing-blind-review-v2";
const REVIEWER_KEY = "addictive-writing-reviewer-id";
const REASONS = ["Hook", "Clarity", "Flow", "Voice", "Fidelity", "Constraints"];
const EMPTY_REVIEW: ReviewRecord = {
  notes: "",
  reasons: [],
  revealed: false,
};

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function inferMode(testCase: ComparisonCase) {
  if (testCase.taskMode) return testCase.taskMode;
  const prompt = testCase.prompt.toLowerCase();
  if (/\b(review|critique|diagnose|evaluate)\b/.test(prompt)) return "review";
  if (/\b(rewrite|copyedit|revise|turn the source|based (only )?on the source)\b/.test(prompt)) {
    return "rewrite";
  }
  return "creation";
}

function getRange(testCase: ComparisonCase) {
  const range = testCase.targetWordRange;
  if (typeof range === "string") return range;
  if (Array.isArray(range) && range.length === 2) {
    return `${range[0]}–${range[1]} target words`;
  }
  if (range && (range.min || range.max)) {
    if (range.min && range.max) return `${range.min}–${range.max} words`;
    if (range.min) return `${range.min}+ words`;
    return `up to ${range.max} words`;
  }
  if (testCase.sourceWordCount) return `${testCase.sourceWordCount} source words`;
  return `${testCase.promptWordCount ?? 0} prompt words`;
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function missesTarget(testCase: ComparisonCase, wordCount: number) {
  const range = testCase.targetWordRange;
  return Array.isArray(range) && range.length === 2
    ? wordCount < range[0] || wordCount > range[1]
    : false;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assignment(reviewerId: string, caseId: string) {
  const swapped = stableHash(`${reviewerId}:${caseId}`) % 2 === 1;
  return {
    A: swapped ? ("withSkill" as Condition) : ("withoutSkill" as Condition),
    B: swapped ? ("withoutSkill" as Condition) : ("withSkill" as Condition),
  };
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReviewWorkspace() {
  const [data, setData] = useState<ComparisonResults | null>(null);
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const [storageRun, setStorageRun] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});
  const [currentId, setCurrentId] = useState("");
  const [fontSize, setFontSize] = useState(17);
  const [layout, setLayout] = useState<LayoutMode>("columns");
  const [promptOpen, setPromptOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    mode: "all",
    size: "all",
    category: "all",
    status: "all",
  });
  const resetDialog = useRef<HTMLDialogElement>(null);
  const shortcutsDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    let localReviewerId = localStorage.getItem(REVIEWER_KEY);
    if (!localReviewerId) {
      localReviewerId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(REVIEWER_KEY, localReviewerId);
    }
    queueMicrotask(() => {
      if (!active) return;
      setReviewerId(localReviewerId);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/results.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Results request failed (${response.status})`);
        return response.json() as Promise<ComparisonResults>;
      })
      .then((results) => {
        if (results.status !== "complete" || results.schemaVersion !== 2) {
          throw new Error("Results are incomplete or use an unsupported schema");
        }
        if (!results.runId || !Array.isArray(results.cases) || results.cases.length !== 24) {
          throw new Error("Results do not contain the expected 24-case run");
        }
        setData(results);
        setCurrentId(results.cases[0]?.id ?? "");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoadError(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!ready || !data?.runId || storageRun === data.runId) return;
    let active = true;
    let stored: StoredReview | null = null;
    try {
      const key = `${STORAGE_KEY_PREFIX}:${data.runId}`;
      stored = JSON.parse(localStorage.getItem(key) ?? "null") as StoredReview | null;
    } catch {
      stored = null;
    }
    queueMicrotask(() => {
      if (!active) return;
      if (stored?.version === 2 && stored.runId === data.runId) {
        setReviews(stored.reviews ?? {});
        setFontSize(stored.fontSize ?? 17);
        setLayout(stored.layout ?? "columns");
      } else {
        setReviews({});
      }
      setStorageRun(data.runId);
    });
    return () => {
      active = false;
    };
  }, [data?.runId, ready, storageRun]);

  useEffect(() => {
    if (!ready || !data?.runId || storageRun !== data.runId) return;
    const payload: StoredReview = {
      version: 2,
      runId: data.runId,
      reviews,
      fontSize,
      layout,
    };
    localStorage.setItem(`${STORAGE_KEY_PREFIX}:${data.runId}`, JSON.stringify(payload));
  }, [data?.runId, fontSize, layout, ready, reviews, storageRun]);

  const modes = useMemo(
    () => [...new Set(data?.cases.map(inferMode) ?? [])].sort(),
    [data],
  );
  const sizes = useMemo(
    () => [...new Set(data?.cases.map((item) => item.sizeTier ?? "unsized") ?? [])],
    [data],
  );
  const categories = useMemo(
    () => [...new Set(data?.cases.map((item) => item.category ?? "uncategorized") ?? [])].sort(),
    [data],
  );

  const filteredCases = useMemo(() => {
    if (!data) return [];
    const search = filters.search.trim().toLowerCase();
    return data.cases.filter((testCase) => {
      const review = reviews[testCase.id];
      const status = review?.choice;
      if (
        search &&
        !`${testCase.title} ${testCase.id} ${testCase.category ?? ""}`
          .toLowerCase()
          .includes(search)
      ) return false;
      if (filters.mode !== "all" && inferMode(testCase) !== filters.mode) return false;
      if (filters.size !== "all" && (testCase.sizeTier ?? "unsized") !== filters.size) return false;
      if (filters.category !== "all" && (testCase.category ?? "uncategorized") !== filters.category) return false;
      if (testCase.id !== currentId) {
        if (filters.status === "unreviewed" && status) return false;
        if (filters.status === "reviewed" && (!status || status === "skip")) return false;
        if (filters.status === "skipped" && status !== "skip") return false;
      }
      return true;
    });
  }, [currentId, data, filters, reviews]);

  const activeId = filteredCases.some((item) => item.id === currentId)
    ? currentId
    : filteredCases[0]?.id ?? "";
  const currentCase = data?.cases.find((item) => item.id === activeId) ?? null;
  const currentReview = currentCase
    ? reviews[currentCase.id] ?? EMPTY_REVIEW
    : EMPTY_REVIEW;
  const currentIndex = filteredCases.findIndex((item) => item.id === activeId);
  const blindAssignment = currentCase
    ? assignment(reviewerId, currentCase.id)
    : { A: "withoutSkill" as Condition, B: "withSkill" as Condition };

  const completed = data?.cases.filter((item) => reviews[item.id]?.choice).length ?? 0;
  const decided =
    data?.cases.filter((item) => {
      const choice = reviews[item.id]?.choice;
      return choice && choice !== "skip";
    }).length ?? 0;
  const skipped = data?.cases.filter((item) => reviews[item.id]?.choice === "skip").length ?? 0;
  const total = data?.cases.length ?? 0;

  const updateReview = useCallback(
    (caseId: string, patch: Partial<ReviewRecord>) => {
      setReviews((existing) => ({
        ...existing,
        [caseId]: {
          ...(existing[caseId] ?? EMPTY_REVIEW),
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [],
  );

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (!filteredCases.length) return;
      const nextIndex = Math.min(
        filteredCases.length - 1,
        Math.max(0, currentIndex + direction),
      );
      setCurrentId(filteredCases[nextIndex].id);
      setPromptOpen(false);
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [currentIndex, filteredCases],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (resetDialog.current?.open || shortcutsDialog.current?.open) return;
      if (event.key === "ArrowLeft") navigate(-1);
      if (event.key === "ArrowRight") navigate(1);
      if (!currentCase) return;
      const key = event.key.toLowerCase();
      if (key === "1" || key === "a") updateReview(currentCase.id, { choice: "A" });
      if (key === "2" || key === "b") updateReview(currentCase.id, { choice: "B" });
      if (key === "t") updateReview(currentCase.id, { choice: "tie" });
      if (key === "s") updateReview(currentCase.id, { choice: "skip" });
      if (key === "r") updateReview(currentCase.id, { revealed: !currentReview.revealed });
      if (key === "p") setPromptOpen((value) => !value);
      if (key === "?") shortcutsDialog.current?.showModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentCase, currentReview.revealed, navigate, updateReview]);

  const setChoice = (choice: Choice) => {
    if (!currentCase) return;
    updateReview(currentCase.id, {
      choice: currentReview.choice === choice ? undefined : choice,
    });
  };

  const toggleReason = (reason: string) => {
    if (!currentCase) return;
    const reasons = currentReview.reasons.includes(reason)
      ? currentReview.reasons.filter((item) => item !== reason)
      : [...currentReview.reasons, reason];
    updateReview(currentCase.id, { reasons });
  };

  const exportRows = () =>
    (data?.cases ?? []).map((testCase) => {
      const review = reviews[testCase.id] ?? EMPTY_REVIEW;
      const map = assignment(reviewerId, testCase.id);
      const actualChoice =
        review.choice === "A" || review.choice === "B"
          ? map[review.choice]
          : review.choice ?? "";
      return {
        id: testCase.id,
        title: testCase.title,
        taskMode: inferMode(testCase),
        sizeTier: testCase.sizeTier ?? "",
        category: testCase.category ?? "",
        blindChoice: review.choice ?? "",
        actualChoice,
        revealed: review.revealed,
        reasons: review.reasons,
        notes: review.notes,
        updatedAt: review.updatedAt ?? "",
      };
    });

  const exportJson = () => {
    downloadFile(
      `addictive-writing-review-${data?.runId ?? "draft"}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          runId: data?.runId,
          reviewerId,
          results: exportRows(),
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  const exportCsv = () => {
    const rows = exportRows();
    const keys = [
      "id",
      "title",
      "taskMode",
      "sizeTier",
      "category",
      "blindChoice",
      "actualChoice",
      "revealed",
      "reasons",
      "notes",
      "updatedAt",
    ] as const;
    const csv = [
      keys.map(csvCell).join(","),
      ...rows.map((row) =>
        keys.map((key) => csvCell(key === "reasons" ? row.reasons.join("; ") : row[key])).join(","),
      ),
    ].join("\n");
    downloadFile(`addictive-writing-review-${data?.runId ?? "draft"}.csv`, csv, "text/csv");
  };

  const resetAll = () => {
    setReviews({});
    setCurrentId(data?.cases[0]?.id ?? "");
    setFilters({ search: "", mode: "all", size: "all", category: "all", status: "all" });
    resetDialog.current?.close();
  };

  if (loadError) {
    return (
      <main className="state-screen">
        <div className="state-mark">!</div>
        <p className="eyebrow">Data unavailable</p>
        <h1>The comparison results could not be opened.</h1>
        <p>{loadError}. Run the results sync and refresh this page.</p>
      </main>
    );
  }

  if (!data || !ready || !reviewerId) {
    return (
      <main className="state-screen" aria-busy="true">
        <div className="loading-bars" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">Blind copy review</p>
        <h1>Preparing your review workspace…</h1>
        <p>Your private draft stays in this browser.</p>
      </main>
    );
  }

  return (
    <div className="review-shell">
      {sidebarOpen && (
        <button className="sidebar-scrim" aria-label="Close case list" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`case-sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="Comparison cases">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">AW</div>
          <div>
            <strong>Blind copy review</strong>
            <span>Manual evaluation workspace</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close case list">×</button>
        </div>

        <div className="progress-block">
          <div className="progress-copy">
            <span>{completed} of {total} handled</span>
            <strong>{total ? Math.round((completed / total) * 100) : 0}%</strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Review progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            aria-valuetext={`${completed} of ${total} cases handled`}
          >
            <span style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
          </div>
          <small>{decided} decided · {skipped} skipped</small>
        </div>

        <div className="filter-panel">
          <label className="search-field">
            <span className="visually-hidden">Search cases</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder="Search cases…"
            />
          </label>
          <div className="filter-grid">
            <label>
              <span>Mode</span>
              <select value={filters.mode} onChange={(event) => setFilters({ ...filters, mode: event.target.value })}>
                <option value="all">All modes</option>
                {modes.map((mode) => <option key={mode} value={mode}>{titleCase(mode)}</option>)}
              </select>
            </label>
            <label>
              <span>Size</span>
              <select value={filters.size} onChange={(event) => setFilters({ ...filters, size: event.target.value })}>
                <option value="all">All sizes</option>
                {sizes.map((size) => <option key={size} value={size}>{titleCase(size)}</option>)}
              </select>
            </label>
            <label>
              <span>Category</span>
              <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{titleCase(category)}</option>)}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={filters.status} onChange={(event) => { setCurrentId(""); setFilters({ ...filters, status: event.target.value }); }}>
                <option value="all">Any status</option>
                <option value="unreviewed">Unreviewed</option>
                <option value="reviewed">Reviewed</option>
                <option value="skipped">Skipped</option>
              </select>
            </label>
          </div>
        </div>

        <div className="case-list-heading">
          <span>Cases</span><span>{filteredCases.length}</span>
        </div>
        <nav className="case-list" aria-label="Filtered cases">
          {filteredCases.map((testCase, index) => {
            const choice = reviews[testCase.id]?.choice;
            return (
              <button
                key={testCase.id}
                className={`case-row ${testCase.id === activeId ? "is-current" : ""}`}
                onClick={() => { setCurrentId(testCase.id); setPromptOpen(false); setSidebarOpen(false); }}
                aria-current={testCase.id === activeId ? "true" : undefined}
                aria-label={`${testCase.title}, ${choice ? `choice ${choice}` : "not reviewed"}`}
              >
                <span className={`status-dot ${choice ? `status-${choice.toLowerCase()}` : ""}`} aria-hidden="true">
                  {choice === "A" || choice === "B" ? choice : choice === "tie" ? "=" : choice === "skip" ? "–" : index + 1}
                </span>
                <span className="case-row-copy">
                  <strong>{testCase.title}</strong>
                  <span>{titleCase(inferMode(testCase))} · {titleCase(testCase.sizeTier ?? "unsized")}</span>
                </span>
              </button>
            );
          })}
          {!filteredCases.length && <p className="empty-filter">No cases match these filters.</p>}
        </nav>
      </aside>

      <main className="review-main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open case list">☰</button>
          <div className="run-context">
            <span>Independent comparison</span>
            <strong>{data.configuration?.verifiedDisplayName ?? data.configuration?.requestedModel ?? "Model run"}</strong>
            <span>· {data.configuration?.requestedEffort ?? "standard"}</span>
          </div>
          <div className="top-actions">
            <button className="utility-button" onClick={() => setPromptOpen((value) => !value)} aria-expanded={promptOpen}>Prompt <kbd>P</kbd></button>
            <div className="segmented compact" aria-label="Comparison layout">
              <button className={layout === "columns" ? "active" : ""} onClick={() => setLayout("columns")} aria-label="Side-by-side layout" aria-pressed={layout === "columns"}>Ⅱ</button>
              <button className={layout === "stacked" ? "active" : ""} onClick={() => setLayout("stacked")} aria-label="Stacked layout" aria-pressed={layout === "stacked"}>☷</button>
            </div>
            <div className="font-control" aria-label="Output font size">
              <button onClick={() => setFontSize((value) => Math.max(14, value - 1))} aria-label="Decrease font size">A−</button>
              <span>{fontSize}</span>
              <button onClick={() => setFontSize((value) => Math.min(22, value + 1))} aria-label="Increase font size">A+</button>
            </div>
            <details className="export-menu">
              <summary className="utility-button">Export</summary>
              <div>
                <button onClick={exportJson}>Review as JSON</button>
                <button onClick={exportCsv}>Review as CSV</button>
                <button className="menu-danger" onClick={() => resetDialog.current?.showModal()}>Reset review…</button>
              </div>
            </details>
            <button className="icon-button" onClick={() => shortcutsDialog.current?.showModal()} aria-label="Keyboard shortcuts">?</button>
            <button className="icon-button danger" onClick={() => resetDialog.current?.showModal()} aria-label="Reset all review data">↺</button>
          </div>
        </header>

        {currentCase ? (
          <div className="review-canvas">
            <section className="case-heading">
              <div>
                <p className="eyebrow">Case {currentIndex + 1} of {filteredCases.length}</p>
                <h1>{currentCase.title}</h1>
                <div className="case-meta">
                  <span className={`mode-pill mode-${inferMode(currentCase)}`}>{titleCase(inferMode(currentCase))}</span>
                  <span>{titleCase(currentCase.category ?? "uncategorized")}</span>
                  <span>{titleCase(currentCase.sizeTier ?? "unsized")}</span>
                  <span>{getRange(currentCase)}</span>
                </div>
              </div>
              <div className="case-navigation">
                <button onClick={() => navigate(-1)} disabled={currentIndex <= 0} aria-label="Previous case">← <span>Previous</span></button>
                <button onClick={() => navigate(1)} disabled={currentIndex >= filteredCases.length - 1} aria-label="Next case"><span>Next</span> →</button>
              </div>
            </section>

            {promptOpen && (
              <section className="prompt-drawer" aria-label="Exact prompt">
                <div className="drawer-heading">
                  <div><p className="eyebrow">Exact prompt</p><strong>Identical in both conditions</strong></div>
                  <button onClick={() => setPromptOpen(false)} aria-label="Close prompt">×</button>
                </div>
                <pre>{currentCase.prompt}</pre>
                {currentCase.outputConstraint && <p><strong>Constraint:</strong> {currentCase.outputConstraint}</p>}
              </section>
            )}

            <section className={`output-grid layout-${layout}`} aria-label="Blind output comparison">
              {(["A", "B"] as const).map((label) => {
                const condition = blindAssignment[label];
                const output = currentCase[condition];
                const outputWords = output.outputWordCount ?? countWords(output.output);
                const outsideTarget = missesTarget(currentCase, outputWords);
                const treatment = condition === "withSkill" ? "With skill" : "Without skill";
                return (
                  <article className={`output-card output-${label.toLowerCase()}`} key={label}>
                    <header>
                      <div className="output-label"><span>{label}</span><strong>Output {label}</strong></div>
                      <div className="output-details">
                        {currentReview.revealed && <span className={`treatment treatment-${condition}`}>{treatment}</span>}
                        <span className={outsideTarget ? "word-count out-of-range" : "word-count"}>
                          {outputWords} words{outsideTarget ? " · outside target" : ""}
                        </span>
                      </div>
                    </header>
                    <div className="copy-output" style={{ fontSize: `${fontSize}px` }}>{output.output}</div>
                  </article>
                );
              })}
            </section>

            <section className="decision-panel" aria-label="Your evaluation">
              <div className="decision-heading">
                <div>
                  <p className="eyebrow">Your call</p>
                  <h2>Which output works better?</h2>
                </div>
                <button
                  className={`reveal-button ${currentReview.revealed ? "is-revealed" : ""}`}
                  onClick={() => updateReview(currentCase.id, { revealed: !currentReview.revealed })}
                  aria-pressed={currentReview.revealed}
                >
                  <span aria-hidden="true">{currentReview.revealed ? "◉" : "○"}</span>
                  {currentReview.revealed ? "Treatments revealed" : "Reveal treatments"}
                  <kbd>R</kbd>
                </button>
              </div>
              <div className="choice-row">
                <button className={`choice choice-a ${currentReview.choice === "A" ? "selected" : ""}`} onClick={() => setChoice("A")} aria-pressed={currentReview.choice === "A"}><span>A</span> Output A <kbd>1</kbd></button>
                <button className={`choice choice-b ${currentReview.choice === "B" ? "selected" : ""}`} onClick={() => setChoice("B")} aria-pressed={currentReview.choice === "B"}><span>B</span> Output B <kbd>2</kbd></button>
                <button className={`choice ${currentReview.choice === "tie" ? "selected" : ""}`} onClick={() => setChoice("tie")} aria-pressed={currentReview.choice === "tie"}><span>=</span> Tie <kbd>T</kbd></button>
                <button className={`choice subtle ${currentReview.choice === "skip" ? "selected" : ""}`} onClick={() => setChoice("skip")} aria-pressed={currentReview.choice === "skip"}><span>–</span> Skip <kbd>S</kbd></button>
              </div>
              <div className="review-details">
                <div className="reason-group">
                  <span>What drove your choice? <em>Optional</em></span>
                  <div>
                    {REASONS.map((reason) => (
                      <button
                        key={reason}
                        className={currentReview.reasons.includes(reason) ? "selected" : ""}
                        onClick={() => toggleReason(reason)}
                        aria-pressed={currentReview.reasons.includes(reason)}
                      >{reason}</button>
                    ))}
                  </div>
                </div>
                <label className="notes-field">
                  <span><strong>Notes</strong><small>{currentReview.updatedAt ? "Saved locally" : "Autosaves locally"}</small></span>
                  <textarea
                    value={currentReview.notes}
                    onChange={(event) => updateReview(currentCase.id, { notes: event.target.value })}
                    placeholder="Capture what worked, what failed, or anything you want to revisit…"
                    rows={4}
                  />
                </label>
              </div>
            </section>

            <footer className="canvas-footer">
              <span>Run {data.runId ?? "unknown"}</span>
              <span>Assignments are stable on this browser. Results are never sent anywhere.</span>
            </footer>
          </div>
        ) : (
          <section className="no-case">
            <p className="eyebrow">No matching cases</p>
            <h1>Try widening your filters.</h1>
            <button onClick={() => setFilters({ ...filters, search: "", mode: "all", size: "all", category: "all", status: "all" })}>Clear all filters</button>
          </section>
        )}
      </main>

      <dialog ref={resetDialog} className="modal-dialog" aria-labelledby="reset-dialog-title" onClick={(event) => { if (event.target === resetDialog.current) resetDialog.current.close(); }}>
        <div className="modal-mark danger-mark" aria-hidden="true">↺</div>
        <p className="eyebrow">Permanent action</p>
        <h2 id="reset-dialog-title">Reset the whole review?</h2>
        <p>This clears every preference, reason tag, note, and reveal from this browser. Export first if you want a backup.</p>
        <div className="dialog-actions">
          <button onClick={() => resetDialog.current?.close()}>Keep my review</button>
          <button className="destructive" onClick={resetAll}>Reset everything</button>
        </div>
      </dialog>

      <dialog ref={shortcutsDialog} className="modal-dialog shortcuts-dialog" aria-labelledby="shortcuts-dialog-title" onClick={(event) => { if (event.target === shortcutsDialog.current) shortcutsDialog.current.close(); }}>
        <div className="modal-mark" aria-hidden="true">⌨</div>
        <p className="eyebrow">Move quickly</p>
        <h2 id="shortcuts-dialog-title">Keyboard shortcuts</h2>
        <dl>
          <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous / next case</dd></div>
          <div><dt><kbd>1</kbd> / <kbd>A</kbd></dt><dd>Choose Output A</dd></div>
          <div><dt><kbd>2</kbd> / <kbd>B</kbd></dt><dd>Choose Output B</dd></div>
          <div><dt><kbd>T</kbd></dt><dd>Mark a tie</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Skip this case</dd></div>
          <div><dt><kbd>R</kbd></dt><dd>Reveal treatments</dd></div>
          <div><dt><kbd>P</kbd></dt><dd>Open / close prompt</dd></div>
        </dl>
        <button className="dialog-close" onClick={() => shortcutsDialog.current?.close()}>Got it</button>
      </dialog>
    </div>
  );
}
