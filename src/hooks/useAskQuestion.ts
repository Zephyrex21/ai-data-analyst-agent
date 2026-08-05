import { useCallback, useState } from "react";
import type { ParsedCsv } from "../lib/csv";
import { summarizeResultForHistory } from "../lib/schema";
import { generateQuery, generateInsight, type Engine, type HistoryTurn } from "../lib/llm";
import { runQuery, type QueryResult } from "../lib/duckdb";
import {
  computeDatasetSummary,
  formatDatasetSummaryForPrompt,
  findMentionedColumns,
} from "../lib/datasetSummary";
import { buildMetaAnswer } from "../lib/metaAnswer";
import {
  loadCsvIntoDataframe,
  runPythonCode,
  isDataFrameLoaded,
  resetPythonState,
} from "../lib/pyodide";
import { runQueryWithRetries, type OrchestratorStage } from "../lib/queryOrchestrator";
import { DEFAULT_PROVIDER, isProviderId, type ProviderId } from "../lib/providers";
import { createAnswerCache } from "../lib/answerCache";
import { parseChartTweak, type ChartTypeOverride, type SortOverride } from "../lib/chartTweaks";

export type AskStage = OrchestratorStage;

// How many prior turns get sent to the model as conversation context.
const MAX_HISTORY_TURNS = 5;

// Minimum gap enforced between two asks, client-side. This isn't about
// making the LLM faster — it's so one person mashing the Ask button (or
// hitting Enter repeatedly) can't burn through the shared free-tier Groq
// quota that every visitor to the live demo draws from.
const COOLDOWN_MS = 3000;

const PROVIDER_STORAGE_KEY = "ai-data-analyst:provider";

function loadStoredProvider(): ProviderId {
  if (typeof window === "undefined") return DEFAULT_PROVIDER;
  try {
    const stored = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    return isProviderId(stored) ? stored : DEFAULT_PROVIDER;
  } catch {
    // localStorage can throw in locked-down/private-browsing contexts —
    // falling back to the default is safe, this is just a remembered preference.
    return DEFAULT_PROVIDER;
  }
}

let nextTurnId = 1;

export interface DisplayOverride {
  chartType?: ChartTypeOverride;
  sort?: SortOverride;
}

export interface ConversationTurn {
  id: number;
  stage: AskStage;
  question: string;
  sql: string | null;
  engine: Engine | null;
  provider: ProviderId;
  result: QueryResult | null;
  narrative: string | null;
  statsSummary: string | null;
  error: string | null;
  attemptsUsed: number;
  /** Phase 29 — a pure display tweak ("make it a bar chart") layered on top of this turn's real result. */
  displayOverride: DisplayOverride | null;
}

