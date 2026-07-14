import { useCallback, useState } from "react";
import type { ParsedCsv } from "../lib/csv";
import { buildSchemaDescription } from "../lib/schema";
import { generateSql } from "../lib/llm";
import { runQuery, type QueryResult } from "../lib/duckdb";

export type AskStage = "idle" | "generating-sql" | "running-query" | "done" | "error";

interface AskState {
  stage: AskStage;
  question: string | null;
  sql: string | null;
  result: QueryResult | null;
  error: string | null;
}

const IDLE_STATE: AskState = {
  stage: "idle",
  question: null,
  sql: null,
  result: null,
  error: null,
};

export function useAskQuestion(csvData: ParsedCsv | null) {
  const [state, setState] = useState<AskState>(IDLE_STATE);

  const ask = useCallback(
    async (question: string) => {
      if (!csvData || !question.trim()) return;

      setState({ stage: "generating-sql", question, sql: null, result: null, error: null });

      try {
        const schemaDescription = buildSchemaDescription(csvData);
        const sql = await generateSql(question, schemaDescription);

        setState((s) => ({ ...s, stage: "running-query", sql }));

        const result = await runQuery(sql);
        setState((s) => ({ ...s, stage: "done", result }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setState((s) => ({ ...s, stage: "error", error: message }));
      }
    },
    [csvData]
  );

  const reset = useCallback(() => setState(IDLE_STATE), []);

  return { ...state, ask, reset };
}
