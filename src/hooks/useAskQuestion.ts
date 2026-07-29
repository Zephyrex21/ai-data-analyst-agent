import { useCallback, useState } from "react";
import type { ParsedCsv } from "../lib/csv";
import { summarizeResultForHistory } from "../lib/schema";
import { generateQuery, type Engine, type HistoryTurn } from "../lib/llm";
import { runQuery, type QueryResult } from "../lib/duckdb";
import {
  loadCsvIntoDataframe,
  runPythonCode,
  isDataFrameLoaded,
  resetPythonState,
} from "../lib/pyodide";
import { runQueryWithRetries, type OrchestratorStage } from "../lib/queryOrchestrator";
import { DEFAULT_PROVIDER, isProviderId, type ProviderId } from "../lib/providers";

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

export interface ConversationTurn {
  id: number;
  stage: AskStage;
  question: string;
  sql: string | null;
  engine: Engine | null;
  provider: ProviderId;
  result: QueryResult | null;
  error: string | null;
  attemptsUsed: number;
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

  const setProvider = useCallback((next: ProviderId) => {
    setProviderState(next);
    try {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only — not fatal if storage is unavailable.
    }
  }, []);

  const isBusy = turns.length > 0 && !["done", "error"].includes(turns[turns.length - 1].stage);

  const ask = useCallback(
    async (question: string) => {
      if (!csvData || !file || !question.trim() || isBusy) return;
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
        error: null,
        attemptsUsed: 0,
      };

      const history: HistoryTurn[] = turns
        .filter((t) => t.stage === "done" && t.engine && t.sql && t.result)
        .slice(-MAX_HISTORY_TURNS)
        .map((t) => ({
          question: t.question,
          engine: t.engine as Engine,
          code: t.sql as string,
          resultSummary: summarizeResultForHistory(t.result as QueryResult),
        }));

      setTurns((prev) => [...prev, newTurn]);

      const generator = runQueryWithRetries(question, csvData, history, {
        generateQuery: (q, s, p, h) => generateQuery(q, s, p, h, provider),
        runSql: runQuery,
        runPython: runPythonCode,
        isDataFrameLoaded: () => isDataFrameLoaded(file),
        loadDataFrame: () => loadCsvIntoDataframe(file),
      });

      for await (const update of generator) {
        setTurns((prev) => updateTurn(prev, id, update));
      }
    },
    [csvData, file, isBusy, turns, cooldownUntil, provider]
  );

  const reset = useCallback(() => {
    setTurns([]);
    resetPythonState();
  }, []);

  return { turns, isBusy, ask, reset, cooldownUntil, provider, setProvider };
}
