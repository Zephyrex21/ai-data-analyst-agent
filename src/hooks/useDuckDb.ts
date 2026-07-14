import { useCallback, useState } from "react";
import { loadCsvAsTable, runQuery, type QueryResult } from "../lib/duckdb";

export const MAIN_TABLE_NAME = "data";

interface UseDuckDbState {
  isTableReady: boolean;
  isLoadingTable: boolean;
  tableError: string | null;

  isQuerying: boolean;
  queryError: string | null;
  result: QueryResult | null;
}

export function useDuckDb() {
  const [state, setState] = useState<UseDuckDbState>({
    isTableReady: false,
    isLoadingTable: false,
    tableError: null,
    isQuerying: false,
    queryError: null,
    result: null,
  });

  const loadTable = useCallback(async (file: File) => {
    setState((s) => ({
      ...s,
      isLoadingTable: true,
      isTableReady: false,
      tableError: null,
      result: null,
    }));
    try {
      await loadCsvAsTable(file, MAIN_TABLE_NAME);
      setState((s) => ({ ...s, isLoadingTable: false, isTableReady: true }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load table into DuckDB.";
      setState((s) => ({ ...s, isLoadingTable: false, isTableReady: false, tableError: message }));
    }
  }, []);

  const query = useCallback(async (sql: string) => {
    setState((s) => ({ ...s, isQuerying: true, queryError: null }));
    try {
      const result = await runQuery(sql);
      setState((s) => ({ ...s, isQuerying: false, result, queryError: null }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed.";
      setState((s) => ({ ...s, isQuerying: false, queryError: message, result: null }));
    }
  }, []);

  const resetTable = useCallback(() => {
    setState({
      isTableReady: false,
      isLoadingTable: false,
      tableError: null,
      isQuerying: false,
      queryError: null,
      result: null,
    });
  }, []);

  return { ...state, loadTable, query, resetTable };
}
