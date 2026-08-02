import { useEffect, useState } from "react";
import type { ParsedCsv } from "../lib/csv";
import { computeDatasetSummary, formatDatasetSummaryForWelcome } from "../lib/datasetSummary";
import { buildWelcomeSummary } from "../lib/metaAnswer";
import { runQuery } from "../lib/duckdb";

// Phase 29 fix: the original welcome message was structural-only (file name,
// row/column count) — genuinely thin. This computes the same real batched
// stats query the insights engine uses (Phase 26) and folds a couple of
// real highlights (numeric ranges, date span, top category, a strong
// correlation) into the message. Needs DuckDB to actually be ready, so this
// resolves a beat after upload rather than being available instantly the
// way the structural-only version was.
export function useWelcomeSummary(csv: ParsedCsv | null, isTableReady: boolean) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!csv || !isTableReady) {
      setText(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      let factsSentence: string | null = null;
      try {
        const summary = await computeDatasetSummary(csv, runQuery);
        factsSentence = formatDatasetSummaryForWelcome(summary);
      } catch {
        // Stats computation failing shouldn't block the welcome message —
        // fall back to the structural-only version rather than showing nothing.
        factsSentence = null;
      }
      if (!cancelled) {
        setText(buildWelcomeSummary(csv, factsSentence));
        setLoading(false);
      }
    })();

    return () => {
      // Guards against a fast second upload finishing its stats query
      // after this one, which would otherwise overwrite the newer file's
      // welcome message with the older file's stale one.
      cancelled = true;
    };
  }, [csv, isTableReady]);

  return { text, loading };
}
