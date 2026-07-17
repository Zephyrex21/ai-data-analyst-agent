import { useCallback, useState } from "react";
import type { ParsedCsv } from "../lib/csv";
import { buildSchemaDescription, summarizeResultForHistory } from "../lib/schema";
import {
  generateQuery,
  LlmError,
  type Engine,
  type PreviousAttempt,
  type HistoryTurn,
} from "../lib/llm";
import { validateSql } from "../lib/sqlValidator";
import { validatePythonCode } from "../lib/pythonValidator";
import { runQuery, type QueryResult } from "../lib/duckdb";
import {
  loadCsvIntoDataframe,
  runPythonCode,
  isDataFrameLoaded,
  resetPythonState,
  PythonExecutionError,
} from "../lib/pyodide";

export type AskStage =
  | "generating-sql"
  | "validating"
  | "loading-python"
  | "running-query"
  | "done"
  | "error";

// 1 initial attempt + 2 self-correction retries, per the build blueprint.
const MAX_ATTEMPTS = 3;
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

      // Built from `turns` (state read directly from the closure, not via a
      // setState-updater side effect — updater functions must stay pure,
      // since React can invoke them more than once in StrictMode dev).
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

      const schemaDescription = buildSchemaDescription(csvData);
      let previousAttempt: PreviousAttempt | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let engine: Engine;
        let code: string;
        try {
          setTurns((prev) => updateTurn(prev, id, { stage: "generating-sql" }));
          const generated = await generateQuery(question, schemaDescription, previousAttempt, history);
          engine = generated.engine;
          code = generated.code;
        } catch (err) {
          const message = err instanceof LlmError ? err.message : "Failed to reach the LLM.";
          setTurns((prev) => updateTurn(prev, id, { stage: "error", error: message }));
          return;
        }

        setTurns((prev) => updateTurn(prev, id, { stage: "validating", sql: code, engine }));

        if (engine === "sql") {
          const validation = validateSql(code, csvData);
          if (!validation.valid) {
            const reason = validation.reason ?? "Query was rejected for safety reasons.";
            if (attempt < MAX_ATTEMPTS) {
              previousAttempt = { engine, code, error: reason };
              continue;
            }
            setTurns((prev) =>
              updateTurn(prev, id, {
                stage: "error",
                error: `Couldn't find a safe, working query after ${MAX_ATTEMPTS} attempts. Last issue: ${reason}`,
              })
            );
            return;
          }

          setTurns((prev) => updateTurn(prev, id, { stage: "running-query", sql: validation.sql }));
          try {
            const result = await runQuery(validation.sql);
            setTurns((prev) => updateTurn(prev, id, { stage: "done", result, attemptsUsed: attempt }));
            return;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Query execution failed.";
            if (attempt < MAX_ATTEMPTS) {
              previousAttempt = { engine, code, error: message };
              continue;
            }
            setTurns((prev) =>
              updateTurn(prev, id, {
                stage: "error",
                error: `Couldn't find a working query after ${MAX_ATTEMPTS} attempts. Last error: ${message}`,
              })
            );
            return;
          }
        } else {
          const validation = validatePythonCode(code);
          if (!validation.valid) {
            const reason = validation.reason ?? "Code was rejected for safety reasons.";
            if (attempt < MAX_ATTEMPTS) {
              previousAttempt = { engine, code, error: reason };
              continue;
            }
            setTurns((prev) =>
              updateTurn(prev, id, {
                stage: "error",
                error: `Couldn't find safe, working Python code after ${MAX_ATTEMPTS} attempts. Last issue: ${reason}`,
              })
            );
            return;
          }

          try {
            if (!isDataFrameLoaded(file)) {
              setTurns((prev) => updateTurn(prev, id, { stage: "loading-python" }));
              await loadCsvIntoDataframe(file);
            }

            setTurns((prev) => updateTurn(prev, id, { stage: "running-query" }));
            const result = await runPythonCode(code);
            setTurns((prev) => updateTurn(prev, id, { stage: "done", result, attemptsUsed: attempt }));
            return;
          } catch (err) {
            const message =
              err instanceof PythonExecutionError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : "Python execution failed.";
            if (attempt < MAX_ATTEMPTS) {
              previousAttempt = { engine, code, error: message };
              continue;
            }
            setTurns((prev) =>
              updateTurn(prev, id, {
                stage: "error",
                error: `Couldn't get working Python code after ${MAX_ATTEMPTS} attempts. Last error: ${message}`,
              })
            );
            return;
          }
        }
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
