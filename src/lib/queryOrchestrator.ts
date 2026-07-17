import type { ParsedCsv } from "./csv";
import { buildSchemaDescription } from "./schema";
import { validateSql } from "./sqlValidator";
import { validatePythonCode } from "./pythonValidator";
import type { Engine, HistoryTurn, PreviousAttempt } from "./llm";
import type { QueryResult } from "./duckdb";

export type OrchestratorStage =
  | "generating-sql"
  | "validating"
  | "loading-python"
  | "running-query"
  | "done"
  | "error";

export interface OrchestratorUpdate {
  stage: OrchestratorStage;
  sql?: string;
  engine?: Engine;
  result?: QueryResult;
  error?: string;
  attemptsUsed?: number;
}

export interface OrchestratorDeps {
  generateQuery: (
    question: string,
    schemaDescription: string,
    previousAttempt: PreviousAttempt | null,
    history: HistoryTurn[]
  ) => Promise<{ engine: Engine; code: string }>;
  runSql: (sql: string) => Promise<QueryResult>;
  runPython: (code: string) => Promise<QueryResult>;
  isDataFrameLoaded: () => boolean;
  loadDataFrame: () => Promise<void>;
}

// 1 initial attempt + 2 self-correction retries, per the build blueprint.
export const MAX_ATTEMPTS = 3;

/**
 * Pure orchestration of one question's full lifecycle: generate code, route
 * to the right validator, execute, and retry with error context on failure.
 * Takes its side effects (LLM call, SQL/Python execution) as injected
 * dependencies specifically so this can be unit-tested with mocks instead
 * of needing a real browser, DuckDB-WASM, Pyodide, or network access.
 *
 * Yields incremental updates as an async generator so callers (like the
 * useAskQuestion hook) can map each step directly onto UI state without
 * this function knowing anything about React.
 */
export async function* runQueryWithRetries(
  question: string,
  csvData: ParsedCsv,
  history: HistoryTurn[],
  deps: OrchestratorDeps
): AsyncGenerator<OrchestratorUpdate> {
  const schemaDescription = buildSchemaDescription(csvData);
  let previousAttempt: PreviousAttempt | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    yield { stage: "generating-sql" };

    let engine: Engine;
    let code: string;
    try {
      const generated = await deps.generateQuery(question, schemaDescription, previousAttempt, history);
      engine = generated.engine;
      code = generated.code;
    } catch (err) {
      // A failure to even reach the LLM isn't something retrying will fix —
      // fail immediately rather than burning more calls on a problem that
      // won't self-correct.
      yield { stage: "error", error: err instanceof Error ? err.message : "Failed to reach the LLM." };
      return;
    }

    yield { stage: "validating", sql: code, engine };

    if (engine === "sql") {
      const validation = validateSql(code, csvData);
      if (!validation.valid) {
        const reason = validation.reason ?? "Query was rejected for safety reasons.";
        if (attempt < MAX_ATTEMPTS) {
          previousAttempt = { engine, code, error: reason };
          continue;
        }
        yield {
          stage: "error",
          error: `Couldn't find a safe, working query after ${MAX_ATTEMPTS} attempts. Last issue: ${reason}`,
        };
        return;
      }

      yield { stage: "running-query", sql: validation.sql };
      try {
        const result = await deps.runSql(validation.sql);
        yield { stage: "done", result, attemptsUsed: attempt };
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Query execution failed.";
        if (attempt < MAX_ATTEMPTS) {
          previousAttempt = { engine, code, error: message };
          continue;
        }
        yield {
          stage: "error",
          error: `Couldn't find a working query after ${MAX_ATTEMPTS} attempts. Last error: ${message}`,
        };
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
        yield {
          stage: "error",
          error: `Couldn't find safe, working Python code after ${MAX_ATTEMPTS} attempts. Last issue: ${reason}`,
        };
        return;
      }

      try {
        if (!deps.isDataFrameLoaded()) {
          yield { stage: "loading-python" };
          await deps.loadDataFrame();
        }
        yield { stage: "running-query" };
        const result = await deps.runPython(code);
        yield { stage: "done", result, attemptsUsed: attempt };
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Python execution failed.";
        if (attempt < MAX_ATTEMPTS) {
          previousAttempt = { engine, code, error: message };
          continue;
        }
        yield {
          stage: "error",
          error: `Couldn't get working Python code after ${MAX_ATTEMPTS} attempts. Last error: ${message}`,
        };
        return;
      }
    }
  }
}