function updateTurn(
  turns: ConversationTurn[],
  id: number,
  patch: Partial<ConversationTurn>
): ConversationTurn[] {
  return turns.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function useAskQuestion(csvData: ParsedCsv | null, file: File | null) {
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [provider, setProviderState] = useState<ProviderId>(loadStoredProvider);
  const [cache] = useState(createAnswerCache);

  const setProvider = useCallback((next: ProviderId) => {
    setProviderState(next);
    try {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only — not fatal if storage is unavailable.
    }
  }, []);

  const isBusy = turns.length > 0 && !["done", "error"].includes(turns[turns.length - 1].stage);

  // Shared by ask() and regenerate() — the only real differences between
  // "ask something new" and "regenerate this answer" are (1) whether a turn
  // gets appended vs. reset in place, and (2) whether the turn being
  // regenerated should exclude itself from its own conversation history.
  // Everything else (building history, running the retry loop, updating
  // state, populating the cache) is identical, so it lives here once.
  const executeTurn = useCallback(
    async (startTurn: ConversationTurn, pushNew: boolean, excludeFromHistoryId: number | null) => {
      if (!csvData || !file) return;

      setTurns((prev) => (pushNew ? [...prev, startTurn] : updateTurn(prev, startTurn.id, startTurn)));

      const history: HistoryTurn[] = turns
        .filter(
          (t) =>
            t.id !== excludeFromHistoryId && t.stage === "done" && t.engine && (t.result || t.narrative)
        )
        .slice(-MAX_HISTORY_TURNS)
        .map((t) => ({
          question: t.question,
          engine: t.engine as Engine,
          code: t.sql ?? "",
          resultSummary:
            t.engine === "insights" || t.engine === "meta"
              ? (t.narrative as string)
              : summarizeResultForHistory(t.result as QueryResult),
        }));

      const question = startTurn.question;

      const generator = runQueryWithRetries(question, csvData, history, {
        generateQuery: (q, s, p, h) => generateQuery(q, s, p, h, provider),
        runSql: runQuery,
        runPython: runPythonCode,
        isDataFrameLoaded: () => isDataFrameLoaded(file),
        loadDataFrame: () => loadCsvIntoDataframe(file),
        computeStatsSummary: async () => {
          const onlyColumns = findMentionedColumns(question, csvData);
          const summary = await computeDatasetSummary(csvData, runQuery, { onlyColumns });
          return formatDatasetSummaryForPrompt(summary);
        },
        narrate: (q, statsSummary) => generateInsight(q, statsSummary, provider),
        buildMetaAnswer: () => buildMetaAnswer(csvData, question),
      });

      let merged: ConversationTurn = startTurn;
      for await (const update of generator) {
        merged = { ...merged, ...update };
        setTurns((prev) => updateTurn(prev, startTurn.id, update));
        if (update.stage === "done") {
          cache.set(question, provider, {
            engine: merged.engine as Engine,
            sql: merged.sql,
            result: merged.result,
            narrative: merged.narrative,
            statsSummary: merged.statsSummary,
            attemptsUsed: merged.attemptsUsed,
            actualProvider: merged.provider ?? provider,
          });
        }
      }
    },
    [csvData, file, turns, provider, cache]
  );

  const ask = useCallback(
    async (question: string) => {
      if (!csvData || !file || !question.trim() || isBusy) return;

      // Fastest path of all: a pure display tweak on the last real answer
      // ("make it a bar chart", "sort descending"). Never touches the LLM,
      // the cache, or the cooldown — there's no new data being fetched,
      // just a different way to show data that's already sitting right
      // there, so gating it behind any of those would make no sense.
      const lastAnswerTurn = [...turns].reverse().find((t) => t.stage === "done" && t.result);
      if (lastAnswerTurn) {
        const tweak = parseChartTweak(question);
        if (tweak) {
          const id = nextTurnId++;
          setTurns((prev) => [
            ...prev,
            {
              ...lastAnswerTurn,
              id,
              question,
              displayOverride: { ...lastAnswerTurn.displayOverride, ...tweak },
            },
          ]);
          return;
        }
      }

      // A cache hit touches no API and does no real work, so it deliberately
      // bypasses the cooldown gate entirely (and never sets one) — the
      // cooldown exists to protect the shared LLM quota, and a cache hit
      // never touches that quota in the first place.
      const cached = cache.get(question, provider);
      if (cached) {
        const id = nextTurnId++;
        setTurns((prev) => [
          ...prev,
          {
            id,
            stage: "done",
            question,
            error: null,
            displayOverride: null,
            engine: cached.engine,
            sql: cached.sql,
            result: cached.result,
            narrative: cached.narrative,
            statsSummary: cached.statsSummary,
            attemptsUsed: cached.attemptsUsed,
            // The truth of who actually answered, not necessarily who was
            // requested — see CachedAnswer.actualProvider's doc comment.
            provider: cached.actualProvider,
          },
        ]);
        return;
      }

      if (Date.now() < cooldownUntil) return; // still cooling down — ignore silently
      setCooldownUntil(Date.now() + COOLDOWN_MS);

      const id = nextTurnId++;
      const newTurn: ConversationTurn = {
        id,
        stage: "generating-sql",
        question,
        sql: null,
        engine: null,
        provider,
        result: null,
        narrative: null,
        statsSummary: null,
        error: null,
        attemptsUsed: 0,
        displayOverride: null,
      };

      await executeTurn(newTurn, true, null);
    },
    [csvData, file, isBusy, turns, cooldownUntil, provider, cache, executeTurn]
  );

  // Regenerate: replaces the existing card's contents in place with a fresh
  // attempt, rather than appending a new answer below it — deliberately
  // does NOT touch the cache lookup (always makes a real call) and DOES
  // respect the cooldown (it's a genuine fresh LLM call, unlike a chart
  // tweak or a cache hit, so it needs the same shared-quota protection).
  const regenerate = useCallback(
    async (turnId: number) => {
      if (!csvData || !file || isBusy) return;
      const target = turns.find((t) => t.id === turnId);
      if (!target) return;

      if (Date.now() < cooldownUntil) return;
      setCooldownUntil(Date.now() + COOLDOWN_MS);

      const resetTurn: ConversationTurn = {
        ...target,
        stage: "generating-sql",
        sql: null,
        engine: null,
        result: null,
        narrative: null,
        statsSummary: null,
        error: null,
        attemptsUsed: 0,
        displayOverride: null,
      };

      await executeTurn(resetTurn, false, turnId);
    },
    [csvData, file, isBusy, turns, cooldownUntil, executeTurn]
  );

  const reset = useCallback(() => {
    setTurns([]);
    resetPythonState();
    cache.clear();
  }, [cache]);

  return { turns, isBusy, ask, regenerate, reset, cooldownUntil, provider, setProvider };
}
