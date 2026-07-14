import { useCallback, useState } from "react";
import { parseCsvFile, type ParsedCsv } from "../lib/csv";

interface UseCsvDataState {
  data: ParsedCsv | null;
  isLoading: boolean;
  error: string | null;
}

export function useCsvData() {
  const [state, setState] = useState<UseCsvDataState>({
    data: null,
    isLoading: false,
    error: null,
  });

  const loadFile = useCallback(async (file: File) => {
    setState({ data: null, isLoading: true, error: null });
    try {
      const parsed = await parseCsvFile(file);
      setState({ data: parsed, isLoading: false, error: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong reading that file.";
      setState({ data: null, isLoading: false, error: message });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return { ...state, loadFile, reset };
}
