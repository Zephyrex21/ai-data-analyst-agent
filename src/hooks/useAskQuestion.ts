import { useCallback, useRef, useState } from "react";
import type { ParsedCsv } from "../lib/csv";
import { buildSchemaDescription } from "../lib/schema";
import { generateQuery, LlmError, type Engine, type PreviousAttempt } from "../lib/llm";
import { validateSql } from "../lib/sqlValidator";
import { validatePythonCode } from "../lib/pythonValidator";
import { runQuery, type QueryResult } from "../lib/duckdb";
import { loadCsvIntoDataframe, runPythonCode, PythonExecutionError } from "../lib/pyodide";

export type AskStage =
  | "idle"
  | "generating-sql"
  | "validating"
  | "loading-python"
  | "running-query"
  | "done"
  | "error";

// 1 initial attempt + 2 self-correction retries, per the build blueprint.
const MAX_ATTEMPTS = 3;

interface AskState {
  stage: AskStage;
  question: string | null;
  sql: string | null;
  engine: Engine | null;
  result: QueryResult | null;
  error: string | null;
  attemptsUsed: number;
}

const IDLE_STATE: AskState = {
  stage: "idle",
  question: null,
  sql: null,
  engine: null,
  result: null,
  error: null,
  attemptsUsed: 0,
};

export function useAskQuestion(csvData: ParsedCsv | null, file: File | null) {
  const [state, setState] = useState<AskState>(IDLE_STATE);
  // Tracks which File the Python DataFrame was last loaded from, so we only
  // pay the (large) Pyodide download/init cost once per uploaded file, and
  // only if a question actually routes to Python at all.
  const pyodideLoadedForFileRef = useRef<File | null>(null);

  const ask = useCallback(
    async (question: string) => {
      if (!csvData || !file || !question.trim()) return;

      setState({ ...IDLE_STATE, stage: "generating-sql", question });

      const schemaDescription = buildSchemaDescription(csvData);
      let previousAttempt: PreviousAttempt | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let engine: Engine;
        let code: string;
        try {
          setState((s) => ({ ...s, stage: "generating-sql" }));
          const generated = await generateQuery(question, schemaDescription, previousAttempt);
          engine = generated.engine;
          code = generated.code;
        } catch (err) {
          // A failure to even reach the LLM (network/server/API-key issue) isn't
          // something retrying will fix — fail immediately rather than burning
          // more Groq calls on a problem that won't self-correct.
          const message = err instanceof LlmError ? err.message : "Failed to reach the LLM.";
          setState((s) => ({ ...s, stage: "error", error: message }));
          return;
        }

        setState((s) => ({ ...s, stage: "validating", sql: code, engine }));

        if (engine === "sql") {
          const validation = validateSql(code, csvData);
          if (!validation.valid) {
            const reason = validation.reason ?? "Query was rejected for safety reasons.";
            if (attempt < MAX_ATTEMPTS) {
              previousAttempt = { engine, code, error: reason };
              continue;
            }
            setState((s) => ({
              ...s,
              stage: "error",
              error: `Couldn't find a safe, working query after ${MAX_ATTEMPTS} attempts. Last issue: ${reason}`,
            }));
            return;
          }

          setState((s) => ({ ...s, stage: "running-query", sql: validation.sql }));
          try {
            const result = await runQuery(validation.sql);
            setState((s) => ({ ...s, stage: "done", result, attemptsUsed: attempt }));
            return;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Query execution failed.";
            if (attempt < MAX_ATTEMPTS) {
              previousAttempt = { engine, code, error: message };
              continue;
            }
            setState((s) => ({
              ...s,
              stage: "error",
              error: `Couldn't find a working query after ${MAX_ATTEMPTS} attempts. Last error: ${message}`,
            }));
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
            setState((s) => ({
              ...s,
              stage: "error",
              error: `Couldn't find safe, working Python code after ${MAX_ATTEMPTS} attempts. Last issue: ${reason}`,
            }));
            return;
          }

          try {
            if (pyodideLoadedForFileRef.current !== file) {
              setState((s) => ({ ...s, stage: "loading-python" }));
              await loadCsvIntoDataframe(file);
              pyodideLoadedForFileRef.current = file;
            }

            setState((s) => ({ ...s, stage: "running-query" }));
            const result = await runPythonCode(code);
            setState((s) => ({ ...s, stage: "done", result, attemptsUsed: attempt }));
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
            setState((s) => ({
              ...s,
              stage: "error",
              error: `Couldn't get working Python code after ${MAX_ATTEMPTS} attempts. Last error: ${message}`,
            }));
            return;
          }
        }
      }
    },
    [csvData, file]
  );

  const reset = useCallback(() => {
    setState(IDLE_STATE);
    pyodideLoadedForFileRef.current = null;
  }, []);

  return { ...state, ask, reset };
}
