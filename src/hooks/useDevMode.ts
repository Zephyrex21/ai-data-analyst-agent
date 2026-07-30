import { useCallback, useState } from "react";

const DEV_MODE_STORAGE_KEY = "ai-data-analyst:dev-mode";

function loadStoredDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEV_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useDevMode() {
  const [devMode, setDevModeState] = useState<boolean>(loadStoredDevMode);

  const setDevMode = useCallback((next: boolean) => {
    setDevModeState(next);
    try {
      window.localStorage.setItem(DEV_MODE_STORAGE_KEY, String(next));
    } catch {
      // Best-effort persistence only.
    }
  }, []);

  const toggleDevMode = useCallback(() => {
    setDevMode(!devMode);
  }, [devMode, setDevMode]);

  return { devMode, setDevMode, toggleDevMode };
}
