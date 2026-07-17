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

export type AskStage = OrchestratorStage;

// How many prior turns get sent to the model as conversation context.
const MAX_HISTORY_TURNS = 5;

let nextTurnId = 1;

export interface ConversationTurn {
  id: number;
  stage: AskStage;
  question: string;
  sql: string | null;
  engine: Engine | null;
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

  const isBusy = turns.length > 0 && !["done", "error"].includes(turns[turns.length - 1].stage);

  const ask = useCallback(
    async (question: string) => {
      if (!csvData || !file || !question.trim() || isBusy) return;

      const id = nextTurnId++;
      const newTurn: ConversationTurn = {
        id,
        stage: "generating-sql",
        question,
        sql: null,
        engine: null,
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
        generateQuery,
        runSql: runQuery,
        runPython: runPythonCode,
        isDataFrameLoaded: () => isDataFrameLoaded(file),
        loadDataFrame: () => loadCsvIntoDataframe(file),
      });

      for await (const update of generator) {
        setTurns((prev) => updateTurn(prev, id, update));
      }
    },
    [csvData, file, isBusy, turns]
  );

  const reset = useCallback(() => {
    setTurns([]);
    resetPythonState();
  }, []);

  return { turns, isBusy, ask, reset };
}
