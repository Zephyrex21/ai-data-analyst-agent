import { useCallback, useState } from "react";
import type { ParsedCsv } from "../lib/csv";
import { buildSchemaDescription } from "../lib/schema";
import { generateSql, LlmError, type PreviousAttempt } from "../lib/llm";
import { validateSql } from "../lib/sqlValidator";
import { runQuery, type QueryResult } from "../lib/duckdb";

export type AskStage = "idle" | "generating-sql" | "validating" | "running-query" | "done" | "error";

// 1 initial attempt + 2 self-correction retries, per the build blueprint.
const MAX_ATTEMPTS = 3;

interface AskState {
  stage: AskStage;
  question: string | null;
  sql: string | null;
  result: QueryResult | null;
  error: string | null;
  /** How many attempts it took to succeed (1 = worked first try). Only meaningful once stage is "done". */
  attemptsUsed: number;
}

const IDLE_STATE: AskState = {
  stage: "idle",
  question: null,
  sql: null,
  result: null,
  error: null,
  attemptsUsed: 0,
};

export function useAskQuestion(csvData: ParsedCsv | null) {
  const [state, setState] = useState<AskState>(IDLE_STATE);

  const ask = useCallback(
    async (question: string) => {
      if (!csvData || !question.trim()) return;

      setState({ ...IDLE_STATE, stage: "generating-sql", question });

      const schemaDescription = buildSchemaDescription(csvData);
      let previousAttempt: PreviousAttempt | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let generatedSql: string;
        try {
          setState((s) => ({ ...s, stage: "generating-sql" }));
          generatedSql = await generateSql(question, schemaDescription, previousAttempt);
        } catch (err) {
          // A failure to even reach the LLM (network/server/API-key issue) isn't
          // something retrying will fix — fail immediately rather than burning
          // more Groq calls on a problem that won't self-correct.
          const message = err instanceof LlmError ? err.message : "Failed to reach the LLM.";
          setState((s) => ({ ...s, stage: "error", error: message }));
          return;
        }

        setState((s) => ({ ...s, stage: "validating", sql: generatedSql }));
        const validation = validateSql(generatedSql, csvData);

        if (!validation.valid) {
          const reason = validation.reason ?? "Query was rejected for safety reasons.";
          if (attempt < MAX_ATTEMPTS) {
            previousAttempt = { sql: generatedSql, error: reason };
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
            previousAttempt = { sql: generatedSql, error: message };
            continue;
          }
          setState((s) => ({
            ...s,
            stage: "error",
            error: `Couldn't find a working query after ${MAX_ATTEMPTS} attempts. Last error: ${message}`,
          }));
          return;
        }
      }
    },
    [csvData]
  );

  const reset = useCallback(() => setState(IDLE_STATE), []);

  return { ...state, ask, reset };
}
