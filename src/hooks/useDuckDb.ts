import { useCallback, useState } from "react";
import { loadCsvAsTable } from "../lib/duckdb";
import { MAIN_TABLE_NAME } from "../lib/schema";

export { MAIN_TABLE_NAME };

interface UseDuckDbState {
  isTableReady: boolean;
  isLoadingTable: boolean;
  tableError: string | null;
}

const IDLE_STATE: UseDuckDbState = {
  isTableReady: false,
  isLoadingTable: false,
  tableError: null,
};

/** Manages loading the uploaded CSV into DuckDB-WASM as a queryable table. */
export function useDuckDb() {
  const [state, setState] = useState<UseDuckDbState>(IDLE_STATE);

  const loadTable = useCallback(async (file: File) => {
    setState({ isLoadingTable: true, isTableReady: false, tableError: null });
    try {
      await loadCsvAsTable(file, MAIN_TABLE_NAME);
      setState({ isLoadingTable: false, isTableReady: true, tableError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load table into DuckDB.";
      setState({ isLoadingTable: false, isTableReady: false, tableError: message });
    }
  }, []);

  const resetTable = useCallback(() => setState(IDLE_STATE), []);

  return { ...state, loadTable, resetTable };
}
